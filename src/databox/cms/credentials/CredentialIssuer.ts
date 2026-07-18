import type { KeyObject } from 'node:crypto';
import { BadRequestHttpError } from '../../../util/errors/BadRequestHttpError';
import { CONNECTION_CREDENTIAL_ALG } from '../../credential/ConnectionCredentialTypes';
import { signCompactJws, verifyCompactJws } from '../../credential/Es256';

export interface IssueInput {
  /** The credential claim to secure (e.g. a minimal-disclosure attestation). */
  readonly credential: Record<string, unknown>;
  /** Issuer identifier (the `iss` claim). */
  readonly issuer: string;
  /** Subject identifier (the `sub` claim). */
  readonly subject: string;
  /** Issuance time, epoch seconds (caller-supplied — this never reads the clock). */
  readonly issuedAt: number;
  /** Optional expiry, epoch seconds. */
  readonly expires?: number;
}

/**
 * Issue a Verifiable Credential secured as an ES256 compact JWS — a JWT-VC — reusing the databox's audited
 * {@link signCompactJws} primitive (see `databox/solid-cms-plan.md`, §5.5). No new cryptography: the claim
 * (e.g. a minimal-disclosure attestation) is carried in the `vc` claim and the issuer signs over it.
 * Pure given the key; `issuedAt`/`expires` are caller-supplied epoch seconds.
 */
export function issueCredential(input: IssueInput, privateKey: KeyObject): string {
  if (input.issuer.trim().length === 0 || input.subject.trim().length === 0) {
    throw new BadRequestHttpError('A credential needs a non-empty issuer and subject.');
  }
  const payload: Record<string, unknown> = {
    iss: input.issuer,
    sub: input.subject,
    iat: input.issuedAt,
    vc: input.credential,
  };
  if (input.expires !== undefined) {
    payload.exp = input.expires;
  }
  return signCompactJws({ alg: CONNECTION_CREDENTIAL_ALG, typ: 'vc+jwt' }, payload, privateKey);
}

/**
 * Verify a JWT-VC against the issuer public key and an `asOf` time (epoch seconds), returning the verified
 * `vc` claim. Fails closed: a bad signature (via {@link verifyCompactJws}) or a credential past its `exp`
 * raises {@link BadRequestHttpError}, so the caller only ever sees an authentic, unexpired credential.
 */
export function verifyCredential(jws: string, publicKey: KeyObject, asOf: number): Record<string, unknown> {
  const { payload } = verifyCompactJws(jws, publicKey);
  if (typeof payload.exp === 'number' && asOf > payload.exp) {
    throw new BadRequestHttpError('Credential has expired.');
  }
  return payload.vc as Record<string, unknown>;
}
