import * as EvidenceModule from '../../../../src/databox/evidence/Evidence';
import { NotImplementedEvidenceLedger } from '../../../../src/databox/evidence/Evidence';
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
    expect(EvidenceModule.HashChainedEvidenceLedger).toBeDefined();
    expect(EvidenceModule.LedgerEvidenceSink).toBeDefined();
    expect(EvidenceModule.buildAuditRecord).toBeDefined();
    expect(EvidenceModule.bindActorFromContext).toBeDefined();
    expect(EvidenceModule.verifyChain).toBeDefined();
    expect(EvidenceModule.projectForConsumer).toBeDefined();
    expect(EvidenceModule.GENESIS_PREV_DIGEST).toMatch(/^urn:sha256:0{64}$/u);
  });
});
