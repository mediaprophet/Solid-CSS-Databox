import type {
  AccessPolicy,
  PresentedCredential,
} from '../../../../../../src/databox/cms/modules/access/CredentialGate';
import { evaluateAccess } from '../../../../../../src/databox/cms/modules/access/CredentialGate';

describe('evaluateAccess', (): void => {
  const policy: AccessPolicy = {
    resource: 'https://venue.example/turnstile/1',
    acceptedIssuers: [ 'https://issuer.example/one', 'https://issuer.example/two' ],
    requiredClaim: 'over18',
  };

  it('grants access when the credential is valid, from an accepted issuer, and satisfies the claim.', (): void => {
    const credential: PresentedCredential = {
      issuer: 'https://issuer.example/one',
      claims: { over18: true },
      expired: false,
    };
    expect(evaluateAccess(policy, credential)).toStrictEqual({ granted: true, reason: 'granted' });
  });

  it('denies access when the credential is expired.', (): void => {
    const credential: PresentedCredential = {
      issuer: 'https://issuer.example/one',
      claims: { over18: true },
      expired: true,
    };
    expect(evaluateAccess(policy, credential)).toStrictEqual({ granted: false, reason: 'expired' });
  });

  it('denies access when the issuer is not accepted.', (): void => {
    const credential: PresentedCredential = {
      issuer: 'https://issuer.example/untrusted',
      claims: { over18: true },
      expired: false,
    };
    expect(evaluateAccess(policy, credential)).toStrictEqual({ granted: false, reason: 'issuer-not-accepted' });
  });

  it('denies access when the required claim is missing.', (): void => {
    const credential: PresentedCredential = {
      issuer: 'https://issuer.example/one',
      claims: {},
      expired: false,
    };
    expect(evaluateAccess(policy, credential)).toStrictEqual({ granted: false, reason: 'claim-not-satisfied' });
  });

  it('denies access when the required claim is present but false.', (): void => {
    const credential: PresentedCredential = {
      issuer: 'https://issuer.example/one',
      claims: { over18: false },
      expired: false,
    };
    expect(evaluateAccess(policy, credential)).toStrictEqual({ granted: false, reason: 'claim-not-satisfied' });
  });
});
