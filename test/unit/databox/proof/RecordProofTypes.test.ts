import {
  BITSTRING_STATUS_LIST_ENTRY_TYPE,
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  DATABOX_RECORD_CREDENTIAL_TYPE,
  mayPresentAsAttested,
  RECORD_METHODS,
  RECORD_PROOF_ALG,
  RECORD_PROOF_JWS_TYP,
  RECORD_PROOF_MEDIA_TYPE,
  VALIDITY_NOT_TRUTH_CAVEAT,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
  VERIFICATION_STATUSES,
} from '../../../../src/databox/proof/RecordProofTypes';
import type { RecordVerification } from '../../../../src/databox/proof/RecordProofTypes';

function result(overrides: Partial<RecordVerification>): RecordVerification {
  return {
    cryptographicallyValid: true,
    humanAttested: false,
    requiresHumanAttestation: false,
    issuer: 'i',
    verificationMethod: 'k',
    recordDigest: 'urn:sha256:x',
    payloadDigest: 'urn:sha256:y',
    claim: { author: 'a', method: 'self-asserted', verificationStatus: 'self-asserted' },
    caveat: VALIDITY_NOT_TRUTH_CAVEAT,
    ...overrides,
  };
}

describe('RecordProofTypes', (): void => {
  it('pins the same suite as the connection credential (ES256 / vc+jwt).', (): void => {
    expect(RECORD_PROOF_ALG).toBe('ES256');
    expect(RECORD_PROOF_JWS_TYP).toBe('vc+jwt');
    expect(RECORD_PROOF_MEDIA_TYPE).toBe('application/vc+jwt');
  });

  it('surfaces the shared VC 2.0 + BitstringStatusList constants through the module.', (): void => {
    expect(VC_V2_CONTEXT).toBe('https://www.w3.org/ns/credentials/v2');
    expect(VERIFIABLE_CREDENTIAL_TYPE).toBe('VerifiableCredential');
    expect(BITSTRING_STATUS_LIST_ENTRY_TYPE).toBe('BitstringStatusListEntry');
    expect(DATABOX_RECORD_CREDENTIAL_TYPE).toBe('DataboxRecordCredential');
    expect(DATABOX_RECEIPT_CREDENTIAL_TYPE).toBe('DataboxAcceptanceReceipt');
  });

  it('declares the valid-vs-true field vocabularies.', (): void => {
    expect(RECORD_METHODS).toContain('machine-generated');
    expect(VERIFICATION_STATUSES).toContain('machine-proposed');
    expect(VALIDITY_NOT_TRUTH_CAVEAT).toContain('not the truth');
  });

  describe('mayPresentAsAttested', (): void => {
    it('is true only when human-attested and not awaiting attestation.', (): void => {
      expect(mayPresentAsAttested(result({ humanAttested: true }))).toBe(true);
    });

    it('is false when not human-attested.', (): void => {
      expect(mayPresentAsAttested(result({ humanAttested: false }))).toBe(false);
    });

    it('is false when human-attested is claimed but attestation is still required.', (): void => {
      expect(mayPresentAsAttested(result({ humanAttested: true, requiresHumanAttestation: true }))).toBe(false);
    });
  });
});
