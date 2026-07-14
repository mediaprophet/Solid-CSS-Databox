import { BitstringStatusList } from '../../../../src/databox/credential/BitstringStatusList';
import { signCompactJws } from '../../../../src/databox/credential/Es256';
import { IssuerTrustStore } from '../../../../src/databox/proof/IssuerTrustStore';
import { mayPresentAsAttested } from '../../../../src/databox/proof/RecordProofTypes';
import type {
  DataboxRecordCredential,
  IssuerKeyDescriptor,
  RecordClaimBinding,
  RecordProofContext,
} from '../../../../src/databox/proof/RecordProofValidator';
import {
  DBX_RECORD_CONTEXT,
  RecordProofValidator,
  VC_V2_CONTEXT,
} from '../../../../src/databox/proof/RecordProofValidator';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import {
  ACCEPTED_PAYLOAD,
  CONTEXT_CONTENT,
  generateEs256KeyPair,
  ISSUER,
  KID,
  openStatusResolver,
  pinnedContexts,
  recordCredential,
  signRecord,
  STATUS_CRED,
  statusManagerWithHerd,
} from './RecordTestSupport';

const NOW = Date.parse('2026-07-01T00:00:00.000Z');
const issuerKey = generateEs256KeyPair();
const validator = new RecordProofValidator();

function trustStore(overrides: Partial<IssuerKeyDescriptor> = {}): IssuerTrustStore {
  return new IssuerTrustStore('program-1', [{
    issuer: ISSUER,
    verificationMethod: KID,
    publicKeyJwk: issuerKey.publicJwk,
    status: 'active',
    validFrom: new Date(NOW - 1_000_000).toISOString(),
    ...overrides,
  }]);
}

/** A store whose single key is a cleanly-rotated key whose window contains NOW (L3 key history). */
function rotatedStore(): IssuerTrustStore {
  return trustStore({
    status: 'rotated',
    validFrom: new Date(NOW - 2_000_000).toISOString(),
    validUntil: new Date(NOW + 2_000_000).toISOString(),
  });
}

/** A store listing an ACTIVE descriptor before a REVOKED duplicate of the same (issuer, kid) (L1). */
function activeThenRevokedStore(): IssuerTrustStore {
  const validFrom = new Date(NOW - 1_000_000).toISOString();
  const base = { issuer: ISSUER, verificationMethod: KID, publicKeyJwk: issuerKey.publicJwk, validFrom };
  return new IssuerTrustStore('program-1', [
    { ...base, status: 'active' },
    { ...base, status: 'revoked' },
  ]);
}

function context(overrides: Partial<RecordProofContext> = {}): RecordProofContext {
  return {
    trustStore: trustStore(),
    pinnedContexts: pinnedContexts(),
    statusListResolver: openStatusResolver(),
    now: NOW,
    acceptedPayload: ACCEPTED_PAYLOAD,
    ...overrides,
  };
}

/** Sign a genuine record credential (index 0) with the trusted issuer key. */
function genuine(
  binding: Partial<RecordClaimBinding> = {},
  credentialOverrides: Partial<DataboxRecordCredential> = {},
): string {
  return signRecord(
    recordCredential(0, NOW, binding, credentialOverrides) as unknown as Record<string, unknown>,
    issuerKey.privateKey,
  );
}

describe('RecordProofValidator', (): void => {
  it('verifies a genuine institutional record and surfaces the attester as issuer-proposed only (M1).', (): void => {
    const result = validator.validate(
      genuine({ method: 'institutional-record', verificationStatus: 'verified', attester: 'https://x/#human' }),
      context(),
    );
    expect(result.cryptographicallyValid).toBe(true);
    // M1: the issuer's self-asserted attester is NOT independent human attestation.
    expect(result.humanAttested).toBe(false);
    expect(mayPresentAsAttested(result)).toBe(false);
    expect(result.issuer).toBe(ISSUER);
    expect(result.verificationMethod).toBe(KID);
    expect(result.payloadDigest).toStrictEqual(expect.stringMatching(/^urn:sha256:[0-9a-f]{64}$/u));
    expect(result.recordDigest).toStrictEqual(expect.stringMatching(/^urn:sha256:[0-9a-f]{64}$/u));
    expect(result.claim.issuerProposedAttester).toBe('https://x/#human');
    expect(result.caveat).toContain('not the truth');
  });

  it('verifies without an explicit clock, defaulting to Date.now().', (): void => {
    const now = Date.now();
    const jws = signRecord(
      recordCredential(0, now) as unknown as Record<string, unknown>,
      issuerKey.privateKey,
    );
    const result = validator.validate(jws, {
      trustStore: trustStore({ validFrom: new Date(now - 1_000_000).toISOString() }),
      pinnedContexts: pinnedContexts(),
      statusListResolver: openStatusResolver(),
      acceptedPayload: ACCEPTED_PAYLOAD,
    });
    expect(result.cryptographicallyValid).toBe(true);
  });

  describe('validity is not truth (review #13)', (): void => {
    it('still verifies a signed record whose claim is machine-proposed, but marks it not-attested.', (): void => {
      const result = validator.validate(
        genuine({ method: 'machine-generated', verificationStatus: 'machine-proposed' }),
        context(),
      );
      // The SIGNATURE is valid...
      expect(result.cryptographicallyValid).toBe(true);
      // ...but the claim is NOT human-attested/true, and the API refuses to present it as attested.
      expect(result.humanAttested).toBe(false);
      expect(result.requiresHumanAttestation).toBe(true);
      expect(mayPresentAsAttested(result)).toBe(false);
      expect(result.claim.issuerProposedAttester).toBeUndefined();
    });

    it('treats a self-asserted false claim as a valid signature but not attested.', (): void => {
      const result = validator.validate(
        genuine({ method: 'self-asserted', verificationStatus: 'self-asserted' }),
        context(),
      );
      expect(result.cryptographicallyValid).toBe(true);
      expect(mayPresentAsAttested(result)).toBe(false);
    });

    it('does NOT treat an issuer self-asserted attester on a machine record as attested (M1, T-20).', (): void => {
      // A compromised/automated bridge could stamp any attester string in its OWN signature; that must not
      // flip a machine-generated record to attested. Independent attestation is a separate residual (DBX-20).
      const result = validator.validate(
        genuine({ method: 'machine-generated', verificationStatus: 'machine-proposed', attester: 'urn:human:1' }),
        context(),
      );
      expect(result.cryptographicallyValid).toBe(true);
      expect(result.humanAttested).toBe(false);
      expect(result.requiresHumanAttestation).toBe(true);
      expect(mayPresentAsAttested(result)).toBe(false);
      // The proposed attester is surfaced, but only as issuer-proposed — never authoritative.
      expect(result.claim.issuerProposedAttester).toBe('urn:human:1');
    });
  });

  describe('header/preview fail-closed', (): void => {
    it('rejects a wrong JWS typ.', (): void => {
      const bad = signCompactJws({ alg: 'ES256', typ: 'jwt', kid: KID }, { issuer: ISSUER }, issuerKey.privateKey);
      expect((): unknown => validator.validate(bad, context())).toThrow('Unexpected JWS typ');
    });

    it('rejects a missing string kid.', (): void => {
      const jws = signCompactJws({ alg: 'ES256', typ: 'vc+jwt' }, { issuer: ISSUER }, issuerKey.privateKey);
      expect((): unknown => validator.validate(jws, context())).toThrow('missing a string kid');
    });

    it('rejects a missing issuer, missing validFrom, or unparseable validFrom.', (): void => {
      expect((): unknown => validator.validate(signRecord({ noIssuer: true }, issuerKey.privateKey), context()))
        .toThrow('missing an issuer');
      expect((): unknown => validator.validate(signRecord({ issuer: ISSUER }, issuerKey.privateKey), context()))
        .toThrow('missing validFrom');
      expect((): unknown =>
        validator.validate(signRecord({ issuer: ISSUER, validFrom: 'nope' }, issuerKey.privateKey), context()))
        .toThrow('validFrom is unparseable');
    });
  });

  describe('pinned contexts (T-21)', (): void => {
    it('rejects an unpinned/remote @context before trusting the document.', (): void => {
      const jws = genuine({}, { '@context': [ VC_V2_CONTEXT, 'https://evil.example/ctx' ]});
      expect((): unknown => validator.validate(jws, context())).toThrow('Unpinned/remote');
    });

    it('verifies carried offline contexts, rejecting a mutated one.', (): void => {
      const good = [
        { url: VC_V2_CONTEXT, content: CONTEXT_CONTENT[VC_V2_CONTEXT] },
        { url: DBX_RECORD_CONTEXT, content: CONTEXT_CONTENT[DBX_RECORD_CONTEXT] },
      ];
      expect(validator.validate(genuine(), context({ offlineContexts: good })).cryptographicallyValid).toBe(true);
      const mutated = [{ url: VC_V2_CONTEXT, content: 'tampered' }];
      expect((): unknown => validator.validate(genuine(), context({ offlineContexts: mutated })))
        .toThrow('does not match its pinned hash');
    });
  });

  describe('trust + authenticity', (): void => {
    it('rejects a record signed by a key not in the trust store (T-20).', (): void => {
      const foreign = generateEs256KeyPair();
      const jws = signRecord(recordCredential(0, NOW) as unknown as Record<string, unknown>, foreign.privateKey);
      // The kid still names the trusted key, but the signature was made by a different key → verify fails.
      expect((): unknown => validator.validate(jws, context())).toThrow('signature verification failed');
    });

    it('rejects when the trusted key is revoked/compromised (T-20).', (): void => {
      expect((): unknown => validator.validate(genuine(), context({ trustStore: trustStore({ status: 'revoked' }) })))
        .toThrow('revoked/compromised');
    });

    it('rejects when a revoked duplicate descriptor shadows an active one (L1).', (): void => {
      expect((): unknown => validator.validate(genuine(), context({ trustStore: activeThenRevokedStore() })))
        .toThrow('revoked/compromised');
    });
  });

  describe('key history + header-key independence (L3)', (): void => {
    it('verifies a record issued WITHIN a since-rotated key window, end-to-end.', (): void => {
      const result = validator.validate(genuine(), context({ trustStore: rotatedStore() }));
      expect(result.cryptographicallyValid).toBe(true);
    });

    it('rejects a record issued AFTER the rotated key was retired, end-to-end.', (): void => {
      const after = NOW + 3_000_000;
      const jws = signRecord(recordCredential(0, after) as unknown as Record<string, unknown>, issuerKey.privateKey);
      expect((): unknown => validator.validate(jws, context({ trustStore: rotatedStore(), now: after })))
        .toThrow('after its signing key was retired');
    });

    it('ignores a header-embedded jwk/kid: key selection is from the store only.', (): void => {
      const attacker = generateEs256KeyPair();
      // The attacker names the TRUSTED kid and embeds their OWN public jwk in the header, but signs with their
      // own key. Selection uses the store key (the real issuer key), so the attacker signature fails to verify.
      const jws = signCompactJws(
        { alg: 'ES256', typ: 'vc+jwt', kid: KID, jwk: attacker.publicJwk },
        recordCredential(0, NOW) as unknown as Record<string, unknown>,
        attacker.privateKey,
      );
      expect((): unknown => validator.validate(jws, context())).toThrow('signature verification failed');
    });
  });

  describe('shape', (): void => {
    it('rejects a non-record type.', (): void => {
      expect((): unknown => validator.validate(genuine({}, { type: [ 'VerifiableCredential' ]}), context()))
        .toThrow('record/receipt');
    });

    it('rejects a missing credentialSubject.record.', (): void => {
      const jws = genuine({}, { credentialSubject: { record: null } as never });
      expect((): unknown => validator.validate(jws, context())).toThrow('credentialSubject.record');
    });

    it('rejects an unpinned canonicalization identifier.', (): void => {
      expect((): unknown => validator.validate(genuine({ canonicalization: 'other/1' }), context()))
        .toThrow('unpinned canonicalization');
    });

    it('rejects a malformed payloadDigest.', (): void => {
      expect((): unknown => validator.validate(genuine({ payloadDigest: 'not-a-digest' }), context()))
        .toThrow('payloadDigest must be');
    });

    it('rejects missing author / unknown method / unknown verificationStatus.', (): void => {
      expect((): unknown => validator.validate(genuine({ author: '' }), context())).toThrow('missing an author');
      expect((): unknown =>
        validator.validate(genuine({ method: 'guess' as never }), context())).toThrow('unknown method');
      expect((): unknown =>
        validator.validate(genuine({ verificationStatus: 'guess' as never }), context()))
        .toThrow('unknown verificationStatus');
    });
  });

  describe('validity window', (): void => {
    it('rejects a not-yet-valid record.', (): void => {
      expect((): unknown => validator.validate(genuine(), context({ now: NOW - 10_000_000 }))).toThrow('not yet valid');
    });

    it('rejects an expired record and an unparseable validUntil.', (): void => {
      expect((): unknown => validator.validate(genuine(), context({ now: NOW + 10_000_000 }))).toThrow('expired');
      const jws = genuine({}, { validUntil: 'nope' });
      expect((): unknown => validator.validate(jws, context())).toThrow('unparseable validUntil');
    });

    it('accepts a record with no validUntil (a record need not expire).', (): void => {
      const cred = recordCredential(0, NOW) as unknown as Record<string, unknown>;
      delete cred.validUntil;
      const result = validator.validate(signRecord(cred, issuerKey.privateKey), context());
      expect(result.cryptographicallyValid).toBe(true);
    });
  });

  it('rejects a record whose class does not match the addressed class.', (): void => {
    expect((): unknown => validator.validate(genuine(), context({ expectedRecordClass: 'https://x/other' })))
      .toThrow('does not match the addressed class');
  });

  describe('integrity — exact accepted-payload digest', (): void => {
    it('rejects an altered payload whose digest no longer matches the binding.', (): void => {
      expect((): unknown => validator.validate(genuine(), context({ acceptedPayload: Buffer.from('tampered') })))
        .toThrow('integrity');
    });

    it('verifies without an accepted payload supplied (digest-only binding).', (): void => {
      expect(validator.validate(genuine(), context({ acceptedPayload: undefined })).cryptographicallyValid).toBe(true);
    });
  });

  describe('status (BitstringStatusList)', (): void => {
    it('rejects a malformed credentialStatus.', (): void => {
      const jws = genuine({}, { credentialStatus: { statusListCredential: STATUS_CRED } as never });
      expect((): unknown => validator.validate(jws, context())).toThrow('BitstringStatusList entry');
    });

    it('fails closed when the status list is unreachable.', (): void => {
      expect((): unknown =>
        validator.validate(genuine(), context({ statusListResolver: (): undefined => undefined })))
        .toThrow('unreachable');
    });

    it('rejects a revoked record.', (): void => {
      const { manager, index } = statusManagerWithHerd();
      manager.setRevokedByIndex(index, true);
      const list = BitstringStatusList.decode(manager.publish().encodedList);
      const jws = signRecord(recordCredential(index, NOW) as unknown as Record<string, unknown>, issuerKey.privateKey);
      expect((): unknown => validator.validate(jws, context({ statusListResolver: openStatusResolver(list) })))
        .toThrow('revoked/suspended');
    });

    it('accepts a not-revoked record from a published list.', (): void => {
      const { manager, index } = statusManagerWithHerd();
      const list = BitstringStatusList.decode(manager.publish().encodedList);
      const jws = signRecord(recordCredential(index, NOW) as unknown as Record<string, unknown>, issuerKey.privateKey);
      expect(validator.validate(jws, context({ statusListResolver: openStatusResolver(list) })).cryptographicallyValid)
        .toBe(true);
    });
  });

  it('throws BadRequestHttpError (fail closed) on every rejection path.', (): void => {
    expect((): unknown => validator.validate(genuine({ author: '' }), context())).toThrow(BadRequestHttpError);
  });
});
