import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../util/errors/ConflictHttpError';
import { ForbiddenHttpError } from '../../util/errors/ForbiddenHttpError';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import { evaluateAssurance } from './ReviewAssurance';
import type {
  CommittedSubmissionEvent,
  ReviewCase,
  Reviewer,
  ReviewerAssuranceRequirement,
} from './ReviewTypes';

/**
 * The governed review queue (component C17, DBX-04 §49/IF-12; ADR-0016/0017/0023). It consumes COMMITTED
 * submission events (not notifications — ADR-0017) into durable review cases, gates claiming on staff
 * assignment + assurance, and exposes the response clock so overdue cases are visible. It is a reference
 * in-memory store; a durable governed queue swaps in behind the same surface (mirrors DBX-15/DBX-18 stores).
 *
 * Load-bearing behaviour:
 * - **Preserves submitter identity + payload digest.** The committed event is stored verbatim; every view
 *   returns the same event, so the two are preserved end to end (T-45).
 * - **Idempotent staging.** A re-stage of the same `submissionRef` returns the ORIGINAL case (the queue
 *   consumes a committed event exactly once — no duplicate case, T-24).
 * - **Assurance-gated, single-reviewer claiming (fail closed).** A claim requires a reviewer whose VERIFIED
 *   assurance meets the required minimum; an under-assured reviewer is refused, and a case already claimed
 *   by another reviewer cannot be re-claimed (no silent reassignment).
 */

/** Options for {@link GovernedReviewQueue}: the clock and the response-clock window. */
export interface GovernedReviewQueueOptions {
  /** ISO-8601 clock; defaults to `Date.now`. Injectable for deterministic tests. */
  readonly now?: () => string;
  /**
   * The response-clock window in milliseconds (ADR-0023 §calculated due time). A staged case is due at
   * `stagedAt + responseWindowMs`. Defaults to 10 days (a CANDIDATE window — ADR-0023 §CDR clock is gated,
   * never asserted as compliance).
   */
  readonly responseWindowMs?: number;
}

const DEFAULT_RESPONSE_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

/** The mutable internal case (only the queue mutates it; callers see the frozen {@link ReviewCase}). */
interface MutableCase {
  caseId: string;
  event: CommittedSubmissionEvent;
  state: ReviewCase['state'];
  stagedAt: string;
  dueAt: string;
  reviewerId?: string;
  claimedAt?: string;
  dispositionId?: string;
}

/** The deterministic case id for a committed submission (so a re-stage is idempotent). */
export function caseIdFor(submissionRef: string): string {
  return `review-case:${submissionRef}`;
}

export class GovernedReviewQueue {
  private readonly cases = new Map<string, MutableCase>();
  private readonly now: () => string;
  private readonly responseWindowMs: number;

  public constructor(options: GovernedReviewQueueOptions = {}) {
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.responseWindowMs = options.responseWindowMs ?? DEFAULT_RESPONSE_WINDOW_MS;
  }

  /**
   * Stage a committed submission event into the queue as a `pending` case, computing its response-clock due
   * time. Idempotent: re-staging the same `submissionRef` returns the ORIGINAL case unchanged (the committed
   * event is consumed exactly once). Fails closed on a blank submissionRef.
   */
  public stage(event: CommittedSubmissionEvent): ReviewCase {
    if (typeof event.submissionRef !== 'string' || event.submissionRef.length === 0) {
      throw new BadRequestHttpError('A committed submission event requires a non-empty submissionRef.');
    }
    const caseId = caseIdFor(event.submissionRef);
    const existing = this.cases.get(caseId);
    if (existing) {
      return this.view(existing);
    }
    const stagedAt = this.now();
    const dueMs = Date.parse(stagedAt) + this.responseWindowMs;
    const created: MutableCase = {
      caseId,
      event,
      state: 'pending',
      stagedAt,
      dueAt: new Date(dueMs).toISOString(),
    };
    this.cases.set(caseId, created);
    return this.view(created);
  }

  /** The case for `caseId`, or `undefined` if it was never staged. */
  public get(caseId: string): ReviewCase | undefined {
    const found = this.cases.get(caseId);
    return found === undefined ? undefined : this.view(found);
  }

  /** The case for `caseId`, or a 404 if it was never staged. */
  public require(caseId: string): ReviewCase {
    const found = this.get(caseId);
    if (found === undefined) {
      throw new NotFoundHttpError(`Unknown review case '${caseId}'.`);
    }
    return found;
  }

  /**
   * Claim (assign) a case to a reviewer, gated by staff assignment + assurance. Fails closed:
   * - a disposed case cannot be claimed (409);
   * - a case already claimed by a DIFFERENT reviewer cannot be re-claimed (409 — no silent reassignment);
   * - a reviewer whose VERIFIED assurance does not meet the minimum is refused (403, naming the shortfall
   *   dimension without leaking a protected fact).
   * Re-claiming by the SAME reviewer is idempotent (returns the case unchanged).
   */
  public claim(caseId: string, reviewer: Reviewer, requirement: ReviewerAssuranceRequirement): ReviewCase {
    const found = this.mutable(caseId);
    if (found.state === 'disposed') {
      throw new ConflictHttpError(`Review case '${caseId}' is already disposed and cannot be claimed.`);
    }
    if (found.reviewerId !== undefined && found.reviewerId !== reviewer.reviewerId) {
      throw new ConflictHttpError(`Review case '${caseId}' is already claimed by another reviewer.`);
    }
    const gate = evaluateAssurance(reviewer.context, requirement);
    if (!gate.met) {
      throw new ForbiddenHttpError(
        `Reviewer does not meet the assurance minimum (dimension '${gate.shortfallDimension}'); claim refused.`,
      );
    }
    if (found.reviewerId === reviewer.reviewerId) {
      // Idempotent re-claim by the same reviewer.
      return this.view(found);
    }
    found.reviewerId = reviewer.reviewerId;
    found.claimedAt = this.now();
    found.state = 'claimed';
    return this.view(found);
  }

  /**
   * Record that a case has been disposed by its assigned reviewer. Fails closed unless the case is `claimed`
   * by exactly this reviewer (an unassigned or wrong reviewer cannot mark a disposition, T-45). Idempotent
   * for the same `dispositionId`; a second, different disposition on a disposed case is refused (409).
   */
  public markDisposed(caseId: string, dispositionId: string, reviewerId: string): ReviewCase {
    const found = this.mutable(caseId);
    if (found.state === 'disposed') {
      if (found.dispositionId === dispositionId) {
        return this.view(found);
      }
      throw new ConflictHttpError(`Review case '${caseId}' is already disposed.`);
    }
    if (found.state !== 'claimed' || found.reviewerId !== reviewerId) {
      throw new ForbiddenHttpError(
        `Only the assigned reviewer of a claimed case may record its disposition (case '${caseId}').`,
      );
    }
    found.state = 'disposed';
    found.dispositionId = dispositionId;
    return this.view(found);
  }

  /** Every case in the queue (defensive frozen copies). */
  public list(): readonly ReviewCase[] {
    return [ ...this.cases.values() ].map((found): ReviewCase => this.view(found));
  }

  /**
   * The cases whose response clock has elapsed and that are NOT yet disposed (overdue), at `atIso`
   * (defaults to the queue clock). Overdue review is thereby visible (ADR-0023; DBX-04 §duty state).
   */
  public overdue(atIso: string = this.now()): readonly ReviewCase[] {
    const at = Date.parse(atIso);
    return this.list().filter(
      (item): boolean => item.state !== 'disposed' && Date.parse(item.dueAt) < at,
    );
  }

  private mutable(caseId: string): MutableCase {
    const found = this.cases.get(caseId);
    if (found === undefined) {
      throw new NotFoundHttpError(`Unknown review case '${caseId}'.`);
    }
    return found;
  }

  private view(found: MutableCase): ReviewCase {
    return Object.freeze({
      caseId: found.caseId,
      event: found.event,
      state: found.state,
      stagedAt: found.stagedAt,
      dueAt: found.dueAt,
      ...found.reviewerId === undefined ? {} : { reviewerId: found.reviewerId },
      ...found.claimedAt === undefined ? {} : { claimedAt: found.claimedAt },
      ...found.dispositionId === undefined ? {} : { dispositionId: found.dispositionId },
    });
  }
}
