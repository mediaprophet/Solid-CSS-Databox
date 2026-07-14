import type { KeyObject } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { ProofChallenge, PublicJwk } from './ConnectionCredentialTypes';
import { CONNECTION_CREDENTIAL_ALG } from './ConnectionCredentialTypes';
import { jwkThumbprint, keyObjectFromPublicJwk, signCompactJws, verifyCompactJws } from './Es256';

/**
 * The holder-key proof ceremony (ADR-0008): the vault proves control of the bound holder private key by
 * signing a **fresh, server-issued, single-use** challenge (nonce + audience + expiry). Required at
 * connection, at **every** unattended token request, and at migration/recovery — possession of the
 * credential document is never sufficient (ADR-0007, invariant 4). This is the mechanism that makes the
 * credential holder-bound rather than a bearer token.
 *
 * Threats defended here:
 * - **T-52 (onboarding proof MITM / replay):** the challenge is bound to one `audience` and one `nonce`
 *   that the *verifier* minted; a proof signed for a different audience, or replaying a consumed/expired
 *   nonce, is rejected.
 * - **T-19 (token/proof replay):** each nonce is single-use — accepted exactly once, then consumed.
 * - **T-17 (credential-bytes-as-token):** the proof must be signed by the credential's bound holder key;
 *   copied credential bytes without that private key cannot produce an accepted proof.
 */

/** The default challenge lifetime in milliseconds (short — a fresh proof per exchange, ADR-0009). */
export const DEFAULT_CHALLENGE_TTL_MS = 120_000;

/** The JOSE `typ` for a holder-proof JWS, distinguishing it from the credential JWS. */
export const HOLDER_PROOF_JWS_TYP = 'databox-holder-proof+jwt';

/** Options controlling challenge issuance (all deterministic-testable via `now`). */
export interface ChallengeOptions {
  /** Bytes of nonce entropy (default 16 = 128 bits). */
  readonly nonceBytes?: number;
  /** Challenge lifetime in ms (default {@link DEFAULT_CHALLENGE_TTL_MS}). */
  readonly ttlMs?: number;
  /** The current instant in epoch ms (default `Date.now()`), injectable for tests. */
  readonly now?: number;
}

/**
 * Sign a challenge with the holder private key, producing the compact-JWS proof the vault sends back.
 * This is the vault-side half of the ceremony (also used by tests). The header carries the holder key's
 * thumbprint as `kid` so the verifier can bind the proof to a specific holder key.
 */
export function signHolderProof(
  challenge: ProofChallenge,
  holderPrivateKey: KeyObject,
  holderThumbprint: string,
): string {
  return signCompactJws(
    { alg: CONNECTION_CREDENTIAL_ALG, typ: HOLDER_PROOF_JWS_TYP, kid: holderThumbprint },
    { ...challenge },
    holderPrivateKey,
  );
}

/**
 * The verifier side of the ceremony. It **issues** challenges (so the nonce and audience are always
 * server-chosen, never attacker-chosen) and **verifies** the returned proof against a supplied bound
 * holder key, consuming the nonce so it can never be replayed.
 *
 * State (outstanding + consumed nonces) is process-local here; a production deployment backs it with a
 * shared short-TTL store so the single-use guarantee holds across nodes — the interface is unchanged.
 */
export class HolderKeyProofVerifier {
  private readonly outstanding = new Map<string, ProofChallenge>();
  /** Consumed nonces mapped to the epoch-ms instant after which they can be forgotten (MED-5). */
  private readonly consumed = new Map<string, number>();

  public constructor(private readonly defaultTtlMs: number = DEFAULT_CHALLENGE_TTL_MS) {}

  /** The number of un-presented challenges still held — exposed for eviction assertions (MED-5). */
  public get pendingChallengeCount(): number {
    return this.outstanding.size;
  }

  /** Issue a fresh single-use challenge bound to exactly one `audience`. */
  public issueChallenge(audience: string, options: ChallengeOptions = {}): ProofChallenge {
    if (typeof audience !== 'string' || audience.length === 0) {
      throw new BadRequestHttpError('A holder-proof challenge requires a non-empty audience.');
    }
    const now = options.now ?? Date.now();
    const ttl = options.ttlMs ?? this.defaultTtlMs;
    // MED-5: sweep expired challenges/nonces on every issuance so neither map grows without bound. An
    // expired outstanding challenge is unusable (freshness check denies it) and an expired consumed nonce is
    // likewise unusable once its window has passed, so dropping both is safe.
    this.evictExpired(now);
    const challenge: ProofChallenge = {
      nonce: randomBytes(options.nonceBytes ?? 16).toString('base64url'),
      audience,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
    };
    this.outstanding.set(challenge.nonce, challenge);
    return challenge;
  }

  private evictExpired(now: number): void {
    for (const [ nonce, challenge ] of this.outstanding) {
      if (now >= Date.parse(challenge.expiresAt)) {
        this.outstanding.delete(nonce);
      }
    }
    for (const [ nonce, forgetAfter ] of this.consumed) {
      if (now >= forgetAfter) {
        this.consumed.delete(nonce);
      }
    }
  }

  /**
   * Verify a holder proof and return the challenge it satisfied. Fails closed if the proof: is not signed
   * by `boundHolderKey`; carries a nonce that was never issued, already consumed, or expired; or names a
   * different audience than the one the challenge was issued for. On success the nonce is consumed
   * (single-use) so a replay of the exact same proof is rejected.
   *
   * @param proofJws - The compact-JWS proof the vault returned.
   * @param boundHolderKey - The holder public key bound in the credential (proof MUST verify against it).
   * @param expectedAudience - The audience the caller requires the proof to be bound to.
   * @param now - Current instant (epoch ms), injectable for tests; defaults to `Date.now()`.
   */
  public verify(
    proofJws: string,
    boundHolderKey: PublicJwk,
    expectedAudience: string,
    now: number = Date.now(),
  ): ProofChallenge {
    // 1. Authenticity: the proof must verify against the credential's bound holder key (T-17).
    const holderKeyObject = keyObjectFromPublicJwk(boundHolderKey);
    const decoded = verifyCompactJws(proofJws, holderKeyObject);

    // 2. The proof's kid, when present, must match the bound holder key's thumbprint (no key substitution).
    const thumbprint = jwkThumbprint(boundHolderKey);
    if (typeof decoded.header.kid === 'string' && decoded.header.kid !== thumbprint) {
      throw new BadRequestHttpError('Holder proof kid does not match the bound holder key.');
    }

    // 3. The payload must be a well-formed challenge referencing an outstanding, unconsumed nonce.
    const nonce = decoded.payload.nonce;
    const audience = decoded.payload.audience;
    if (typeof nonce !== 'string' || typeof audience !== 'string') {
      throw new BadRequestHttpError('Holder proof payload is missing a nonce or audience.');
    }
    if (this.consumed.has(nonce)) {
      throw new BadRequestHttpError('Holder proof nonce has already been used (replay rejected).');
    }
    const challenge = this.outstanding.get(nonce);
    if (!challenge) {
      throw new BadRequestHttpError('Holder proof nonce was never issued by this verifier.');
    }

    // 4. Audience binding: the signed audience, the issued challenge and the caller's requirement must agree
    //    (T-52 — a proof captured for one audience cannot be replayed against another).
    if (audience !== challenge.audience || audience !== expectedAudience) {
      this.consume(nonce, challenge);
      throw new BadRequestHttpError('Holder proof audience does not match the challenge audience.');
    }

    // 5. Freshness: the challenge must not have expired.
    if (now >= Date.parse(challenge.expiresAt)) {
      this.consume(nonce, challenge);
      throw new BadRequestHttpError('Holder proof challenge has expired.');
    }

    this.consume(nonce, challenge);
    return challenge;
  }

  private consume(nonce: string, challenge: ProofChallenge): void {
    this.outstanding.delete(nonce);
    // Remember the nonce only until its challenge would have expired; after that the freshness check would
    // reject it anyway, so it is safe to forget (bounds the consumed set — MED-5).
    this.consumed.set(nonce, Date.parse(challenge.expiresAt));
  }
}
