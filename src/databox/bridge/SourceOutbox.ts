import { createHash } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { TenantScope } from '../tenant/TenantContext';
import type { BridgeReconciliation, SourceEvent } from './BridgeTypes';

/**
 * The transactional source-outbox (component C21 source ingest, IF-10; ADR-0016 HD-12). A source system
 * commits a **business event and a source-outbox row in the same transaction**; the bridge later drains the
 * outbox and deposits the resolved record. This module is the reference in-memory store behind the
 * {@link TransactionalSourceOutbox} interface — a production deployment swaps in a durable store (a real
 * relational outbox) without changing the surface.
 *
 * Two invariants hold here:
 * - **Atomic commit.** {@link TransactionalSourceOutbox.commit} appends the business record AND its outbox
 *   row together (they are the same in-memory operation); a partial commit is impossible.
 * - **Stable source-event idempotency (T-24, HD-12).** A re-commit of the SAME namespaced tuple
 *   `organisation/program/source-system/event-type/source-event-id` returns the ORIGINAL committed row —
 *   it never mints a second business event or a per-attempt id. Replaying a source event therefore cannot
 *   create a duplicate logical record downstream.
 */

/** A committed source event: the business event, its committed business-record id, and its reconciliation. */
export interface CommittedSourceEvent {
  /** The committed business event. */
  readonly event: SourceEvent;
  /** The opaque business-record id assigned at commit (source-system primary reference, opaque). */
  readonly businessRecordId: string;
  /** ISO-8601 commit instant. */
  readonly committedAt: string;
  /** The latest source→Databox reconciliation for this event, once a drain has attempted it. */
  readonly reconciliation?: BridgeReconciliation;
}

/**
 * The transactional source-outbox contract. Implementations MUST commit the business event and the outbox
 * row atomically and MUST be idempotent on the namespaced source-event tuple (a retry reuses the same key).
 */
export interface TransactionalSourceOutbox {
  /** Commit a business event + outbox row atomically; a re-commit of the same tuple returns the original. */
  commit: (event: SourceEvent) => CommittedSourceEvent;
  /** The committed rows for a tenant scope still needing a drain (not yet `reconciled`), in commit order. */
  drain: (scope: TenantScope) => readonly CommittedSourceEvent[];
  /** Record the reconciliation for a committed event (observable; keeps the row pending unless reconciled). */
  markReconciled: (sourceEventId: string, reconciliation: BridgeReconciliation) => void;
  /** The latest reconciliation for a committed event, or `undefined` if it was never drained. */
  reconciliation: (sourceEventId: string) => BridgeReconciliation | undefined;
}

/** Injectable seams for {@link InMemorySourceOutbox}; defaulted to a deterministic id + clock. */
export interface SourceOutboxOptions {
  /** Supplies the commit timestamp (default: `Date.now` as ISO-8601). */
  readonly clock?: () => string;
}

const REQUIRED_FIELDS: (keyof SourceEvent)[] =
  [ 'organisation', 'program', 'sourceSystem', 'eventType', 'sourceEventId', 'recordClass' ];

/** The stable namespaced source-event tuple key (HD-12), used to dedupe re-commits and index the store. */
function tupleKey(event: SourceEvent): string {
  return [ event.organisation, event.program, event.sourceSystem, event.eventType, event.sourceEventId ]
    .map((part): string => encodeURIComponent(part))
    .join('/');
}

/**
 * In-memory reference implementation of {@link TransactionalSourceOutbox}. Backed by an insertion-ordered
 * map keyed by the namespaced tuple, so commit order is preserved and a re-commit collapses onto the
 * original row.
 */
export class InMemorySourceOutbox implements TransactionalSourceOutbox {
  private readonly clock: () => string;
  /** Insertion-ordered by first commit; the value is mutable only in its `reconciliation` field. */
  private readonly committed = new Map<string, CommittedSourceEvent>();

  public constructor(options: SourceOutboxOptions = {}) {
    this.clock = options.clock ?? ((): string => new Date().toISOString());
  }

  public commit(event: SourceEvent): CommittedSourceEvent {
    for (const field of REQUIRED_FIELDS) {
      const value = event[field];
      if (typeof value !== 'string' || value.length === 0) {
        throw new BadRequestHttpError(`Source event field '${field}' must be a non-empty string (fail closed).`);
      }
    }
    const key = tupleKey(event);
    const existing = this.committed.get(key);
    if (existing) {
      // Idempotent re-commit: the business event + outbox row already exist; never mint a second (T-24).
      return existing;
    }
    // The business-record id is a stable, opaque function of the tuple (never the raw customerId).
    const businessRecordId = `src-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
    const record: CommittedSourceEvent = { event, businessRecordId, committedAt: this.clock() };
    this.committed.set(key, record);
    return record;
  }

  public drain(scope: TenantScope): readonly CommittedSourceEvent[] {
    const pending: CommittedSourceEvent[] = [];
    for (const record of this.committed.values()) {
      const inScope = record.event.organisation === scope.organisation && record.event.program === scope.program;
      if (inScope && record.reconciliation?.status !== 'reconciled') {
        pending.push(record);
      }
    }
    return pending;
  }

  public markReconciled(sourceEventId: string, reconciliation: BridgeReconciliation): void {
    for (const [ key, record ] of this.committed) {
      if (record.event.sourceEventId === sourceEventId) {
        this.committed.set(key, { ...record, reconciliation });
        return;
      }
    }
    throw new BadRequestHttpError(`No committed source event for id '${sourceEventId}' (fail closed).`);
  }

  public reconciliation(sourceEventId: string): BridgeReconciliation | undefined {
    for (const record of this.committed.values()) {
      if (record.event.sourceEventId === sourceEventId) {
        return record.reconciliation;
      }
    }
    return undefined;
  }
}
