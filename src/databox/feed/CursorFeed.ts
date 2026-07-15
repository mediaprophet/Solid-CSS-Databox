import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../util/errors/ConflictHttpError';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';

/**
 * Cursor / committed-event feed contract (component C15, DBX-04 §2/§5; ADR-0011; DBX-21/HAK-08).
 *
 * This — not the best-effort Solid Notifications channel — is the *authoritative* missed-event
 * recovery contract (DBX-04 §5; DBX-01 §6: CSS notifications are a hint only, no replay). It is a
 * track-agnostic pull API: a consumer presents its last cursor and receives the ordered committed
 * events after it, exactly once, within the retention window. Net-new (build). DBX-21 turns the
 * DBX-09 {@link NotImplementedCursorFeed} stub into the real {@link RetentionBoundedCursorFeed}.
 */

/**
 * One ordered committed event as exposed on the feed (a retention-bounded projection of the
 * evidence ledger, DBX-04 §6). Payload is minimal — an opaque event/resource reference, never
 * protected content (IF-08/IF-09).
 */
export interface CommittedEvent {
  /**
   * Opaque, monotonically ordered position; a client presents it back as `sinceCursor` (ADR-0011 §2
   * total ordering). Distinct from {@link eventId} so ordering does not depend on the outbox id shape.
   */
  readonly cursor: string;
  /**
   * The originating outbox/idempotency id — the stable DEDUP key (ADR-0011 §2). At-least-once delivery
   * and re-drain after a crash collapse to exactly-once because the feed ingests each `eventId` once.
   */
  readonly eventId: string;
  /**
   * Opaque tenant identifier.
   */
  readonly tenantId: string;
  /**
   * Opaque reference to the affected resource (never the bytes).
   */
  readonly resourceRef: string;
  /**
   * The activity kind (e.g. LDP `Create`).
   */
  readonly activity: string;
}

/**
 * A page of feed results.
 */
export interface CursorFeedPage {
  /**
   * The ordered events after the requested cursor (may be empty).
   */
  readonly events: readonly CommittedEvent[];
  /**
   * The cursor to present on the next pull. Equal to the input cursor when there are no more events.
   */
  readonly nextCursor: string;
}

/**
 * The authenticated per-connection cursor feed (C15, IF-09).
 */
export interface CursorFeed {
  /**
   * Pull committed events after `sinceCursor` for the given tenant, ordered and exactly-once within
   * the retention window. A cursor that has fallen outside retention MUST be rejected (fail closed),
   * never silently reset to the start, so a consumer can detect a recovery gap.
   *
   * @param tenantId - Opaque tenant identifier the feed is scoped to.
   * @param sinceCursor - The consumer's last acknowledged cursor; `undefined`/`''` starts at retention head.
   */
  pull: (tenantId: string, sinceCursor?: string) => Promise<CursorFeedPage>;
}

/** The minimal committed-event projection input the commit path / outbox drain records into the feed. */
export interface CommittedEventInput {
  /** The originating outbox/idempotency id (dedup key). */
  readonly eventId: string;
  /** Opaque reference to the affected resource (never bytes). */
  readonly resourceRef: string;
  /** The activity classifier (e.g. `Create`). */
  readonly activity: string;
}

/** A stored event carries its monotonic sequence next to the public {@link CommittedEvent}. */
interface StoredEvent {
  readonly seq: number;
  readonly event: CommittedEvent;
}

/** Encode a monotonic sequence as an opaque, lexicographically-irrelevant cursor token. */
function encodeCursor(seq: number): string {
  return `c${String(seq).padStart(15, '0')}`;
}

/** Decode a cursor token back to its sequence, failing closed on any malformed value. */
function decodeCursor(cursor: string): number {
  const match = /^c(\d{15})$/u.exec(cursor);
  if (!match) {
    throw new BadRequestHttpError('Malformed cursor (fail closed).');
  }
  return Number(match[1]);
}

function assertNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestHttpError(`Cursor feed field '${name}' must be a non-empty string.`);
  }
}

/**
 * The real per-connection cursor/event feed (component C15; ADR-0011 §2). It is a retention-bounded,
 * ORDERED, DEDUP-keyed projection of committed events — the authoritative missed-event recovery path.
 *
 * - **Total ordering.** Each ingested event is assigned a strictly monotonic sequence (never reset, even
 *   after eviction). `pull` returns exactly the events whose sequence is `> sinceCursor`, in commit order,
 *   so "after cursor X" is unambiguous and a disconnected consumer recovers every missed event exactly once.
 * - **Dedup.** {@link record} is keyed on the originating `eventId`; a re-drained event (at-least-once
 *   delivery, or a post-crash re-drain of the durable outbox) does NOT create a second logical event.
 * - **Retention window + fail-closed floor.** Only the most recent `window` events are replayable. A
 *   cursor below the retained floor is rejected with {@link ConflictHttpError} ("reconcile required") — it
 *   is NEVER silently reset to the start (that would present a truncated history as complete, ADR-0011).
 */
export class RetentionBoundedCursorFeed implements CursorFeed {
  private readonly window: number;
  private readonly logs = new Map<string, StoredEvent[]>();
  /** Monotonic next-sequence per tenant; never decreases, so it survives eviction. */
  private readonly nextSeq = new Map<string, number>();
  /** Ingested eventIds per tenant, so a re-drain of the durable outbox stays exactly-once. */
  private readonly seen = new Map<string, Map<string, CommittedEvent>>();

  public constructor(window = 1000) {
    if (!Number.isInteger(window) || window < 1) {
      throw new BadRequestHttpError('Cursor feed retention window must be a positive integer.');
    }
    this.window = window;
  }

  /**
   * Ingest one committed event as a retention-bounded projection (DBX-04 §6). Idempotent on `eventId`:
   * re-recording an already-seen event returns the ORIGINAL projected event and appends nothing, so
   * at-least-once outbox drain and post-crash re-drain both collapse to exactly-once.
   */
  public record(tenantId: string, input: CommittedEventInput): CommittedEvent {
    assertNonEmpty(tenantId, 'tenantId');
    assertNonEmpty(input.eventId, 'eventId');
    assertNonEmpty(input.resourceRef, 'resourceRef');
    assertNonEmpty(input.activity, 'activity');
    const seenForTenant = this.seen.get(tenantId) ?? new Map<string, CommittedEvent>();
    const already = seenForTenant.get(input.eventId);
    if (already) {
      return already;
    }
    const seq = this.nextSeq.get(tenantId) ?? 0;
    const event: CommittedEvent = Object.freeze({
      cursor: encodeCursor(seq),
      eventId: input.eventId,
      tenantId,
      resourceRef: input.resourceRef,
      activity: input.activity,
    });
    const log = this.logs.get(tenantId) ?? [];
    log.push({ seq, event });
    // Evict the oldest beyond the retention window; the sequence counter keeps climbing so an evicted
    // cursor is detectable as below-floor rather than being silently reissued.
    if (log.length > this.window) {
      log.shift();
    }
    this.logs.set(tenantId, log);
    this.nextSeq.set(tenantId, seq + 1);
    seenForTenant.set(input.eventId, event);
    this.seen.set(tenantId, seenForTenant);
    return event;
  }

  public async pull(tenantId: string, sinceCursor?: string): Promise<CursorFeedPage> {
    assertNonEmpty(tenantId, 'tenantId');
    const fromStart = sinceCursor === undefined || sinceCursor === '';
    const nextSeqVal = this.nextSeq.get(tenantId);
    if (nextSeqVal === undefined) {
      // The tenant has never emitted an event. A blank cursor legitimately yields an empty page; a
      // non-blank cursor references something that cannot exist here — fail closed.
      if (fromStart) {
        return { events: [], nextCursor: '' };
      }
      throw new BadRequestHttpError('Cursor is ahead of the feed head (fail closed).');
    }
    const log = this.logs.get(tenantId)!;
    const headSeq = nextSeqVal - 1;
    const firstRetainedSeq = log[0].seq;
    let since: number;
    if (fromStart) {
      since = firstRetainedSeq - 1;
    } else {
      since = decodeCursor(sinceCursor);
      if (since > headSeq) {
        throw new BadRequestHttpError('Cursor is ahead of the feed head (fail closed).');
      }
      if (since < firstRetainedSeq - 1) {
        // Events after this cursor have been evicted: a real recovery gap. Signal it explicitly so the
        // consumer falls back to full reconciliation instead of trusting a truncated history (ADR-0011).
        throw new ConflictHttpError('Cursor below the retained floor: reconcile required (recovery gap).');
      }
    }
    const events = log.filter((stored): boolean => stored.seq > since).map((stored): CommittedEvent => stored.event);
    let nextCursor: string;
    if (events.length > 0) {
      nextCursor = events.at(-1)!.cursor;
    } else {
      // Reachable only when NOT starting from the head — a from-head pull on a non-empty tenant always
      // returns at least one event — so `sinceCursor` is a defined, caught-up cursor here.
      nextCursor = sinceCursor!;
    }
    return { events, nextCursor };
  }
}

/**
 * Per-connection authorization + existence-hiding wrapper for a {@link CursorFeed} (ADR-0011 §Privacy).
 *
 * The feed is scoped to exactly one connection's tenant. A pull for any OTHER tenant — a cross-connection
 * probe — is refused with {@link NotFoundHttpError} (404, NOT 403), so a probe cannot confirm another
 * connection's existence (the same existence-hiding rule ordinary resources follow, DBX-01 §3).
 */
export class AuthorizedCursorFeed implements CursorFeed {
  private readonly inner: CursorFeed;
  private readonly connectionTenantId: string;

  public constructor(inner: CursorFeed, connectionTenantId: string) {
    if (typeof connectionTenantId !== 'string' || connectionTenantId.length === 0) {
      throw new BadRequestHttpError('An authorized cursor feed requires a non-empty connection tenant.');
    }
    this.inner = inner;
    this.connectionTenantId = connectionTenantId;
  }

  public async pull(tenantId: string, sinceCursor?: string): Promise<CursorFeedPage> {
    if (tenantId !== this.connectionTenantId) {
      // Existence-hiding: never reveal (via 403) that another tenant's feed exists.
      throw new NotFoundHttpError();
    }
    return this.inner.pull(tenantId, sinceCursor);
  }
}

/**
 * Fail-closed placeholder for {@link CursorFeed}.
 *
 * Recovery correctness depends on the durable ordered feed built by DBX-21. Until then this stub
 * throws {@link NotImplementedHttpError} rather than returning an empty page: an empty page would
 * falsely tell a recovering consumer "you have missed nothing", masking a real gap. Refusing forces
 * the caller to treat recovery as unavailable, which is the safe state. Retained alongside the real
 * {@link RetentionBoundedCursorFeed} so the DBX-09 FailClosedStubs acceptance gate stays green.
 */
/* eslint-disable unused-imports/no-unused-vars */
export class NotImplementedCursorFeed implements CursorFeed {
  public async pull(tenantId: string, sinceCursor?: string): Promise<CursorFeedPage> {
    throw new NotImplementedHttpError('Databox cursor/event feed (C15) is not implemented (DBX-21).');
  }
}
