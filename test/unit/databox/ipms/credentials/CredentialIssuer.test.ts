import { generateKeyPairSync } from 'node:crypto';
import { issueCredential, verifyCredential } from '../../../../../src/databox/ipms/credentials/CredentialIssuer';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const claim = { holds: 'valid-wwcc', level: 'basic' };
const base = {
  credential: claim,
  issuer: 'https://acme.example/#org',
  subject: 'https://alice.example/card#me',
  issuedAt: 1_700_000_000,
};

describe('CredentialIssuer', (): void => {
  it('issues a JWT-VC that verifies and returns the credential claim.', (): void => {
    const jws = issueCredential(base, privateKey);
    expect(jws.split('.')).toHaveLength(3);
    expect(verifyCredential(jws, publicKey, 1_700_000_100)).toEqual(claim);
  });

  it('fails verification against the wrong issuer key.', (): void => {
    const jws = issueCredential(base, privateKey);
    expect((): unknown => verifyCredential(jws, other.publicKey, 1_700_000_100))
      .toThrow('signature verification failed');
  });

  it('rejects a credential verified after its expiry.', (): void => {
    const jws = issueCredential({ ...base, expires: 1_700_000_500 }, privateKey);
    expect(verifyCredential(jws, publicKey, 1_700_000_400)).toEqual(claim);
    expect((): unknown => verifyCredential(jws, publicKey, 1_700_000_600)).toThrow('expired');
  });

  it('does not expire a credential issued without an expiry.', (): void => {
    const jws = issueCredential(base, privateKey);
    expect(verifyCredential(jws, publicKey, 9_999_999_999)).toEqual(claim);
  });

  it('rejects issuing with an empty issuer or subject.', (): void => {
    expect((): unknown => issueCredential({ ...base, issuer: ' ' }, privateKey))
      .toThrow('non-empty issuer and subject');
    expect((): unknown => issueCredential({ ...base, subject: '' }, privateKey))
      .toThrow('non-empty issuer and subject');
  });
});
