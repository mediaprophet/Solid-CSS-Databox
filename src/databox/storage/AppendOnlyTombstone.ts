/**
 * Tombstone model for the append-only store (ADR-0018 §3; T-29).
 *
 * Lawful deletion is never a destructive rewrite. It records a **tombstone**: the fact that an accepted
 * resource existed, its class, the legal-basis reference and the time, plus an evidence event. The
 * original bytes are never silently destroyed; the tombstone is an append, not a mutation of history.
 * The registry also lets the store distinguish "tombstoned" from "never existed" (a tombstoned path is
 * recorded here; a never-existed path is absent from both here and the source).
 */

/**
 * A governed tombstone request. The legal-basis reference is mandatory: a request lacking one is
 * rejected and no deletion is performed (ADR-0018 failure behaviour).
 */
export interface TombstoneRequest {
  /** Record class of the resource being tombstoned (structural only; no payload content). */
  readonly recordClass: string;
  /** Reference to the legal basis authorising the deletion (mandatory). */
  readonly legalBasis: string;
}

/**
 * The recorded state of a tombstoned resource. Carries no payload — only the fact of prior existence and
 * the governance metadata.
 */
export interface TombstoneState {
  /** Path of the tombstoned resource. */
  readonly target: string;
  /** Record class of the tombstoned resource. */
  readonly recordClass: string;
  /** Reference to the legal basis for the deletion. */
  readonly legalBasis: string;
  /** ISO-8601 time the resource was tombstoned. */
  readonly tombstonedAt: string;
}

/**
 * Records tombstone state and answers the tombstoned/never-existed distinction. The interface fixes the
 * invariant (a tombstone is a recorded state, never a destroyed byte-history);
 * {@link InMemoryTombstoneRegistry} is the reference implementation.
 */
export interface TombstoneRegistry {
  /** Records that a resource has been tombstoned. */
  mark: (state: TombstoneState) => Promise<void>;
  /** Resolves the tombstone state of a resource, or `undefined` if it is not tombstoned. */
  get: (target: string) => Promise<TombstoneState | undefined>;
  /** Whether a resource is tombstoned. */
  isTombstoned: (target: string) => Promise<boolean>;
}

/**
 * In-memory reference implementation of {@link TombstoneRegistry}. A durable, access-audited store can
 * replace it without changing the contract.
 */
export class InMemoryTombstoneRegistry implements TombstoneRegistry {
  private readonly byTarget = new Map<string, TombstoneState>();

  public async mark(state: TombstoneState): Promise<void> {
    this.byTarget.set(state.target, state);
  }

  public async get(target: string): Promise<TombstoneState | undefined> {
    return this.byTarget.get(target);
  }

  public async isTombstoned(target: string): Promise<boolean> {
    return this.byTarget.has(target);
  }
}
