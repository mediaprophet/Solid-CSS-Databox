import type { KeyObject } from 'node:crypto';
import { ConnectionCredentialIssuer } from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import {
  CONNECTION_CREDENTIAL_JWS_TYP,
  DATABOX_CONNECTION_CREDENTIAL_TYPE,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
} from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { jwkThumbprint, signCompactJws } from '../../../../src/databox/credential/Es256';
import {
  assertNoForbiddenKeys,
  ConnectionCredentialValidator,
} from '../../../../src/databox/credential/ConnectionCredentialValidator';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { generateEs256KeyPair } from './TestKeys';

const ISSUER = 'https://databox.example/id#issuer';
const issuerKeys = generateEs256KeyPair();
const holder = generateEs256KeyPair();

function issued(now = 1_000_000): ReturnType<ConnectionCredentialIssuer['issue']> {
  const issuer = new ConnectionCredentialIssuer(ISSUER, issuerKeys.privateKey, 'https://databox.example/id#key-1');
  return issuer.issue({
    pairwiseWebId: 'https://vault.example/id#me',
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
    now,
    validForMs: 1_000_000,
  });
}

function validator(key: KeyObject = issuerKeys.publicKey): ConnectionCredentialValidator {
  return new ConnectionCredentialValidator(new Map([[ ISSUER, key ]]));
}

/** Sign an arbitrary credential body with the trusted issuer key and the credential typ. */
function craft(body: Record<string, unknown>): string {
  return signCompactJws({ alg: 'ES256', typ: CONNECTION_CREDENTIAL_JWS_TYP }, body, issuerKeys.privateKey);
}

function baseBody(now = 1_000_000): Record<string, unknown> {
  return {
    '@context': [ VC_V2_CONTEXT ],
    id: 'urn:uuid:c1',
    type: [ VERIFIABLE_CREDENTIAL_TYPE, DATABOX_CONNECTION_CREDENTIAL_TYPE ],
    issuer: ISSUER,
    validFrom: new Date(now).toISOString(),
    validUntil: new Date(now + 1000).toISOString(),
    credentialSubject: {
      id: 'https://vault.example/id#me',
      holder: { id: 'https://vault.example/id#me', publicKeyJwk: holder.publicJwk, thumbprint: jwkThumbprint(holder.publicJwk) },
      connection: { program: 'p', databox: 'd', accessGrantDigest: 'g', relationship: 'r' },
    },
    credentialStatus: { statusListIndex: 5 },
  };
}

describe('assertNoForbiddenKeys', (): void => {
  it('passes a clean document, including primitives, null and arrays.', (): void => {
    expect((): void => assertNoForbiddenKeys({ a: 1, b: null, c: [ 'x', 2, { nested: true }]})).not.toThrow();
  });

  it('rejects a forbidden key anywhere, case-insensitively (T-18).', (): void => {
    expect((): void => assertNoForbiddenKeys({ nested: { Access_Token: 'x' }})).toThrow(BadRequestHttpError);
    expect((): void => assertNoForbiddenKeys([{ customerId: 'c' }])).toThrow(BadRequestHttpError);
  });
});

describe('ConnectionCredentialValidator', (): void => {
  it('validates a genuine credential and returns the bound holder key.', (): void => {
    const result = validator().validate(issued().jws, {
      program: 'https://databox.example/programs/rewards-v1',
      databox: 'https://databox.example/boxes/bx_7/',
      relationship: 'urn:uuid:rel-1',
      now: 1_000_500,
    });
    expect(result.holderThumbprint).toBe(jwkThumbprint(holder.publicJwk));
    expect(result.credential.issuer).toBe(ISSUER);
  });

  it('validates without expectations using the wall clock.', (): void => {
    const fresh = new ConnectionCredentialIssuer(ISSUER, issuerKeys.privateKey, 'k').issue({
      pairwiseWebId: 'https://vault.example/id#me',
      holderPublicJwk: holder.publicJwk,
      program: 'https://databox.example/programs/rewards-v1',
      databox: 'https://databox.example/boxes/bx_7/',
      storageDescription: 'https://databox.example/boxes/bx_7/description',
      accessGrant: { id: 'g', bytes: 'x' },
      accessProfile: 'https://w3id.org/solid-databox/access/v1',
      conformsTo: [ 'https://solidproject.org/TR/protocol' ],
      syncProfile: 'https://w3id.org/solid-databox/sync/v1',
      relationship: 'urn:uuid:rel-1',
      statusListIndex: 0,
      statusListCredential: 'https://databox.example/status/1',
    });
    expect(validator().validate(fresh.jws).credential.id).toBe(fresh.connectionId);
  });

  it('rejects a wrong JWS typ.', (): void => {
    const jws = signCompactJws({ alg: 'ES256', typ: 'jwt' }, { issuer: ISSUER }, issuerKeys.privateKey);
    expect((): unknown => validator().validate(jws)).toThrow('Unexpected JWS typ');
  });

  it('rejects a missing or untrusted issuer.', (): void => {
    expect((): unknown => validator().validate(craft({ noIssuer: true }))).toThrow('missing an issuer');
    const foreign = signCompactJws(
      { alg: 'ES256', typ: CONNECTION_CREDENTIAL_JWS_TYP },
      { issuer: 'https://evil.example/#x' },
      issuerKeys.privateKey,
    );
    expect((): unknown => validator().validate(foreign)).toThrow('issuer is not trusted');
  });

  it('rejects a signature that does not verify against the trusted key.', (): void => {
    const otherKey = generateEs256KeyPair().publicKey;
    expect((): unknown => validator(otherKey).validate(issued().jws)).toThrow('signature verification failed');
  });

  it('rejects an alg-swapped credential before checking the signature (LOW-1).', (): void => {
    const none = signCompactJws(
      { alg: 'none', typ: CONNECTION_CREDENTIAL_JWS_TYP },
      baseBody(),
      issuerKeys.privateKey,
    );
    expect((): unknown => validator().validate(none, { now: 1_000_500 })).toThrow('Unsupported JWS alg');
  });

  it('rejects a malformed credential shape.', (): void => {
    expect((): unknown => validator().validate(craft({ ...baseBody(), type: [ VERIFIABLE_CREDENTIAL_TYPE ]})))
      .toThrow('DataboxConnectionCredential');
    const noDates = baseBody();
    delete noDates.validFrom;
    expect((): unknown => validator().validate(craft(noDates))).toThrow('validFrom/validUntil');
    expect((): unknown => validator().validate(craft({ ...baseBody(), credentialSubject: null })))
      .toThrow('missing a credentialSubject');
  });

  it('rejects a broken holder binding.', (): void => {
    const noHolder = baseBody();
    (noHolder.credentialSubject as Record<string, unknown>).holder = null;
    expect((): unknown => validator().validate(craft(noHolder))).toThrow('missing a holder-key binding');

    const badThumb = baseBody();
    ((badThumb.credentialSubject as Record<string, unknown>).holder as Record<string, unknown>).thumbprint = 'wrong';
    expect((): unknown => validator().validate(craft(badThumb))).toThrow('thumbprint does not match');
  });

  it('rejects an invalid or out-of-window validity.', (): void => {
    expect((): unknown => validator().validate(craft({ ...baseBody(), validFrom: 'nope' })))
      .toThrow('unparseable validity');
    expect((): unknown => validator().validate(issued().jws, { now: 0 })).toThrow('not yet valid');
    expect((): unknown => validator().validate(issued().jws, { now: 9_999_999_999 })).toThrow('expired');
  });

  it('rejects a realm mismatch (cross-program replay, T-08).', (): void => {
    const noConn = baseBody();
    (noConn.credentialSubject as Record<string, unknown>).connection = null;
    expect((): unknown => validator().validate(craft(noConn), { now: 1_000_500 }))
      .toThrow('missing a connection binding');
    expect((): unknown => validator().validate(issued().jws, { program: 'https://other.example/', now: 1_000_500 }))
      .toThrow('T-08');
    expect((): unknown => validator().validate(issued().jws, { databox: 'https://other.example/', now: 1_000_500 }))
      .toThrow('T-08');
    expect((): unknown => validator().validate(issued().jws, { accessGrantDigest: 'urn:sha256:bad', now: 1_000_500 }))
      .toThrow('T-08');
    expect((): unknown => validator().validate(issued().jws, { relationship: 'other', now: 1_000_500 }))
      .toThrow('T-08');
  });
});
