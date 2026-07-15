import type { AuditEvidenceRecord } from '../../../../src/databox/evidence/AuditEvidence';
import { buildAuditRecord } from '../../../../src/databox/evidence/AuditEvidence';
import type { LedgerEntry } from '../../../../src/databox/evidence/EvidenceChain';
import {
  computeEntryDigest,
  GENESIS_PREV_DIGEST,
  verifyChain,
} from '../../../../src/databox/evidence/EvidenceChain';
import { allowInput, FULL_CONTEXT } from './EvidenceTestSupport';

const RECORD: AuditEvidenceRecord = buildAuditRecord(allowInput(), FULL_CONTEXT);

/** Build a self-consistent entry linked to `prevDigest` at `sequence`. */
function entry(sequence: number, prevDigest: string, reasonCode = 'ok'): LedgerEntry {
  const record: AuditEvidenceRecord = { ...RECORD, reasonCode };
  const base = { sequence, tenantId: 't1', recordedAt: `2026-07-15T10:00:0${sequence}.000Z`, prevDigest, record };
  return { ...base, entryDigest: computeEntryDigest(base) };
}

/** Build an intact chain of `count` entries. */
function chain(count: number): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const index of Array.from({ length: count }).keys()) {
    const prev = index === 0 ? GENESIS_PREV_DIGEST : entries[index - 1].entryDigest;
    entries.push(entry(index, prev, `ok-${index}`));
  }
  return entries;
}

describe('The evidence hash chain', (): void => {
  it('exposes a well-known genesis prevDigest sentinel.', (): void => {
    expect(GENESIS_PREV_DIGEST).toBe(`urn:sha256:${'0'.repeat(64)}`);
  });

  it('binds prevDigest into the entry digest, so changing the predecessor changes the digest.', (): void => {
    const base = { sequence: 0, tenantId: 't1', recordedAt: 'x', prevDigest: GENESIS_PREV_DIGEST, record: RECORD };
    const digest = computeEntryDigest(base);
    const rebound = computeEntryDigest({ ...base, prevDigest: `urn:sha256:${'1'.repeat(64)}` });
    expect(digest).toMatch(/^urn:sha256:[0-9a-f]{64}$/u);
    expect(rebound).not.toBe(digest);
  });

  it('verifies an empty chain and an intact chain.', (): void => {
    expect(verifyChain([])).toStrictEqual({ valid: true, checked: 0 });
    expect(verifyChain(chain(3))).toStrictEqual({ valid: true, checked: 3 });
  });

  it('detects a TAMPERED entry: mutating a committed field breaks its digest.', (): void => {
    const entries = chain(3);
    // Keep the stored entryDigest but change the record — the recomputed digest no longer matches.
    const tampered = [ ...entries ];
    tampered[1] = { ...entries[1], record: { ...entries[1].record, reasonCode: 'silently-changed' }};
    expect(verifyChain(tampered)).toStrictEqual({
      valid: false,
      checked: 1,
      brokenAt: 1,
      reason: 'entry-digest-mismatch',
    });
  });

  it('detects a REORDERED chain: swapping two entries breaks the sequence.', (): void => {
    const entries = chain(3);
    const reordered = [ entries[0], entries[2], entries[1] ];
    expect(verifyChain(reordered)).toStrictEqual({
      valid: false,
      checked: 1,
      brokenAt: 1,
      reason: 'sequence-out-of-order',
    });
  });

  it('detects a broken prevDigest linkage even when the sequence looks correct.', (): void => {
    const entries = chain(3);
    // Re-number a foreign entry to sequence 1 so the sequence check passes but the prevDigest is wrong.
    const forged = { ...entries[2], sequence: 1 };
    const spliced = [ entries[0], forged, entries[2] ];
    expect(verifyChain(spliced)).toStrictEqual({
      valid: false,
      checked: 1,
      brokenAt: 1,
      reason: 'prev-digest-mismatch',
    });
  });
});
