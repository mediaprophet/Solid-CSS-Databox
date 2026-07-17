import * as AuditEvidenceModule from '../../../../src/databox/evidence/AuditEvidence';
import * as AuditProjectionModule from '../../../../src/databox/evidence/AuditProjection';
import * as EvidenceModule from '../../../../src/databox/evidence/Evidence';
import { NotImplementedEvidenceLedger } from '../../../../src/databox/evidence/Evidence';
import * as EvidenceChainModule from '../../../../src/databox/evidence/EvidenceChain';
import * as EvidenceLedgerStoreModule from '../../../../src/databox/evidence/EvidenceLedgerStore';
import { NotImplementedHttpError } from '../../../../src/util/errors/NotImplementedHttpError';

describe('The DBX-09 evidence seam (kept green under DBX-19)', (): void => {
  it('still refuses to append from the fail-closed NotImplementedEvidenceLedger stub.', async(): Promise<void> => {
    await expect(new NotImplementedEvidenceLedger().append({
      tenantId: 't',
      kind: 'deposit-accepted',
      committedAt: '2026-07-15T00:00:00.000Z',
      digest: 'd',
    })).rejects.toThrow(NotImplementedHttpError);
  });

  it('re-exports the real DBX-19 ledger symbols through the Evidence barrel.', (): void => {
    // Identity, not mere presence: the barrel must forward the actual DBX-19 implementations
    // rather than shadowing them with a stub of the same name.
    expect(EvidenceModule.HashChainedEvidenceLedger).toBe(EvidenceLedgerStoreModule.HashChainedEvidenceLedger);
    expect(EvidenceModule.LedgerEvidenceSink).toBe(EvidenceLedgerStoreModule.LedgerEvidenceSink);
    expect(EvidenceModule.buildAuditRecord).toBe(AuditEvidenceModule.buildAuditRecord);
    expect(EvidenceModule.bindActorFromContext).toBe(AuditEvidenceModule.bindActorFromContext);
    expect(EvidenceModule.verifyChain).toBe(EvidenceChainModule.verifyChain);
    expect(EvidenceModule.projectForConsumer).toBe(AuditProjectionModule.projectForConsumer);
    expect(EvidenceModule.GENESIS_PREV_DIGEST).toBe(EvidenceChainModule.GENESIS_PREV_DIGEST);
    expect(EvidenceModule.GENESIS_PREV_DIGEST).toMatch(/^urn:sha256:0{64}$/u);
  });
});
