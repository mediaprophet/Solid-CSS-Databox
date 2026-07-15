import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';

/**
 * The **durable-commit dependency** the acceptance receipt hangs off (ADR-0019 §Never accept before durable
 * commit; DBX-04 §7.0 commit protocol, IF-05). The §7.0 commit point is a single-store transaction inside the
 * external evidence ledger (C13): the evidence event + outbox record are appended atomically, and ONLY on the
 * durable confirm does the operation become ACCEPTED. A signed acceptance receipt (IF-06) is issued strictly
 * AFTER that confirm — never before (a receipt issued before durable commit could attest an event that never
 * durably happened; that alternative is rejected in ADR-0019).
 *
 * This models the dependency as a first-class signal so the invariant is testable and fail-closed: the signer
 * refuses to issue unless a confirmed {@link DurableCommit} for the transaction exists.
 */

/**
 * A confirmed durable C13 commit signal for one accepted operation. `confirmed` is a **literal `true`** so a
 * half-built or optimistic pre-commit object cannot be passed off as a durable commit (fail closed). It also
 * carries the committed payload digest, which the signer cross-checks against the receipt binding — the
 * receipt attests the exact bytes that were durably committed, not some other payload.
 */
export interface DurableCommit {
  /** The C13 ledger-assigned event id of the durable commit (the receipt binds this as `commitEventId`). */
  readonly eventId: string;
  /** ISO-8601 instant the commit was durably confirmed (the receipt's `acceptedAt` defaults to this). */
  readonly committedAt: string;
  /** `urn:sha256:<hex>` of the exact payload that was durably committed. */
  readonly payloadDigest: string;
  /** MUST be the literal `true`: the durable confirm signal. Anything else is not a durable commit. */
  readonly confirmed: true;
}

const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;

/**
 * Assert `commit` is a well-formed, confirmed durable commit — fail closed otherwise. This is the gate that
 * enforces no-receipt-before-durable-commit: an absent, unconfirmed or malformed signal raises rather than
 * letting a receipt be issued (ADR-0019 §Failure — if durable commit fails, NO receipt is issued).
 */
export function assertDurableCommit(commit: DurableCommit | undefined): DurableCommit {
  if (typeof commit !== 'object' || commit === null) {
    throw new BadRequestHttpError(
      'No durable-commit signal: a receipt is never issued before durable commit (ADR-0019).',
    );
  }
  // Cast through `unknown`: `confirmed` is typed as the literal `true`, but the runtime input may lie, so the
  // fail-closed check must actually inspect the value rather than be optimised away as always-true.
  if ((commit.confirmed as unknown) !== true) {
    throw new BadRequestHttpError(
      'Durable commit is not confirmed: refusing to issue an acceptance receipt (fail closed).',
    );
  }
  if (typeof commit.eventId !== 'string' || commit.eventId.length === 0) {
    throw new BadRequestHttpError('Durable commit is missing a C13 event id.');
  }
  if (typeof commit.committedAt !== 'string' || Number.isNaN(Date.parse(commit.committedAt))) {
    throw new BadRequestHttpError('Durable commit has an unparseable committedAt.');
  }
  if (typeof commit.payloadDigest !== 'string' || !SHA256_URN.test(commit.payloadDigest)) {
    throw new BadRequestHttpError('Durable commit payloadDigest must be a urn:sha256:<64 hex> digest.');
  }
  return commit;
}

/**
 * The reference model of the §7.0 commit dependency: durable C13 commits are recorded per transaction, and a
 * receipt is only issuable once one exists. Before {@link confirm}, {@link signalFor} returns `undefined` and
 * the signer therefore cannot (and does not) issue — this is the no-receipt-before-commit ordering made
 * explicit. In production this is the transactional-outbox/ledger boundary; here it is the in-memory seam.
 */
export class DurableCommitCoordinator {
  private readonly commits = new Map<string, DurableCommit>();

  /**
   * Record the durable C13 commit for `transaction` (the §7.0 commit point). Idempotent: a repeated confirm
   * for the same transaction returns the ORIGINAL commit (never a second logical commit), so a retried
   * deposit that re-commits observes the original outcome.
   */
  public confirm(transaction: string, commit: DurableCommit): DurableCommit {
    assertDurableCommit(commit);
    if (typeof transaction !== 'string' || transaction.length === 0) {
      throw new BadRequestHttpError('Durable commit requires a non-empty transaction id.');
    }
    const existing = this.commits.get(transaction);
    if (existing) {
      return existing;
    }
    this.commits.set(transaction, commit);
    return commit;
  }

  /** The confirmed durable commit for `transaction`, or `undefined` if none has committed yet. */
  public signalFor(transaction: string): DurableCommit | undefined {
    return this.commits.get(transaction);
  }
}
