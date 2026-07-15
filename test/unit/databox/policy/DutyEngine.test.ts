import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { HashChainedEvidenceLedger } from '../../../../src/databox/evidence/EvidenceLedgerStore';
import { DBX_DUTIES } from '../../../../src/databox/odrl/terms';
import type { DutyHandler, HandlerOutcome } from '../../../../src/databox/policy/DutyEngine';
import { DutyEngine } from '../../../../src/databox/policy/DutyEngine';
import { CONTEXT, DIGEST_A, DUTY_POLICY, fixedClock } from './PolicyTestSupport';

const TARGET = 'opaque:duty-target-1';

function engine(): { engine: DutyEngine; ledger: HashChainedEvidenceLedger } {
  const ledger = new HashChainedEvidenceLedger(fixedClock());
  return { ledger, engine: new DutyEngine(ledger, { tenantId: 't1', context: CONTEXT, policy: DUTY_POLICY }) };
}

function accept(evidenceDigest?: string): DutyHandler {
  return async(): Promise<HandlerOutcome> => ({
    resultState: 'accepted',
    reason: 'ok',
    ...evidenceDigest === undefined ? {} : { evidenceDigest },
  });
}
function fail(reason?: string): DutyHandler {
  return async(): Promise<HandlerOutcome> => ({ resultState: 'failed', ...reason === undefined ? {} : { reason }});
}
function defer(): DutyHandler {
  return async(): Promise<HandlerOutcome> => ({ resultState: 'queued', reason: 'deferred' });
}

async function activated(action = DBX_DUTIES.issueReceipt): Promise<ReturnType<typeof engine>> {
  const harness = engine();
  await harness.engine.activate({ dutyId: 'd1', action, targetDigest: TARGET });
  return harness;
}

describe('DutyEngine.activate', (): void => {
  it('creates a queued instance and appends its first evidence transition.', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated();
    expect(eng.get('d1')?.state).toBe('queued');
    expect(ledger.entries('t1')).toHaveLength(1);
    expect(ledger.entries('t1')[0].record.kind).toBe('duty-transition');
    expect(ledger.entries('t1')[0].record.policy.odrlState).toBe('queued');
    expect(ledger.verify('t1').valid).toBe(true);
  });

  it('is idempotent: re-activating returns the original and appends nothing.', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated();
    const again = await eng.activate({ dutyId: 'd1', action: DBX_DUTIES.issueReceipt, targetDigest: 'opaque:other' });
    expect(again.targetDigest).toBe(TARGET);
    expect(ledger.entries('t1')).toHaveLength(1);
  });

  it('fails closed on a blank dutyId.', async(): Promise<void> => {
    const { engine: eng } = engine();
    await expect(eng.activate({ dutyId: '', action: DBX_DUTIES.issueReceipt, targetDigest: TARGET }))
      .rejects.toThrow(BadRequestHttpError);
  });

  it('returns undefined for an unknown duty and throws when running one.', async(): Promise<void> => {
    const { engine: eng } = engine();
    expect(eng.get('nope')).toBeUndefined();
    await expect(eng.run('nope', accept())).rejects.toThrow('Unknown duty');
  });
});

describe('DutyEngine.run', (): void => {
  it('drives queued -> attempted -> accepted, binding the receipt digest.', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated();
    const result = await eng.run('d1', accept(DIGEST_A));
    expect(result.replayed).toBe(false);
    expect(result.instance.state).toBe('accepted');
    expect(result.instance.attempts).toBe(1);
    expect(result.instance.evidenceDigest).toBe(DIGEST_A);
    expect(ledger.entries('t1')).toHaveLength(3);
    expect(ledger.entries('t1')[2].record.receiptDigest).toBe(DIGEST_A);
    expect(ledger.verify('t1').valid).toBe(true);
  });

  it('a QUEUED outcome leaves the duty queued — not fulfilled (T-50).', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated(DBX_DUTIES.signalHolder);
    const result = await eng.run('d1', defer());
    expect(result.instance.state).toBe('queued');
    expect(result.replayed).toBe(false);
    // Only the activation transition exists; no attempted/accepted was appended.
    expect(ledger.entries('t1')).toHaveLength(1);
  });

  it('drives a failed outcome to a partial-decision transition with the failure reason.', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated();
    const result = await eng.run('d1', fail('channel-error'));
    expect(result.instance.state).toBe('failed');
    expect(result.instance.failureReason).toBe('channel-error');
    expect(ledger.entries('t1')[2].record.decision).toBe('partial');
  });

  it('records a failed transition with no reason, then a valid retry accepts.', async(): Promise<void> => {
    const { engine: eng } = await activated();
    const failed = await eng.run('d1', fail());
    expect(failed.instance.failureReason).toBeUndefined();
    const retried = await eng.retry('d1', accept(DIGEST_A));
    expect(retried.instance.state).toBe('accepted');
    expect(retried.instance.evidenceDigest).toBe(DIGEST_A);
  });

  it('LOW-2: fails closed on an accepted handler outcome with a non-urn evidence digest.', async(): Promise<void> => {
    const { engine: eng } = await activated();
    await expect(eng.run('d1', accept('not-a-urn-digest'))).rejects.toThrow('urn:sha256');
  });

  it('MED-3: two concurrent runs invoke the handler and append accepted EXACTLY once.', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated();
    const handler = jest.fn(accept(DIGEST_A));
    const [ first, second ] = await Promise.all([ eng.run('d1', handler), eng.run('d1', handler) ]);
    // Exactly one run performs the work; the other is an idempotent replay of the settled instance.
    expect(handler).toHaveBeenCalledTimes(1);
    expect([ first.replayed, second.replayed ].filter(Boolean)).toHaveLength(1);
    const accepted = ledger.entries('t1').filter((e): boolean => e.record.policy.odrlState === 'accepted');
    expect(accepted).toHaveLength(1);
  });

  it('is idempotent: a second run replays without re-invoking the handler (T-24).', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated();
    const handler = jest.fn(accept(DIGEST_A));
    await eng.run('d1', handler);
    const replay = await eng.run('d1', handler);
    expect(replay.replayed).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(ledger.entries('t1')).toHaveLength(3);
  });
});

describe('DutyEngine.retry / remedy / supersede / acknowledge', (): void => {
  it('only a failed duty can be retried.', async(): Promise<void> => {
    const { engine: eng } = await activated();
    await expect(eng.retry('d1', accept())).rejects.toThrow('Only a failed duty');
  });

  it('remedies a failed duty (failed → remedied).', async(): Promise<void> => {
    const { engine: eng } = await activated();
    await eng.run('d1', fail('x'));
    const remedied = await eng.remedy('d1', 'manual-remedy');
    expect(remedied.state).toBe('remedied');
  });

  it('supersedes a queued duty by an authorized policy event (queued → superseded).', async(): Promise<void> => {
    const { engine: eng } = await activated();
    const superseded = await eng.supersede('d1', 'policy-repeal');
    expect(superseded.state).toBe('superseded');
  });

  it('LOW-3: sanitizes a caller reason into a structured, non-injectable reason code.', async(): Promise<void> => {
    const { engine: eng, ledger } = await activated();
    await eng.supersede('d1', 'evil\n reason: with spaces/slashes');
    const superseded = ledger.entries('t1')[1].record.reasonCode;
    expect(superseded).toMatch(/^duty:superseded:[\w.:-]+$/u);
    expect(superseded).not.toContain(' ');
  });

  it('LOW-2: fails closed when acknowledging with a non-urn evidence digest.', async(): Promise<void> => {
    const { engine: eng } = await activated(DBX_DUTIES.acknowledge);
    await eng.run('d1', accept(DIGEST_A));
    await expect(eng.acknowledge('d1', 'not-a-urn')).rejects.toThrow('urn:sha256');
  });

  it('acknowledges ONLY a dbx:acknowledge duty, from accepted (accepted → acknowledged).', async(): Promise<void> => {
    const { engine: eng } = await activated(DBX_DUTIES.acknowledge);
    await eng.run('d1', accept(DIGEST_A));
    const acked = await eng.acknowledge('d1', DIGEST_A);
    expect(acked.state).toBe('acknowledged');
  });

  it('refuses to acknowledge a non-acknowledge duty (never inferred, ADR-0012).', async(): Promise<void> => {
    const { engine: eng } = await activated(DBX_DUTIES.issueReceipt);
    await eng.run('d1', accept(DIGEST_A));
    await expect(eng.acknowledge('d1', DIGEST_A)).rejects.toThrow('dbx:acknowledge');
  });
});
