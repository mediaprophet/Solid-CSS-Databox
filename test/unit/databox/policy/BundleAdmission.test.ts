import { computeBundleDigest } from '../../../../src/databox/policy/PolicyBundle';
import { admitBundle } from '../../../../src/databox/policy/BundleAdmission';
import {
  buildBundle,
  DIGEST_A,
  generateEs256KeyPair,
  KID,
  signBundle,
  trustStore,
} from './PolicyTestSupport';

describe('admitBundle', (): void => {
  it('admits a synthetic, attested, correctly-signed and correctly-sealed bundle.', (): void => {
    const result = admitBundle(signBundle(buildBundle()), trustStore());
    expect(result.admitted).toBe(true);
    expect(result.reason).toBe('admitted');
    expect(result.bundle).toBeDefined();
    expect(Object.isFrozen(result.bundle)).toBe(true);
  });

  it('rejects a structurally malformed JWS as a bad signature (fail closed).', (): void => {
    expect(admitBundle('not-a-jws', trustStore())).toStrictEqual({ admitted: false, reason: 'bad-signature' });
  });

  it('rejects a bundle missing issuer/issuedAt/kid as malformed.', (): void => {
    const noIssuer = signBundle(buildBundle({ issuer: undefined as unknown as string }));
    expect(admitBundle(noIssuer, trustStore()).reason).toBe('malformed-bundle');
    const badTime = signBundle(buildBundle({ issuedAt: 'not-a-date' }));
    expect(admitBundle(badTime, trustStore()).reason).toBe('malformed-bundle');
  });

  it('rejects a signature from an UNTRUSTED key (resolved from the trust store, not the header).', (): void => {
    const attacker = generateEs256KeyPair();
    const forged = signBundle(buildBundle(), attacker.privateKey, KID);
    expect(admitBundle(forged, trustStore()).reason).toBe('bad-signature');
  });

  it('rejects a bundle not labelled synthetic.', (): void => {
    const jws = signBundle(buildBundle({ syntheticFixture: false as unknown as true }));
    expect(admitBundle(jws, trustStore()).reason).toBe('not-synthetic');
  });

  it('rejects an unsupported profile.', (): void => {
    const jws = signBundle(buildBundle({ profile: 'https://example/other-profile' }));
    expect(admitBundle(jws, trustStore()).reason).toBe('unsupported-profile');
  });

  it('rejects a bundle with NO attestation (proposed ⇒ not admitted, ADR-0015).', (): void => {
    const jws = signBundle(buildBundle({ attestation: undefined }));
    expect(admitBundle(jws, trustStore()).reason).toBe('unattested');
  });

  it('rejects a bundle whose attestation status is proposed.', (): void => {
    const jws = signBundle(buildBundle({
      attestation: {
        attester: 'a',
        method: 'm',
        verificationState: 'v',
        scope: 's',
        status: 'proposed',
        attestationId: 'urn:uuid:att-x',
      },
    }));
    expect(admitBundle(jws, trustStore()).reason).toBe('proposed');
  });

  it('rejects a bundle missing a required digest binding.', (): void => {
    const jws = signBundle(buildBundle({ corpusManifestDigest: 'not-a-digest' }));
    expect(admitBundle(jws, trustStore()).reason).toBe('missing-digest');
  });

  it('rejects a bundle compiled for a different evaluator version.', (): void => {
    const jws = signBundle(buildBundle({ evaluatorVersion: 'dbx-eval/999' }));
    expect(admitBundle(jws, trustStore()).reason).toBe('incompatible-evaluator');
  });

  it('rejects a SUBSTITUTED bundle whose bound digest no longer matches its content (T-25).', (): void => {
    // Well-formed digest shape but wrong value: passes missing-digest, fails the content match.
    const jws = signBundle(buildBundle({ compiledPolicyDigest: DIGEST_A }));
    expect(admitBundle(jws, trustStore()).reason).toBe('failed-digest');
  });

  it('admits a bundle whose bound digest equals its recomputed content digest.', (): void => {
    const bundle = buildBundle();
    // Sanity: the sealed digest is exactly the recomputed content digest.
    expect(bundle.compiledPolicyDigest).toBe(computeBundleDigest(bundle));
    expect(admitBundle(signBundle(bundle), trustStore()).admitted).toBe(true);
  });

  it('MED-1: is TOTAL — a signature-valid but structurally-malformed body fails closed, never throws.', (): void => {
    // A well-formed digest (passes missing-digest) but no effectiveInterval: the digest computation would
    // throw; admitBundle must map that to a reason, not propagate the error.
    const malformed = signBundle(buildBundle({ compiledPolicyDigest: DIGEST_A, effectiveInterval: undefined }));
    let result: ReturnType<typeof admitBundle> | undefined;
    expect((): void => {
      result = admitBundle(malformed, trustStore());
    }).not.toThrow();
    expect(result).toStrictEqual({ admitted: false, reason: 'malformed-bundle' });
  });

  it('LOW-1: deep-freezes the admitted bundle (rules + nested objects are immutable).', (): void => {
    const bundle = admitBundle(signBundle(buildBundle()), trustStore()).bundle!;
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.rules)).toBe(true);
    expect(Object.isFrozen(bundle.rules[0])).toBe(true);
    expect(Object.isFrozen(bundle.effectiveInterval)).toBe(true);
  });
});
