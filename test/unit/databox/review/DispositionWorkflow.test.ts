import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../../../src/util/errors/ConflictHttpError';
import { ForbiddenHttpError } from '../../../../src/util/errors/ForbiddenHttpError';
import { HashChainedEvidenceLedger } from '../../../../src/databox/evidence/EvidenceLedgerStore';
import { AppendOnlyDispositionStore } from '../../../../src/databox/review/AppendOnlyDispositionStore';
import { GovernedReviewQueue } from '../../../../src/databox/review/GovernedReviewQueue';
import {
  DispositionWorkflow,
  SyntheticSourceOfRecord,
} from '../../../../src/databox/review/DispositionWorkflow';
import { verifyDisposition } from '../../../../src/databox/review/SignedDisposition';
import type { DispositionDecision } from '../../../../src/databox/review/ReviewTypes';
import { fixedClock, KID, makeEvent, makeReviewer, signerKey } from './ReviewTestSupport';

const REQ = { identityProofing: 2 } as const;
const CASE_ID = 'review-case:submission-abc';

interface Built {
  readonly workflow: DispositionWorkflow;
  readonly ledger: HashChainedEvidenceLedger;
  readonly queue: GovernedReviewQueue;
  readonly store: AppendOnlyDispositionStore;
  readonly sor: SyntheticSourceOfRecord;
}

function build(overrides: Partial<Parameters<typeof makeWorkflow>[0]> = {}): Built {
  return makeWorkflow({ ...overrides });
}

function makeWorkflow(opts: {
  dispositionId?: () => string;
  sor?: SyntheticSourceOfRecord;
  store?: AppendOnlyDispositionStore;
}): Built {
  const ledger = new HashChainedEvidenceLedger(fixedClock());
  const queue = new GovernedReviewQueue({ now: fixedClock(), responseWindowMs: 1000 });
  const store = opts.store ?? new AppendOnlyDispositionStore();
  const sor = opts.sor ?? new SyntheticSourceOfRecord({ 'record:v1': `urn:sha256:${'e'.repeat(64)}` }, fixedClock());
  const workflow = new DispositionWorkflow({
    ledger,
    signingKey: signerKey.privateKey,
    verificationMethod: KID,
    queue,
    store,
    sourceOfRecord: sor,
    now: fixedClock(),
    ...opts.dispositionId === undefined ? {} : { dispositionId: opts.dispositionId },
  });
  return { workflow, ledger, queue, store, sor };
}

function correction(overrides: Partial<DispositionDecision> = {}): DispositionDecision {
  return {
    caseId: CASE_ID,
    outcomeKind: 'corrected',
    reasonCode: 'accepted-correction',
    supersedingRecordRef: 'record:v2',
    ...overrides,
  };
}

async function stagedAndClaimed(built: Built, level = 2): Promise<void> {
  await built.workflow.stage(makeEvent({ targetRecordRef: 'record:v1' }));
  await built.workflow.claim(CASE_ID, makeReviewer('reviewer-1', level), REQ);
}

describe('DispositionWorkflow.stage', (): void => {
  it('stages a committed event and fulfils the stageForReview duty (durable evidence).', async(): Promise<void> => {
    const built = build();
    const { case: staged, dutyId } = await built.workflow.stage(makeEvent());
    expect(staged.state).toBe('pending');
    expect(built.workflow.duty(dutyId)?.state).toBe('accepted');
    // Queued + attempted + accepted duty transitions, all hash-chained.
    expect(built.ledger.entries('t1')).toHaveLength(3);
    expect(built.ledger.verify('t1').valid).toBe(true);
    // The submitter is bound as the acting party (reconstructable actor).
    expect(built.ledger.entries('t1')[0].record.actor.webId).toBe('pairwise:submitter-1');
  });

  it('is idempotent: re-staging does not re-run the duty or duplicate evidence.', async(): Promise<void> => {
    const built = build();
    await built.workflow.stage(makeEvent());
    await built.workflow.stage(makeEvent({ eventId: 'evt-2' }));
    expect(built.ledger.entries('t1')).toHaveLength(3);
  });

  it('fails closed on a blank submitter reference.', async(): Promise<void> => {
    const built = build();
    await expect(built.workflow.stage(makeEvent({ submitter: { submitterRef: '' }})))
      .rejects.toThrow(BadRequestHttpError);
  });

  it('does NOT touch the source of record on staging (T-45).', async(): Promise<void> => {
    const built = build();
    await built.workflow.stage(makeEvent({ targetRecordRef: 'record:v1' }));
    expect(built.sor.cases()).toHaveLength(0);
    expect(built.sor.recordDigest('record:v1')).toBe(`urn:sha256:${'e'.repeat(64)}`);
  });

  it('binds a minimal submitter (no distinct actor/issuer) as the acting party.', async(): Promise<void> => {
    const built = build();
    await built.workflow.stage(makeEvent({ submitter: { submitterRef: 'pairwise:only' }}));
    const actor = built.ledger.entries('t1')[0].record.actor;
    expect(actor.webId).toBe('pairwise:only');
    expect(actor.actor).toBe('pairwise:only');
    expect(actor.issuer).toBeUndefined();
  });
});

describe('DispositionWorkflow.claim', (): void => {
  it('assigns an assured reviewer and records the actor transfer as evidence.', async(): Promise<void> => {
    const built = build();
    await built.workflow.stage(makeEvent());
    const claimed = await built.workflow.claim(CASE_ID, makeReviewer('reviewer-1', 3), REQ);
    expect(claimed.state).toBe('claimed');
    const claimRecord = built.ledger.entries('t1').find((e): boolean => e.record.kind === 'review-claim');
    expect(claimRecord?.record.actor.webId).toBe('https://id.example/reviewer#me');
    expect(built.sor.cases()).toHaveLength(0);
  });

  it('refuses an under-assured reviewer (fail closed).', async(): Promise<void> => {
    const built = build();
    await built.workflow.stage(makeEvent());
    await expect(built.workflow.claim(CASE_ID, makeReviewer('reviewer-1', 1), REQ)).rejects.toThrow(ForbiddenHttpError);
  });
});

describe('DispositionWorkflow.recordDisposition — fail closed (no SoR write before disposition)', (): void => {
  it('refuses to dispose an unclaimed (pending) case; nothing signed/appended/routed.', async(): Promise<void> => {
    const built = build();
    await built.workflow.stage(makeEvent({ targetRecordRef: 'record:v1' }));
    await expect(built.workflow.recordDisposition(makeReviewer('reviewer-1', 3), correction(), REQ))
      .rejects.toThrow(ForbiddenHttpError);
    expect(built.store.all()).toHaveLength(0);
    expect(built.sor.cases()).toHaveLength(0);
    expect(built.queue.get(CASE_ID)?.state).toBe('pending');
  });

  it('refuses a reviewer other than the assigned one.', async(): Promise<void> => {
    const built = build();
    await stagedAndClaimed(built);
    await expect(built.workflow.recordDisposition(makeReviewer('intruder', 3), correction(), REQ))
      .rejects.toThrow(ForbiddenHttpError);
    expect(built.store.all()).toHaveLength(0);
    expect(built.sor.cases()).toHaveLength(0);
  });

  it('refuses when the reviewer no longer meets the assurance minimum (defence in depth).', async(): Promise<void> => {
    const built = build();
    // Claimed meeting REQ (identityProofing>=2 at level 2), but disposed under a HIGHER requirement.
    await stagedAndClaimed(built, 2);
    const reviewer = makeReviewer('reviewer-1', 2);
    await expect(built.workflow.recordDisposition(reviewer, correction(), { identityProofing: 5 }))
      .rejects.toThrow(ForbiddenHttpError);
    expect(built.store.all()).toHaveLength(0);
    expect(built.sor.cases()).toHaveLength(0);
  });
});

describe('DispositionWorkflow.recordDisposition — authorized', (): void => {
  it('signs, appends linked, disposes, fulfils the duty and routes a governed source case.', async(): Promise<void> => {
    const built = build({ dispositionId: (): string => 'disp-1' });
    await stagedAndClaimed(built, 3);
    const result = await built.workflow.recordDisposition(makeReviewer('reviewer-1', 3), correction(), REQ);

    expect(result.disposed).toBe(true);
    // The disposition is appended (linked to the submission), never overwriting it.
    expect(built.store.get('disp-1')).toBe(result.signed);
    expect(built.store.forSubmission('submission-abc')).toHaveLength(1);
    // Signed + verifiable; preserves submitter identity + payload digest end to end.
    const envelope = verifyDisposition(result.signed, signerKey.publicKey);
    expect(envelope.submitter.submitterRef).toBe('pairwise:submitter-1');
    expect(envelope.payloadDigest).toBe(makeEvent().payloadDigest);
    expect(envelope.links.supersedes).toBe('record:v2');
    // The disposition duty is fulfilled; the case is disposed.
    expect(built.workflow.duty(result.dutyId)?.state).toBe('accepted');
    expect(built.queue.get(CASE_ID)?.state).toBe('disposed');
    // A governed source case is opened AFTER disposition — never an in-place source rewrite.
    expect(result.sourceCase?.supersedingRecordRef).toBe('record:v2');
    expect(built.sor.cases()).toHaveLength(1);
    expect(built.sor.recordDigest('record:v1')).toBe(`urn:sha256:${'e'.repeat(64)}`);
    // The reasoned decision is reconstructable from evidence.
    const disp = built.ledger.entries('t1').find((e): boolean => e.record.kind === 'disposition-recorded');
    expect(disp?.record.disposition).toBe('corrected');
    expect(disp?.record.receiptDigest).toBe(result.signed.envelopeDigest);
  });

  it('a no-change disposition disposes without routing a source case.', async(): Promise<void> => {
    const built = build({ dispositionId: (): string => 'disp-nc' });
    await stagedAndClaimed(built, 3);
    const decision = correction({
      outcomeKind: 'no-change',
      supersedingRecordRef: undefined,
      appealRoute: 'appeal:body',
    });
    const result = await built.workflow.recordDisposition(makeReviewer('reviewer-1', 3), decision, REQ);
    expect(result.disposed).toBe(true);
    expect(result.sourceCase).toBeUndefined();
    expect(built.sor.cases()).toHaveLength(0);
  });

  it('makes a FAILED disposition duty visible on an append conflict (no SoR write).', async(): Promise<void> => {
    const store = new AppendOnlyDispositionStore();
    const built = build({ dispositionId: (): string => 'dup', store });
    await stagedAndClaimed(built, 3);
    // Pre-append a disposition under the id the factory will mint → the workflow append conflicts (409).
    const pre = makeWorkflow({ dispositionId: (): string => 'dup' });
    await stagedAndClaimed(pre, 3);
    const first = await pre.workflow.recordDisposition(makeReviewer('reviewer-1', 3), correction(), REQ);
    store.append(first.signed);

    const result = await built.workflow.recordDisposition(makeReviewer('reviewer-1', 3), correction(), REQ);
    expect(result.disposed).toBe(false);
    expect(built.workflow.duty(result.dutyId)?.state).toBe('failed');
    expect(built.workflow.failedDuties().map((d): string => d.dutyId)).toContain(result.dutyId);
    expect(built.queue.get(CASE_ID)?.state).toBe('claimed');
    expect(built.sor.cases()).toHaveLength(0);
  });
});

describe('DispositionWorkflow — visibility + defaults', (): void => {
  it('exposes overdue cases through the queue (default clock and explicit instant).', async(): Promise<void> => {
    const built = build();
    const { case: staged } = await built.workflow.stage(makeEvent());
    const future = new Date(Date.parse(staged.dueAt) + 10_000).toISOString();
    expect(built.workflow.overdueCases(future).map((c): string => c.caseId)).toStrictEqual([ staged.caseId ]);
    expect(built.workflow.overdueCases()).toHaveLength(0);
  });

  it('returns undefined for an unknown duty.', async(): Promise<void> => {
    const built = build();
    expect(built.workflow.duty('nope')).toBeUndefined();
  });

  it('constructs with default queue/store/source-of-record when none are injected.', async(): Promise<void> => {
    const workflow = new DispositionWorkflow({
      ledger: new HashChainedEvidenceLedger(fixedClock()),
      signingKey: signerKey.privateKey,
      verificationMethod: KID,
    });
    const { case: staged } = await workflow.stage(makeEvent());
    await workflow.claim(staged.caseId, makeReviewer('reviewer-1', 3), REQ);
    const result = await workflow.recordDisposition(makeReviewer('reviewer-1', 3), correction(), REQ);
    expect(result.disposed).toBe(true);
    expect(workflow.store.has(result.signed.envelope.dispositionId)).toBe(true);
  });
});

describe('SyntheticSourceOfRecord', (): void => {
  it('opens a governed correction case without rewriting the seeded source record.', (): void => {
    const sor = new SyntheticSourceOfRecord({ 'record:v1': `urn:sha256:${'e'.repeat(64)}` }, fixedClock());
    const opened = sor.openCorrectionCase({
      supersedingRecordRef: 'record:v2',
      dispositionId: 'd1',
      priorRecordRef: 'record:v1',
    });
    expect(opened.priorRecordRef).toBe('record:v1');
    expect(opened.caseRef).toBe('governed-case:record:v2');
    expect(sor.recordDigest('record:v1')).toBe(`urn:sha256:${'e'.repeat(64)}`);
    expect(sor.recordDigest('missing')).toBeUndefined();
    expect(sor.cases()).toHaveLength(1);
  });

  it('opens a governed case without a prior record ref.', (): void => {
    const sor = new SyntheticSourceOfRecord();
    expect(sor.openCorrectionCase({ supersedingRecordRef: 'record:v2', dispositionId: 'd1' }).priorRecordRef)
      .toBeUndefined();
  });

  it('refuses a duplicate governed case for the same superseding record (409).', (): void => {
    const sor = new SyntheticSourceOfRecord();
    sor.openCorrectionCase({ supersedingRecordRef: 'record:v2', dispositionId: 'd1' });
    expect((): unknown => sor.openCorrectionCase({ supersedingRecordRef: 'record:v2', dispositionId: 'd2' }))
      .toThrow(ConflictHttpError);
  });
});
