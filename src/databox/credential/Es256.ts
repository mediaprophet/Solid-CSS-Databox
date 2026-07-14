import type { KeyObject } from 'node:crypto';
import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { InternalServerError } from '../../util/errors/InternalServerError';
import type { PublicJwk } from './ConnectionCredentialTypes';
import { CONNECTION_CREDENTIAL_ALG } from './ConnectionCredentialTypes';

/**
 * ES256 (ECDSA P-256 + SHA-256) JOSE primitives for the connection credential and holder-proof ceremony
 * (ADR-0007/0008), built on `node:crypto` only — no new dependency (DBX-13 constraint 4). Two properties
 * matter for the security invariants:
 *
 * - **JOSE-shaped signatures.** `node:crypto` emits DER-encoded ECDSA signatures by default; JOSE requires
 *   the fixed-length raw `r || s` concatenation. Every sign/verify here passes
 *   `dsaEncoding: 'ieee-p1363'` so the bytes are interoperable JOSE ES256, not DER.
 * - **Fail closed.** A malformed token, a bad segment, an unexpected key type or a failed signature raises
 *   a {@link BadRequestHttpError} — never a silent pass and never a raw `TypeError`.
 *
 * This module is deliberately tiny and self-contained: it is the one place raw crypto is called, so the
 * residual human cryptographic review (DBX-13 gate) has a single, small surface to audit.
 */

/** Base64url-encode raw bytes or a UTF-8 string (no padding, URL alphabet). */
export function base64UrlEncode(input: Buffer | string): string {
  return (typeof input === 'string' ? Buffer.from(input, 'utf8') : input).toString('base64url');
}

/** Base64url-decode to raw bytes. */
export function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/** SHA-256 digest of `data`, hex-encoded. */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data).digest('hex');
}

/**
 * Derive the public {@link PublicJwk} (EC P-256) from a `node:crypto` key object, rejecting any key that is
 * not P-256 (fail closed — the profile is ES256 only). The private `d` is never included.
 */
export function publicJwkFromKeyObject(key: KeyObject): PublicJwk {
  const jwk = key.export({ format: 'jwk' }) as Record<string, unknown>;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new InternalServerError('ES256 requires an EC P-256 key; refusing a non-P-256 key.');
  }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

/**
 * Turn a {@link PublicJwk} into a `node:crypto` public key object, failing closed on any structurally
 * invalid JWK (a caller-supplied holder key that cannot be imported is rejected, not trusted).
 */
export function keyObjectFromPublicJwk(jwk: PublicJwk): KeyObject {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new BadRequestHttpError('Holder key must be an EC P-256 public JWK.');
  }
  try {
    return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  } catch {
    throw new BadRequestHttpError('Holder key is not a valid EC P-256 public JWK.');
  }
}

/**
 * RFC 7638 JWK thumbprint (SHA-256, base64url) of an EC public key. The canonical member set for EC is
 * exactly `{crv, kty, x, y}` in lexicographic order with no whitespace — this is what the holder-proof
 * ceremony and token cache key on, so it must be computed identically everywhere.
 */
export function jwkThumbprint(jwk: PublicJwk): string {
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new BadRequestHttpError('Cannot thumbprint a JWK without x and y.');
  }
  const canonical = `{"crv":"P-256","kty":"EC","x":${JSON.stringify(jwk.x)},"y":${JSON.stringify(jwk.y)}}`;
  return base64UrlEncode(createHash('sha256').update(canonical, 'utf8').digest());
}

/**
 * Sign `header`.`payload` as an ES256 compact JWS. `privateKey` must be a P-256 private key object.
 * The signature is the JOSE raw `r || s` form (`ieee-p1363`), never DER.
 */
export function signCompactJws(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: KeyObject,
): string {
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = cryptoSign(
    'sha256',
    Buffer.from(signingInput, 'utf8'),
    { key: privateKey, dsaEncoding: 'ieee-p1363' },
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/** The decoded parts of a compact JWS. */
export interface DecodedJws {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  readonly signingInput: string;
  readonly signature: Buffer;
}

function parseJsonSegment(segment: string, message: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(segment).toString('utf8'));
  } catch {
    throw new BadRequestHttpError(message);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestHttpError(message);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Split and decode a compact JWS **without** verifying the signature. Used only to read the header (to
 * resolve which issuer key to verify against) and never trusted on its own — {@link verifyCompactJws}
 * is what actually establishes authenticity.
 */
export function decodeCompactJws(jws: string): DecodedJws {
  const parts = jws.split('.');
  if (parts.length !== 3 || parts.some((part): boolean => part.length === 0)) {
    throw new BadRequestHttpError('Malformed compact JWS: expected three non-empty segments.');
  }
  return {
    header: parseJsonSegment(parts[0], 'Malformed JWS header.'),
    payload: parseJsonSegment(parts[1], 'Malformed JWS payload.'),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlDecode(parts[2]),
  };
}

/**
 * Verify a compact ES256 JWS against `publicKey` and return the decoded header + payload. A structurally
 * bad token or a signature that does not verify raises {@link BadRequestHttpError} (fail closed) — the
 * caller therefore only ever sees authenticated content.
 */
export function verifyCompactJws(jws: string, publicKey: KeyObject): DecodedJws {
  const decoded = decodeCompactJws(jws);
  // LOW-1: pin the algorithm. Reject `alg:none` and any alg-swap (e.g. HS256) BEFORE touching the
  // signature, so an attacker cannot downgrade the securing mechanism (alg-confusion structurally denied).
  if (decoded.header.alg !== CONNECTION_CREDENTIAL_ALG) {
    throw new BadRequestHttpError(`Unsupported JWS alg; only ${CONNECTION_CREDENTIAL_ALG} is accepted.`);
  }
  // LOW-2: on current OpenSSL `crypto.verify` in `ieee-p1363` mode returns `false` for a wrong/wrong-length/
  // malformed raw ES256 signature, but older OpenSSL builds THROW instead. Wrap so either outcome maps to a
  // single fail-closed result: any signature that is not a valid ES256 signature over the input is rejected.
  let ok: boolean;
  try {
    ok = cryptoVerify(
      'sha256',
      Buffer.from(decoded.signingInput, 'utf8'),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      decoded.signature,
    );
  } catch {
    /* istanbul ignore next -- platform-dependent: only older OpenSSL throws here; current runtime returns false. */
    ok = false;
  }
  if (!ok) {
    throw new BadRequestHttpError('JWS signature verification failed.');
  }
  return decoded;
}
