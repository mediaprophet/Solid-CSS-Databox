import { generateKeyPairSync } from 'node:crypto';
import type { PublicJwk } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import {
  base64UrlDecode,
  base64UrlEncode,
  decodeCompactJws,
  jwkThumbprint,
  keyObjectFromPublicJwk,
  publicJwkFromKeyObject,
  sha256Hex,
  signCompactJws,
  verifyCompactJws,
} from '../../../../src/databox/credential/Es256';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { InternalServerError } from '../../../../src/util/errors/InternalServerError';
import { generateEs256KeyPair } from './TestKeys';

describe('Es256', (): void => {
  const pair = generateEs256KeyPair();

  describe('base64url + sha256', (): void => {
    it('round-trips base64url for strings and buffers.', (): void => {
      expect(base64UrlDecode(base64UrlEncode('hello')).toString('utf8')).toBe('hello');
      expect(base64UrlDecode(base64UrlEncode(Buffer.from([ 1, 2, 3 ]))).toString('hex')).toBe('010203');
    });

    it('hashes strings and buffers identically.', (): void => {
      expect(sha256Hex('abc')).toBe(sha256Hex(Buffer.from('abc', 'utf8')));
      expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/u);
    });
  });

  describe('JWK conversion + thumbprint', (): void => {
    it('derives a P-256 public JWK from a key object.', (): void => {
      expect(pair.publicJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
      expect(typeof pair.publicJwk.x).toBe('string');
    });

    it('rejects a non-P-256 key.', (): void => {
      const ed = generateKeyPairSync('ed25519');
      expect((): unknown => publicJwkFromKeyObject(ed.publicKey)).toThrow(InternalServerError);
    });

    it('imports a valid public JWK and rejects invalid ones.', (): void => {
      expect(keyObjectFromPublicJwk(pair.publicJwk).type).toBe('public');
      expect((): unknown => keyObjectFromPublicJwk({ kty: 'RSA' } as unknown as PublicJwk))
        .toThrow(BadRequestHttpError);
      expect((): unknown => keyObjectFromPublicJwk({ kty: 'EC', crv: 'P-256', x: 'bad', y: 'bad' }))
        .toThrow(BadRequestHttpError);
    });

    it('computes an RFC 7638 thumbprint and rejects a JWK missing coordinates.', (): void => {
      expect(jwkThumbprint(pair.publicJwk)).toMatch(/^[\w-]{43}$/u);
      expect((): unknown => jwkThumbprint({ kty: 'EC', crv: 'P-256' } as unknown as PublicJwk))
        .toThrow(BadRequestHttpError);
    });
  });

  describe('compact JWS', (): void => {
    it('signs and verifies a round-trip.', (): void => {
      const jws = signCompactJws({ alg: 'ES256' }, { hello: 'world' }, pair.privateKey);
      const verified = verifyCompactJws(jws, pair.publicKey);
      expect(verified.payload).toEqual({ hello: 'world' });
      expect(decodeCompactJws(jws).header).toEqual({ alg: 'ES256' });
    });

    it('rejects a JWS without three non-empty segments.', (): void => {
      expect((): unknown => decodeCompactJws('a.b')).toThrow(BadRequestHttpError);
      expect((): unknown => decodeCompactJws('a..c')).toThrow(BadRequestHttpError);
    });

    it('rejects a malformed header/payload segment.', (): void => {
      const good = signCompactJws({ alg: 'ES256' }, { a: 1 }, pair.privateKey).split('.');
      expect((): unknown => decodeCompactJws(`${base64UrlEncode('not json')}.${good[1]}.${good[2]}`))
        .toThrow('Malformed JWS header.');
      // A payload that decodes to a JSON array (not an object) is rejected.
      expect((): unknown => decodeCompactJws(`${good[0]}.${base64UrlEncode('[1,2]')}.${good[2]}`))
        .toThrow('Malformed JWS payload.');
    });

    it('rejects a tampered signature and a badly-encoded signature.', (): void => {
      const parts = signCompactJws({ alg: 'ES256' }, { a: 1 }, pair.privateKey).split('.');
      const other = generateEs256KeyPair();
      // Valid-length but wrong signature (verifies false).
      const wrongSig = signCompactJws({ alg: 'ES256' }, { a: 1 }, other.privateKey).split('.')[2];
      expect((): unknown => verifyCompactJws(`${parts[0]}.${parts[1]}.${wrongSig}`, pair.publicKey))
        .toThrow('JWS signature verification failed.');
      // Malformed (too-short) signature bytes: the current runtime returns `false` here (older OpenSSL
      // would throw — the try/catch maps either outcome to the same fail-closed rejection).
      const shortSig = base64UrlEncode(Buffer.from([ 1, 2, 3 ]));
      expect((): unknown => verifyCompactJws(`${parts[0]}.${parts[1]}.${shortSig}`, pair.publicKey))
        .toThrow(BadRequestHttpError);
    });

    it('pins the algorithm: rejects alg:none and an alg-swap before checking the signature (LOW-1).', (): void => {
      // The bytes are genuinely ES256-signed, but the header lies about the alg — must be rejected on alg.
      const none = signCompactJws({ alg: 'none' }, { a: 1 }, pair.privateKey);
      expect((): unknown => verifyCompactJws(none, pair.publicKey)).toThrow('Unsupported JWS alg');
      const swapped = signCompactJws({ alg: 'HS256' }, { a: 1 }, pair.privateKey);
      expect((): unknown => verifyCompactJws(swapped, pair.publicKey)).toThrow('Unsupported JWS alg');
    });
  });
});
