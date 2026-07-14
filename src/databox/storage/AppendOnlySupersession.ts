/**
 * Supersession model for the append-only store (ADR-0018 §2; ADR-0014 supersession links).
 *
 * A correction is never an in-place edit: it is a **new** appended record that machine-linkably
 * `supersedes` the prior accepted record. The prior bytes remain retrievable and unchanged. This
 * registry records the prior→next link so the current version of a record chain is resolvable and the
 * supersession is auditable. It keeps at most one direct successor per prior record, giving a linear,
 * unambiguous chain (a second attempt to supersede the same prior is refused by the store).
 */

/**
 * A recorded supersession: a prior accepted record and the new record that supersedes it.
 */
export interface SupersessionLink {
  /** Path of the prior accepted record. */
  readonly prior: string;
  /** Path of the new record that supersedes {@link prior}. */
  readonly next: string;
  /** ISO-8601 time the link was recorded. */
  readonly recordedAt: string;
}

/**
 * Records supersession links and resolves a record chain in either direction. The interface fixes the
 * invariant (linear, retrievable, never a mutation of the prior); {@link InMemorySupersessionRegistry}
 * is the reference implementation a durable store can replace without changing the contract.
 */
export interface SupersessionRegistry {
  /** Records a prior→next supersession link. */
  record: (link: SupersessionLink) => Promise<void>;
  /** Resolves the record that directly supersedes `prior`, or `undefined` if none. */
  supersededBy: (prior: string) => Promise<string | undefined>;
  /** Resolves the prior record that `next` supersedes, or `undefined` if none. */
  supersedes: (next: string) => Promise<string | undefined>;
  /** All recorded links (for audit/projection). */
  links: () => Promise<SupersessionLink[]>;
}

/**
 * In-memory reference implementation of {@link SupersessionRegistry}. Backed by two indexes so the
 * forward (prior→next) and reverse (next→prior) resolutions each take one hop.
 */
export class InMemorySupersessionRegistry implements SupersessionRegistry {
  private readonly byPrior = new Map<string, SupersessionLink>();
  private readonly byNext = new Map<string, SupersessionLink>();

  public async record(link: SupersessionLink): Promise<void> {
    this.byPrior.set(link.prior, link);
    this.byNext.set(link.next, link);
  }

  public async supersededBy(prior: string): Promise<string | undefined> {
    return this.byPrior.get(prior)?.next;
  }

  public async supersedes(next: string): Promise<string | undefined> {
    return this.byNext.get(next)?.prior;
  }

  public async links(): Promise<SupersessionLink[]> {
    return [ ...this.byPrior.values() ];
  }
}
