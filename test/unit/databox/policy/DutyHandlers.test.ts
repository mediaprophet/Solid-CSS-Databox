import { AcceptanceReceiptSigner } from '../../../../src/databox/receipt/AcceptanceReceiptSigner';
import { InMemoryTombstoneRegistry } from '../../../../src/databox/storage/AppendOnlyTombstone';
import type { DutyInstance } from '../../../../src/databox/policy/DutyEngine';
import {
  issueReceiptHandler,
  retainEvidenceHandler,
  RetentionRegistry,
  ReviewQueue,
  signalHolderHandler,
  stageForReviewHandler,
  tombstoneHandler,
} from '../../../../src/databox/policy/DutyHandlers';
import { baseRequest, ISSUER, KID, signerKey, validCommit } from '../receipt/ReceiptTestSupport';

/** A dummy instance to satisfy the handler signature (handlers ignore it — the side effect is closed over). */
const INSTANCE: DutyInstance = { dutyId: 'd1', action: 'a', targetDigest: 'opaque:t', state: 'queued', attempts: 0 };

function signer(): AcceptanceReceiptSigner {
  return new AcceptanceReceiptSigner(ISSUER, signerKey.privateKey, KID);
}

describe('issueReceiptHandler (reuses DBX-18)', (): void => {
  it('accepts and binds the receipt digest when the signer issues.', async(): Promise<void> => {
    const outcome = await issueReceiptHandler(signer(), baseRequest())(INSTANCE);
    expect(outcome.resultState).toBe('accepted');
    expect(outcome.evidenceDigest).toMatch(/^urn:sha256:[0-9a-f]{64}$/u);
    expect(outcome.reason).toBe('receipt-issued');
  });

  it('reports a replay when the idempotency key was already issued.', async(): Promise<void> => {
    const shared = signer();
    await issueReceiptHandler(shared, baseRequest({ idempotencyKey: 'k1' }))(INSTANCE);
    const outcome = await issueReceiptHandler(shared, baseRequest({ idempotencyKey: 'k1' }))(INSTANCE);
    expect(outcome.reason).toBe('receipt-replay');
  });

  it('fails (never silently fulfills) when the signer refuses — no durable commit.', async(): Promise<void> => {
    const uncommitted = baseRequest({ durableCommit: { ...validCommit(), confirmed: false as unknown as true }});
    const outcome = await issueReceiptHandler(signer(), uncommitted)(INSTANCE);
    expect(outcome).toStrictEqual({ resultState: 'failed', reason: 'receipt-not-durably-committed' });
  });
});

describe('signalHolderHandler (queued signal, delivery is DBX-21)', (): void => {
  it('reports queued — never fulfilled (T-50).', async(): Promise<void> => {
    await expect(signalHolderHandler()(INSTANCE)).resolves
      .toStrictEqual({ resultState: 'queued', reason: 'signal-queued-awaiting-dbx21' });
  });
});

describe('retainEvidenceHandler', (): void => {
  it('records a retention entry and accepts.', async(): Promise<void> => {
    const registry = new RetentionRegistry();
    const entry = { target: 'opaque:rec-1', retentionPeriod: 'P7Y', recordedAt: '2026-07-15T00:00:00Z' };
    const outcome = await retainEvidenceHandler(registry, entry)(INSTANCE);
    expect(outcome.resultState).toBe('accepted');
    expect(registry.get('opaque:rec-1')).toStrictEqual(entry);
    expect(registry.get('unknown')).toBeUndefined();
  });
});

describe('tombstoneHandler (reuses DBX-17)', (): void => {
  it('records a governed tombstone and accepts.', async(): Promise<void> => {
    const registry = new InMemoryTombstoneRegistry();
    const state = {
      target: '/boxes/bx/rec-2',
      recordClass: 'note',
      legalBasis: 'opaque:basis-1',
      tombstonedAt: '2026-07-15T00:00:00Z',
    };
    const outcome = await tombstoneHandler(registry, state)(INSTANCE);
    expect(outcome.resultState).toBe('accepted');
    await expect(registry.isTombstoned('/boxes/bx/rec-2')).resolves.toBe(true);
  });
});

describe('stageForReviewHandler', (): void => {
  it('durably stages a submission into the governed review queue and accepts.', async(): Promise<void> => {
    const queue = new ReviewQueue();
    const item = { submissionRef: 'opaque:sub-1', recordClass: 'correction', stagedAt: '2026-07-15T00:00:00Z' };
    const outcome = await stageForReviewHandler(queue, item)(INSTANCE);
    expect(outcome.resultState).toBe('accepted');
    expect(queue.contains('opaque:sub-1')).toBe(true);
    expect(queue.contains('missing')).toBe(false);
    expect(queue.all()).toStrictEqual([ item ]);
  });
});
