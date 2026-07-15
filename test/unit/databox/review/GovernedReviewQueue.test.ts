import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../../../src/util/errors/ConflictHttpError';
import { ForbiddenHttpError } from '../../../../src/util/errors/ForbiddenHttpError';
import { NotFoundHttpError } from '../../../../src/util/errors/NotFoundHttpError';
import { caseIdFor, GovernedReviewQueue } from '../../../../src/databox/review/GovernedReviewQueue';
import { fixedClock, makeEvent, makeReviewer } from './ReviewTestSupport';

const REQ = { identityProofing: 2 } as const;

function queue(): GovernedReviewQueue {
  return new GovernedReviewQueue({ now: fixedClock(), responseWindowMs: 1000 });
}

describe('GovernedReviewQueue.stage', (): void => {
  it('stages a committed event into a pending case with a computed response-clock due time.', (): void => {
    const q = queue();
    const staged = q.stage(makeEvent());
    expect(staged.state).toBe('pending');
    expect(staged.caseId).toBe(caseIdFor('submission-abc'));
    expect(staged.event.payloadDigest).toBe(makeEvent().payloadDigest);
    expect(Date.parse(staged.dueAt)).toBe(Date.parse(staged.stagedAt) + 1000);
  });

  it('fails closed on a blank submissionRef.', (): void => {
    expect((): unknown => queue().stage(makeEvent({ submissionRef: '' }))).toThrow(BadRequestHttpError);
  });

  it('is idempotent: re-staging the same submissionRef returns the original case.', (): void => {
    const q = queue();
    const first = q.stage(makeEvent());
    const again = q.stage(makeEvent({ eventId: 'evt-2' }));
    expect(again.stagedAt).toBe(first.stagedAt);
    expect(q.list()).toHaveLength(1);
  });
});

describe('GovernedReviewQueue defaults', (): void => {
  it('uses a real clock and the default response window when no options are given.', (): void => {
    const staged = new GovernedReviewQueue().stage(makeEvent());
    // Default 10-day window: due strictly after staged.
    expect(Date.parse(staged.dueAt)).toBeGreaterThan(Date.parse(staged.stagedAt));
  });
});

describe('GovernedReviewQueue.get / require', (): void => {
  it('get returns undefined for an unknown case and the case for a known one.', (): void => {
    const q = queue();
    expect(q.get('nope')).toBeUndefined();
    const staged = q.stage(makeEvent());
    expect(q.get(staged.caseId)?.caseId).toBe(staged.caseId);
  });

  it('require throws 404 for an unknown case.', (): void => {
    expect((): unknown => queue().require('nope')).toThrow(NotFoundHttpError);
  });
});

describe('GovernedReviewQueue.claim', (): void => {
  it('claims a case for an assured reviewer (pending -> claimed).', (): void => {
    const q = queue();
    const staged = q.stage(makeEvent());
    const claimed = q.claim(staged.caseId, makeReviewer('r1', 2), REQ);
    expect(claimed.state).toBe('claimed');
    expect(claimed.reviewerId).toBe('r1');
    expect(claimed.claimedAt).toBeDefined();
  });

  it('throws 404 when the case is unknown.', (): void => {
    expect((): unknown => queue().claim('nope', makeReviewer('r1', 2), REQ)).toThrow(NotFoundHttpError);
  });

  it('refuses an under-assured reviewer (fail closed, 403).', (): void => {
    const q = queue();
    const staged = q.stage(makeEvent());
    expect((): unknown => q.claim(staged.caseId, makeReviewer('r1', 1), REQ)).toThrow(ForbiddenHttpError);
    expect(q.get(staged.caseId)?.state).toBe('pending');
  });

  it('refuses a second reviewer once claimed (no silent reassignment, 409).', (): void => {
    const q = queue();
    const staged = q.stage(makeEvent());
    q.claim(staged.caseId, makeReviewer('r1', 2), REQ);
    expect((): unknown => q.claim(staged.caseId, makeReviewer('r2', 2), REQ)).toThrow(ConflictHttpError);
  });

  it('is idempotent for the same reviewer.', (): void => {
    const q = queue();
    const staged = q.stage(makeEvent());
    const first = q.claim(staged.caseId, makeReviewer('r1', 2), REQ);
    const again = q.claim(staged.caseId, makeReviewer('r1', 2), REQ);
    expect(again.claimedAt).toBe(first.claimedAt);
  });

  it('cannot claim a disposed case (409).', (): void => {
    const q = queue();
    const staged = q.stage(makeEvent());
    q.claim(staged.caseId, makeReviewer('r1', 2), REQ);
    q.markDisposed(staged.caseId, 'disp-1', 'r1');
    expect((): unknown => q.claim(staged.caseId, makeReviewer('r1', 2), REQ)).toThrow(ConflictHttpError);
  });
});

function claimedQueue(): { q: GovernedReviewQueue; caseId: string } {
  const q = queue();
  const staged = q.stage(makeEvent());
  q.claim(staged.caseId, makeReviewer('r1', 2), REQ);
  return { q, caseId: staged.caseId };
}

describe('GovernedReviewQueue.markDisposed', (): void => {
  const claimed = claimedQueue;

  it('marks a claimed case disposed by its assigned reviewer.', (): void => {
    const { q, caseId } = claimed();
    const disposed = q.markDisposed(caseId, 'disp-1', 'r1');
    expect(disposed.state).toBe('disposed');
    expect(disposed.dispositionId).toBe('disp-1');
  });

  it('is idempotent for the same dispositionId; refuses a different one (409).', (): void => {
    const { q, caseId } = claimed();
    q.markDisposed(caseId, 'disp-1', 'r1');
    expect(q.markDisposed(caseId, 'disp-1', 'r1').state).toBe('disposed');
    expect((): unknown => q.markDisposed(caseId, 'disp-2', 'r1')).toThrow(ConflictHttpError);
  });

  it('refuses to dispose a pending (unassigned) case (403).', (): void => {
    const q = queue();
    const staged = q.stage(makeEvent());
    expect((): unknown => q.markDisposed(staged.caseId, 'disp-1', 'r1')).toThrow(ForbiddenHttpError);
  });

  it('refuses a reviewer other than the assigned one (403).', (): void => {
    const { q, caseId } = claimed();
    expect((): unknown => q.markDisposed(caseId, 'disp-1', 'rX')).toThrow(ForbiddenHttpError);
  });

  it('throws 404 for an unknown case.', (): void => {
    expect((): unknown => queue().markDisposed('nope', 'disp-1', 'r1')).toThrow(NotFoundHttpError);
  });
});

describe('GovernedReviewQueue.overdue', (): void => {
  it('lists cases past their due time that are not disposed; uses the queue clock by default.', (): void => {
    const q = new GovernedReviewQueue({ now: fixedClock(), responseWindowMs: 1000 });
    const staged = q.stage(makeEvent());
    // Explicit far-future instant → overdue.
    const future = new Date(Date.parse(staged.dueAt) + 10_000).toISOString();
    expect(q.overdue(future).map((c): string => c.caseId)).toStrictEqual([ staged.caseId ]);
    // Default clock (fixedClock advances) — the case is not yet due at the next tick.
    expect(q.overdue()).toHaveLength(0);
  });

  it('excludes a disposed case even if past due.', (): void => {
    const q = new GovernedReviewQueue({ now: fixedClock(), responseWindowMs: 1000 });
    const staged = q.stage(makeEvent());
    q.claim(staged.caseId, makeReviewer('r1', 2), REQ);
    q.markDisposed(staged.caseId, 'disp-1', 'r1');
    const future = new Date(Date.parse(staged.dueAt) + 10_000).toISOString();
    expect(q.overdue(future)).toHaveLength(0);
  });
});
