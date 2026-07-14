import { IssuerTrustStore } from '../../../../src/databox/proof/IssuerTrustStore';
import type { IssuerKeyDescriptor } from '../../../../src/databox/proof/RecordProofTypes';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { generateEs256KeyPair, ISSUER, KID } from './RecordTestSupport';

const key = generateEs256KeyPair();
const T1 = Date.parse('2026-01-01T00:00:00.000Z');
const T2 = Date.parse('2026-06-01T00:00:00.000Z');

function descriptor(overrides: Partial<IssuerKeyDescriptor> = {}): IssuerKeyDescriptor {
  return {
    issuer: ISSUER,
    verificationMethod: KID,
    publicKeyJwk: key.publicJwk,
    status: 'active',
    validFrom: new Date(T1).toISOString(),
    ...overrides,
  };
}

describe('IssuerTrustStore', (): void => {
  it('is scoped to a program.', (): void => {
    expect(new IssuerTrustStore('prog-1', [ descriptor() ]).programId).toBe('prog-1');
  });

  it('resolves an active key valid at issuance time.', (): void => {
    const store = new IssuerTrustStore('p', [ descriptor() ]);
    expect((): unknown => store.resolve(ISSUER, KID, T2)).not.toThrow();
  });

  it('rejects an unknown issuer or verification method (T-20 substituted key).', (): void => {
    const store = new IssuerTrustStore('p', [ descriptor() ]);
    expect((): unknown => store.resolve('https://other.example/#x', KID, T2)).toThrow('not trusted');
    expect((): unknown => store.resolve(ISSUER, 'https://other/#k', T2)).toThrow('T-20');
  });

  it('rejects a revoked/compromised key even for a historical record (T-20).', (): void => {
    const store = new IssuerTrustStore('p', [ descriptor({ status: 'revoked' }) ]);
    expect((): unknown => store.resolve(ISSUER, KID, T2)).toThrow('revoked/compromised');
  });

  it('rejects if ANY matching descriptor is revoked, even when an active one is listed first (L1).', (): void => {
    // A later `revoked` duplicate must not be shadowed by an earlier active/rotated match.
    const store = new IssuerTrustStore('p', [ descriptor({ status: 'active' }), descriptor({ status: 'revoked' }) ]);
    expect((): unknown => store.resolve(ISSUER, KID, T2)).toThrow('revoked/compromised');
  });

  it('accepts a since-rotated key within its window and rejects use after retirement.', (): void => {
    const rotated = descriptor({ status: 'rotated', validUntil: new Date(T2).toISOString() });
    const store = new IssuerTrustStore('p', [ rotated ]);
    // A record issued before rotation still verifies.
    expect((): unknown => store.resolve(ISSUER, KID, T1 + 1000)).not.toThrow();
    // A "record" claiming issuance after the key was retired is refused (cannot mint new records).
    expect((): unknown => store.resolve(ISSUER, KID, T2)).toThrow('after its signing key was retired');
  });

  it('rejects a record issued before the key became valid.', (): void => {
    const store = new IssuerTrustStore('p', [ descriptor() ]);
    expect((): unknown => store.resolve(ISSUER, KID, T1 - 1000)).toThrow('before its signing key became valid');
  });

  it('fails closed at construction on an unparseable validFrom.', (): void => {
    expect((): IssuerTrustStore => new IssuerTrustStore('p', [ descriptor({ validFrom: 'nope' }) ]))
      .toThrow('unparseable validFrom');
  });

  it('fails closed at construction when validUntil is not after validFrom.', (): void => {
    expect((): IssuerTrustStore =>
      new IssuerTrustStore('p', [ descriptor({ validUntil: new Date(T1 - 1).toISOString() }) ]))
      .toThrow('validUntil after validFrom');
    expect((): IssuerTrustStore =>
      new IssuerTrustStore('p', [ descriptor({ validUntil: 'nope' }) ])).toThrow(BadRequestHttpError);
  });

  it('fails closed at construction on a non-P-256 public key.', (): void => {
    const bad = descriptor({ publicKeyJwk: { ...key.publicJwk, crv: 'P-384' as 'P-256' }});
    expect((): IssuerTrustStore => new IssuerTrustStore('p', [ bad ])).toThrow(BadRequestHttpError);
  });
});
