import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';

/**
 * Cursor / committed-event feed contract (component C15, DBX-04 §2/§5; ADR-0011; DBX-21/HAK-08).
 *
 * This — not the best-effort Solid Notifications channel — is the *authoritative* missed-event
 * recovery contract (DBX-04 §5; DBX-01 §6: CSS notifications are a hint only, no replay). It is a
 * track-agnostic pull API: a consumer presents its last cursor and receives the ordered committed
 * events after it, exactly once, within the retention window. Net-new (build). Implemented by DBX-21.
 */

/**
 * One ordered committed event as exposed on the feed (a retention-bounded projection of the
 * evidence ledger, DBX-04 §6). Payload is minimal — an opaque event/resource reference, never
 * protected content (IF-08/IF-09).
 */
export interface CommittedEvent {
  /**
   * Opaque, monotonically ordered event id; doubles as the cursor position.
   */
  readonly cursor: string;
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
   * @param sinceCursor - The consumer's last acknowledged cursor; `undefined` starts at retention head.
   */
  pull: (tenantId: string, sinceCursor?: string) => Promise<CursorFeedPage>;
}

/**
 * Fail-closed placeholder for {@link CursorFeed}.
 *
 * Recovery correctness depends on the durable ordered feed built by DBX-21. Until then this stub
 * throws {@link NotImplementedHttpError} rather than returning an empty page: an empty page would
 * falsely tell a recovering consumer "you have missed nothing", masking a real gap. Refusing forces
 * the caller to treat recovery as unavailable, which is the safe state.
 */
/* eslint-disable unused-imports/no-unused-vars */
export class NotImplementedCursorFeed implements CursorFeed {
  public async pull(tenantId: string, sinceCursor?: string): Promise<CursorFeedPage> {
    throw new NotImplementedHttpError('Databox cursor/event feed (C15) is not implemented (DBX-21).');
  }
}
