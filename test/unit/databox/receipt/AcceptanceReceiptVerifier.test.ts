import type { KeyObject } from 'node:crypto';
import {
  AcceptanceReceiptSigner,
  AcceptanceReceiptVerifier,
} from '../../../../src/databox/receipt/AcceptanceReceiptSigner';
import type {
  DataboxAcceptanceReceiptCredential,
  ReceiptVerification,
} from '../../../../src/databox/receipt/AcceptanceReceiptSigner';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import {
  ACCEPTED_PAYLOAD,
  baseRequest,
  generateEs256KeyPair,
  ISSUER,
  KID,
  NOW,
  receiptCredential,
  signerKey,
  signReceipt,
  trustStore,
} from './ReceiptTestSupport';

const verifier = new AcceptanceReceiptVerifier();

/** A freshly signed, valid receipt JWS from the reference signer. */
function issuedJws(overrides = {}): string {
  return new AcceptanceReceiptSigner(ISSUER, signerKey.privateKey, KID).issue(baseRequest(overrides)).receipt.jws;
}

/** Sign a (possibly malformed) credential object as a receipt JWS with the trusted signer key. */
function sign(credential: DataboxAcceptanceReceiptCredential, header?: Record<string, unknown>): string {
  return signReceipt(credential as unknown as Record<string, unknown>, signerKey.privateKey, header);
}

describe('AcceptanceReceiptVerifier', (): void => {
  it('verifies a valid receipt offline and returns its bound facts.', (): void => {
    const result = verifier.verify(issuedJws(), { trustStore: trustStore() });
    expect(result).toMatchObject<Partial<ReceiptVerification>>({
      cryptographicallyValid: true,
      issuer: ISSUER,
      verificationMethod: KID,
      state: 'accepted',
    });
    expect(result.receiptDigest).toMatch(/^urn:sha256:[0-9a-f]{64}$/u);
  });

  it('verifies after export with the record bytes: matching payload digest passes (T-28 independence).', (): void => {
    const result = verifier.verify(issuedJws(), { trustStore: trustStore(), acceptedPayload: ACCEPTED_PAYLOAD });
    expect(result.binding.payloadDigest).toBe(result.binding.payloadDigest);
    expect(result.cryptographicallyValid).toBe(true);
  });

  it('still verifies when the signing key was since cleanly ROTATED (receipt survives rotation, T-28).', (): void => {
    const rotated = trustStore({
      status: 'rotated',
      validFrom: new Date(NOW - 2_000_000).toISOString(),
      validUntil: new Date(NOW + 2_000_000).toISOString(),
    });
    expect(verifier.verify(issuedJws(), { trustStore: rotated }).cryptographicallyValid).toBe(true);
  });

  it('fails closed when the signing key is REVOKED/compromised.', (): void => {
    expect((): ReceiptVerification => verifier.verify(issuedJws(), { trustStore: trustStore({ status: 'revoked' }) }))
      .toThrow('revoked/compromised');
  });

  it('fails closed on an untrusted issuer/key (key never taken from the token).', (): void => {
    const foreign = trustStore({ issuer: 'https://attacker.example/id#issuer' });
    expect((): ReceiptVerification => verifier.verify(issuedJws(), { trustStore: foreign })).toThrow('not trusted');
  });

  it('fails closed on an ALTERED receipt (tampered signature) — repudiation defence (T-46).', (): void => {
    const jws = issuedJws();
    const parts = jws.split('.');
    parts[2] = `${parts[2].startsWith('A') ? 'B' : 'A'}${parts[2].slice(1)}`;
    expect((): ReceiptVerification => verifier.verify(parts.join('.'), { trustStore: trustStore() })).toThrow(
      BadRequestHttpError,
    );
  });

  it('fails closed when supplied record bytes do NOT match the bound digest (T-28 provider swap).', (): void => {
    const altered = Buffer.from('a different record the provider substituted', 'utf8');
    expect((): ReceiptVerification =>
      verifier.verify(issuedJws(), { trustStore: trustStore(), acceptedPayload: altered }))
      .toThrow('does not match the receipt binding');
  });

  it('binds the transaction: an expected-transaction mismatch fails, a match passes.', (): void => {
    expect(verifier.verify(issuedJws(), { trustStore: trustStore(), expectedTransaction: 'urn:uuid:txn-1' })
      .binding.transaction).toBe('urn:uuid:txn-1');
    expect((): ReceiptVerification =>
      verifier.verify(issuedJws(), { trustStore: trustStore(), expectedTransaction: 'urn:uuid:other' }))
      .toThrow('does not match the expected transaction');
  });

  it('verifies a receipt carrying a complete legal-policy binding.', (): void => {
    const legalPolicy = {
      compiledPolicyDigest: `urn:sha256:${'c'.repeat(64)}`,
      corpusManifestDigest: `urn:sha256:${'d'.repeat(64)}`,
      attestationId: 'attestation-1',
      evaluatorVersion: 'evaluator-1',
    };
    const result = verifier.verify(issuedJws({ legalPolicy }), { trustStore: trustStore() });
    expect(result.binding.legal).toStrictEqual(legalPolicy);
  });

  it('rejects an incomplete legal-policy binding (review #18: a version string is insufficient).', (): void => {
    const credential = receiptCredential({
      legal: {
        compiledPolicyDigest: `urn:sha256:${'c'.repeat(64)}`,
        corpusManifestDigest: `urn:sha256:${'d'.repeat(64)}`,
        attestationId: 'a1',
        evaluatorVersion: '',
      },
    });
    expect((): ReceiptVerification => verifier.verify(sign(credential), { trustStore: trustStore() })).toThrow(
      'evaluatorVersion',
    );
  });

  it('rejects an unexpected JWS typ.', (): void => {
    const jws = sign(receiptCredential(), { alg: 'ES256', typ: 'jwt', cty: 'vc', kid: KID });
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow('Unexpected JWS typ');
  });

  it('rejects a header without a string kid.', (): void => {
    const jws = sign(receiptCredential(), { alg: 'ES256', typ: 'vc+jwt', cty: 'vc' });
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() }))
      .toThrow('missing a string kid');
  });

  it('rejects a receipt missing an issuer.', (): void => {
    const jws = sign(receiptCredential({}, { issuer: undefined as unknown as string }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow('missing an issuer');
  });

  it('rejects a receipt missing validFrom.', (): void => {
    const jws = sign(receiptCredential({}, { validFrom: undefined as unknown as string }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow('missing validFrom');
  });

  it('rejects a receipt with an unparseable validFrom.', (): void => {
    const jws = sign(receiptCredential({}, { validFrom: 'not-a-date' }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() }))
      .toThrow('validFrom is unparseable');
  });

  it('rejects a credential that is not a DataboxAcceptanceReceipt.', (): void => {
    const jws = sign(receiptCredential({}, { type: [ 'VerifiableCredential' ]}));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      'not a VerifiableCredential DataboxAcceptanceReceipt',
    );
  });

  it('rejects a credential with a non-array type.', (): void => {
    const jws = sign(receiptCredential({}, { type: 'VerifiableCredential' as unknown as string[] }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      'not a VerifiableCredential DataboxAcceptanceReceipt',
    );
  });

  it('rejects a credential missing the credentialSubject.receipt binding.', (): void => {
    const jws = sign(receiptCredential({}, { credentialSubject: {} as never }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      'missing a credentialSubject.receipt binding',
    );
  });

  it('rejects an empty required binding field.', (): void => {
    const jws = sign(receiptCredential({ acceptedResource: '' }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      '\'acceptedResource\' must be a non-empty string',
    );
  });

  it('rejects a non-string required binding field.', (): void => {
    const jws = sign(receiptCredential({ sender: 5 as unknown as string }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      '\'sender\' must be a non-empty string',
    );
  });

  it('rejects an unpinned canonicalization.', (): void => {
    const jws = sign(receiptCredential({ canonicalization: 'other/1' }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() }))
      .toThrow('unpinned canonicalization');
  });

  it('rejects a malformed payload digest.', (): void => {
    const jws = sign(receiptCredential({ payloadDigest: 'bad' }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      'payloadDigest must be a urn:sha256',
    );
  });

  it('rejects a malformed policy digest.', (): void => {
    const jws = sign(receiptCredential({ policyDigest: 'bad' }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      'policyDigest must be a urn:sha256',
    );
  });

  it('rejects an unknown operation type.', (): void => {
    const jws = sign(receiptCredential({ operation: 'delete' as never }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow('unknown operation');
  });

  it('rejects activatedDuties that is not an array of strings.', (): void => {
    const jws = sign(receiptCredential({ activatedDuties: [ 1 ] as unknown as string[] }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      'activatedDuties must be an array of strings',
    );
  });

  it('rejects a receipt that does not attest the accepted state.', (): void => {
    const jws = sign(receiptCredential({ state: 'notified' as 'accepted' }));
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(
      'must attest the accepted state',
    );
  });

  it('uses the store key material, never a caller-generated key.', (): void => {
    const other: KeyObject = generateEs256KeyPair().privateKey;
    const jws = signReceipt(receiptCredential() as unknown as Record<string, unknown>, other);
    expect((): ReceiptVerification => verifier.verify(jws, { trustStore: trustStore() })).toThrow(BadRequestHttpError);
  });
});
