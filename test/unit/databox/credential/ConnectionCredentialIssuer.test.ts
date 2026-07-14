import type { IssuanceRequest } from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import {
  computeAccessGrantDigest,
  ConnectionCredentialIssuer,
  DEFAULT_CREDENTIAL_LIFETIME_MS,
} from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import { jwkThumbprint } from '../../../../src/databox/credential/Es256';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { generateEs256KeyPair } from './TestKeys';

const issuerKeys = generateEs256KeyPair();
const holder = generateEs256KeyPair();

function issuer(): ConnectionCredentialIssuer {
  return new ConnectionCredentialIssuer('https://databox.example/id#issuer', issuerKeys.privateKey, 'https://databox.example/id#key-1');
}

function request(overrides: Partial<IssuanceRequest> = {}): IssuanceRequest {
  return {
    pairwiseWebId: 'https://vault.example/id/rewards/abc#me',
    holderPublicJwk: holder.publicJwk,
    program: 'https://databox.example/programs/rewards-v1',
    databox: 'https://databox.example/boxes/bx_7/',
    storageDescription: 'https://databox.example/boxes/bx_7/description',
    accessGrant: { id: 'https://databox.example/grants/gr_2', bytes: 'grant-bytes' },
    accessProfile: 'https://w3id.org/solid-databox/access/v1',
    conformsTo: [ 'https://solidproject.org/TR/protocol' ],
    syncProfile: 'https://w3id.org/solid-databox/sync/v1',
    relationship: 'urn:uuid:rel-1',
    statusListIndex: 5,
    statusListCredential: 'https://databox.example/status/1',
    now: 1_000_000,
    ...overrides,
  };
}

describe('computeAccessGrantDigest', (): void => {
  it('digests raw bytes into a urn:sha256 URN.', (): void => {
    expect(computeAccessGrantDigest({ id: 'g', bytes: 'x' })).toMatch(/^urn:sha256:[0-9a-f]{64}$/u);
  });

  it('passes through a valid precomputed digest and rejects a malformed one.', (): void => {
    const digest = `urn:sha256:${'a'.repeat(64)}`;
    expect(computeAccessGrantDigest({ id: 'g', digest })).toBe(digest);
    expect((): unknown => computeAccessGrantDigest({ id: 'g', digest: 'urn:sha256:short' }))
      .toThrow(BadRequestHttpError);
  });

  it('requires either bytes or a digest.', (): void => {
    expect((): unknown => computeAccessGrantDigest({ id: 'g' })).toThrow(BadRequestHttpError);
  });
});

describe('ConnectionCredentialIssuer', (): void => {
  it('issues a holder-bound VC 2.0 credential as a compact JWS.', (): void => {
    const issued = issuer().issue(request());
    expect(issued.connectionId).toMatch(/^urn:uuid:/u);
    expect(issued.holderThumbprint).toBe(jwkThumbprint(holder.publicJwk));
    expect(issued.jws.split('.')).toHaveLength(3);
    expect(issued.credential.type).toContain('DataboxConnectionCredential');
    expect(issued.credential.credentialSubject.holder.thumbprint).toBe(issued.holderThumbprint);
    expect(issued.credential.credentialSubject.connection.accessGrantDigest).toMatch(/^urn:sha256:/u);
    expect(issued.credential.credentialStatus.statusListIndex).toBe(5);
  });

  it('honours default lifetime, validForMs and explicit validUntil.', (): void => {
    const def = issuer().issue(request());
    expect(Date.parse(def.credential.validUntil)).toBe(1_000_000 + DEFAULT_CREDENTIAL_LIFETIME_MS);
    const forMs = issuer().issue(request({ validForMs: 1000 }));
    expect(Date.parse(forMs.credential.validUntil)).toBe(1_001_000);
    const until = issuer().issue(request({ validUntil: 2_000_000 }));
    expect(Date.parse(until.credential.validUntil)).toBe(2_000_000);
  });

  it('includes authorizationDiscovery only when supplied, and a custom status purpose.', (): void => {
    const withDisc = issuer().issue(request({
      authorizationDiscovery: 'https://databox.example/authz',
      statusPurpose: 'suspension',
    }));
    expect(withDisc.credential.credentialSubject.connection.authorizationDiscovery).toBe('https://databox.example/authz');
    expect(withDisc.credential.credentialStatus.statusPurpose).toBe('suspension');
    expect(issuer().issue(request()).credential.credentialSubject.connection.authorizationDiscovery).toBeUndefined();
  });

  it('uses the wall clock when no now is supplied.', (): void => {
    const before = Date.now();
    const issued = issuer().issue(request({ now: undefined }));
    expect(Date.parse(issued.credential.validFrom)).toBeGreaterThanOrEqual(before);
  });

  it('fails closed on an invalid validity window and status index.', (): void => {
    expect((): unknown => issuer().issue(request({ validUntil: 1000 }))).toThrow('validUntil must be after');
    expect((): unknown => issuer().issue(request({ statusListIndex: -1 }))).toThrow('statusListIndex');
    expect((): unknown => issuer().issue(request({ statusListIndex: 1.5 }))).toThrow('statusListIndex');
  });

  it('rejects non-https discovery/binding fields.', (): void => {
    expect((): unknown => issuer().issue(request({ program: 'http://x' }))).toThrow('program');
    expect((): unknown => issuer().issue(request({ databox: 'ftp://x' }))).toThrow('databox');
    expect((): unknown => issuer().issue(request({ storageDescription: 'x' }))).toThrow('storageDescription');
    expect((): unknown => issuer().issue(request({ pairwiseWebId: 'urn:x' }))).toThrow('pairwiseWebId');
    expect((): unknown => issuer().issue(request({ authorizationDiscovery: 'nope' })))
      .toThrow('authorizationDiscovery');
  });

  it('rejects empty non-URL string fields and an empty conformsTo.', (): void => {
    expect((): unknown => issuer().issue(request({ accessProfile: '' }))).toThrow('accessProfile');
    expect((): unknown => issuer().issue(request({ syncProfile: '' }))).toThrow('syncProfile');
    expect((): unknown => issuer().issue(request({ relationship: '' }))).toThrow('relationship');
    expect((): unknown => issuer().issue(request({ accessGrant: { id: '', bytes: 'x' }}))).toThrow('accessGrant');
    expect((): unknown => issuer().issue(request({ statusListCredential: '' }))).toThrow('statusListCredential');
    expect((): unknown => issuer().issue(request({ conformsTo: []}))).toThrow('conformsTo');
    expect((): unknown => issuer().issue(request({ conformsTo: [ '' ]}))).toThrow('conformsTo');
  });
});
