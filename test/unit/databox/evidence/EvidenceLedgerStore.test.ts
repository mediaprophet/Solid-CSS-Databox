import { buildAuditRecord } from '../../../../src/databox/evidence/AuditEvidence';
import {
  HashChainedEvidenceLedger,
  LedgerEvidenceSink,
} from '../../../../src/databox/evidence/EvidenceLedgerStore';
import type { OutboxRecord } from '../../../../src/databox/evidence/AuditEvidence';
import type {
  SupersessionEvidence,
  TombstoneEvidence,
} from '../../../../src/databox/storage/AppendOnlyEvidence';
import { normalizeSha256 } from '../../../../src/databox/proof/Canonicalization';
import { allowInput, DELEGATED_CONTEXT, fixedClock, FULL_CONTEXT, POLICY } from './EvidenceTestSupport';

function record(overrides = {}): ReturnType<typeof buildAuditRecord> {
  return buildAuditRecord(allowInput(overrides), FULL_CONTEXT);
}

const OUTBOX: OutboxRecord = {
  eventId: 'evt-1',
  tenantId: 't1',
  resourceRef: 'opaque:res-1',
  activity: 'Create',
};

describe('HashChainedEvidenceLedger', (): void => {
  it('appends a genesis-anchored, hash-chained entry and verifies the chain.', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    const first = await ledger.append({ tenantId: 't1', record: record() });
    const second = await ledger.append({ tenantId: 't1', record: record({ reasonCode: 'ok2' }) });
    expect(first.sequence).toBe(0);
    expect(first.prevDigest).toMatch(/^urn:sha256:0{64}$/u);
    expect(second.sequence).toBe(1);
    expect(second.prevDigest).toBe(first.entryDigest);
    expect(ledger.verify('t1')).toStrictEqual({ valid: true, checked: 2 });
    expect(ledger.tenants()).toStrictEqual([ 't1' ]);
  });

  it('atomically binds the outbox record in the SAME committed entry (§7.0 commit).', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    const entry = await ledger.append({ tenantId: 't1', record: record(), outbox: OUTBOX });
    expect(entry.outbox).toStrictEqual(OUTBOX);
    // The outbox is inside the digested entry, so it cannot be detached without breaking the chain.
    expect(ledger.verify('t1').valid).toBe(true);
  });

  it('rejects a cross-tenant outbox and a malformed outbox (fail closed).', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    await expect(ledger.append({ tenantId: 't1', record: record(), outbox: { ...OUTBOX, tenantId: 't2' }}))
      .rejects.toThrow('no cross-tenant outbox');
    await expect(ledger.append({ tenantId: 't1', record: record(), outbox: { ...OUTBOX, eventId: '' }}))
      .rejects.toThrow(`'outbox.eventId'`);
    await expect(ledger.append({ tenantId: 't1', record: record(), outbox: { ...OUTBOX, resourceRef: '' }}))
      .rejects.toThrow(`'outbox.resourceRef'`);
    await expect(ledger.append({ tenantId: 't1', record: record(), outbox: { ...OUTBOX, activity: '' }}))
      .rejects.toThrow(`'outbox.activity'`);
  });

  it('fails closed on a blank tenant or a non-object record, committing nothing.', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    await expect(ledger.append({ tenantId: '', record: record() })).rejects.toThrow(`'tenantId'`);
    await expect(ledger.append({ tenantId: 't1', record: null as unknown as ReturnType<typeof record> }))
      .rejects.toThrow('bound record object');
    expect(ledger.entries('t1')).toStrictEqual([]);
  });

  it('keeps tenant chains isolated (no cross-tenant entries).', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    await ledger.append({ tenantId: 't1', record: record() });
    await ledger.append({ tenantId: 't2', record: record() });
    expect(ledger.entries('t1')).toHaveLength(1);
    expect(ledger.entries('t2')).toHaveLength(1);
    expect(ledger.entries('t2')[0].prevDigest).toMatch(/^urn:sha256:0{64}$/u);
    expect(ledger.verify('t1').valid).toBe(true);
    expect(ledger.verify('t2').valid).toBe(true);
  });

  it('is EXTERNAL and append-only: no update/delete surface, committed entries are frozen.', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    const entry = await ledger.append({ tenantId: 't1', record: record() });
    const surface = ledger as unknown as Record<string, unknown>;
    // An ordinary Pod mutation verb has no counterpart here — the ledger cannot be rewritten through it.
    expect(surface.update).toBeUndefined();
    expect(surface.delete).toBeUndefined();
    expect(surface.set).toBeUndefined();
    expect(Object.isFrozen(entry)).toBe(true);
    expect((): unknown => (entry as unknown as { sequence: number }).sequence = 99).toThrow(TypeError);
    // Entries() returns a defensive copy: mutating it does not rewrite the ledger.
    const copy = ledger.entries('t1');
    (copy as unknown[]).push({});
    expect(ledger.entries('t1')).toHaveLength(1);
  });

  it('uses a real ISO clock by default when none is injected.', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger();
    const entry = await ledger.append({ tenantId: 't1', record: record() });
    expect(Number.isNaN(Date.parse(entry.recordedAt))).toBe(false);
  });
});

describe('LedgerEvidenceSink (the DBX-17 AppendOnlyEvidenceSink against C13)', (): void => {
  const superseded: SupersessionEvidence = {
    kind: 'supersession',
    target: '/boxes/bx/rec-1',
    recordedAt: '2026-07-15T10:00:00.000Z',
    supersedes: '/boxes/bx/rec-0',
    supersededBy: '/boxes/bx/rec-1',
  };
  const tombstoned: TombstoneEvidence = {
    kind: 'tombstone',
    target: '/boxes/bx/rec-2',
    recordedAt: '2026-07-15T10:00:01.000Z',
    recordClass: 'note',
    legalBasis: 'opaque:basis-1',
  };

  it('commits a supersession event, digesting the path so no raw path is stored.', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    const sink = new LedgerEvidenceSink(ledger, { tenantId: 't1', context: DELEGATED_CONTEXT, policy: POLICY });
    await sink.record(superseded);
    const [ entry ] = ledger.entries('t1');
    expect(entry.record.operation).toBe('supersession');
    expect(entry.record.recordState).toBe('superseded');
    expect(normalizeSha256(entry.record.targetDigest)).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(entry.record)).not.toContain('/boxes/bx/rec-1');
    expect(entry.record.actor.actor).toBe('https://id.example/bob#me');
  });

  it('commits a tombstone event with a current record state.', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    const sink = new LedgerEvidenceSink(ledger, { tenantId: 't1', context: FULL_CONTEXT, policy: POLICY });
    await sink.record(tombstoned);
    expect(ledger.entries('t1')[0].record.recordState).toBe('current');
    expect(ledger.verify('t1').valid).toBe(true);
  });
});
