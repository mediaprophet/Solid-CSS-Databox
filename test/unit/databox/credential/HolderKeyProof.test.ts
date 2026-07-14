import type { ProofChallenge } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { jwkThumbprint, signCompactJws } from '../../../../src/databox/credential/Es256';
import {
  HolderKeyProofVerifier,
  signHolderProof,
} from '../../../../src/databox/credential/HolderKeyProof';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { generateEs256KeyPair } from './TestKeys';

const AUDIENCE = 'https://databox.example/boxes/bx_1/';

describe('HolderKeyProofVerifier', (): void => {
  const holder = generateEs256KeyPair();
  const thumbprint = jwkThumbprint(holder.publicJwk);

  function sign(challenge: ProofChallenge): string {
    return signHolderProof(challenge, holder.privateKey, thumbprint);
  }

  it('issues a challenge and verifies a fresh, correctly-bound proof.', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const challenge = verifier.issueChallenge(AUDIENCE);
    // No explicit `now` — exercises the default-clock path.
    expect(verifier.verify(sign(challenge), holder.publicJwk, AUDIENCE)).toEqual(challenge);
  });

  it('rejects a challenge request with an empty audience.', (): void => {
    const verifier = new HolderKeyProofVerifier();
    expect((): unknown => verifier.issueChallenge('')).toThrow(BadRequestHttpError);
  });

  it('rejects a proof signed by a different key (T-17).', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const challenge = verifier.issueChallenge(AUDIENCE, { now: 0 });
    const attacker = generateEs256KeyPair();
    const forged = signHolderProof(challenge, attacker.privateKey, thumbprint);
    expect((): unknown => verifier.verify(forged, holder.publicJwk, AUDIENCE, 1)).toThrow(BadRequestHttpError);
  });

  it('rejects a proof whose kid does not match the bound key, and accepts one with no kid.', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const challenge = verifier.issueChallenge(AUDIENCE, { now: 0 });
    const badKid = signCompactJws({ alg: 'ES256', kid: 'wrong' }, { ...challenge }, holder.privateKey);
    expect((): unknown => verifier.verify(badKid, holder.publicJwk, AUDIENCE, 1))
      .toThrow('kid does not match');

    const verifier2 = new HolderKeyProofVerifier();
    const challenge2 = verifier2.issueChallenge(AUDIENCE, { now: 0 });
    const noKid = signCompactJws({ alg: 'ES256' }, { ...challenge2 }, holder.privateKey);
    expect(verifier2.verify(noKid, holder.publicJwk, AUDIENCE, 1)).toEqual(challenge2);
  });

  it('rejects a proof missing a nonce/audience payload.', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const empty = signCompactJws({ alg: 'ES256' }, { foo: 'bar' }, holder.privateKey);
    expect((): unknown => verifier.verify(empty, holder.publicJwk, AUDIENCE, 1)).toThrow('missing a nonce');
  });

  it('rejects a nonce that was never issued.', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const strayChallenge: ProofChallenge = {
      nonce: 'never-issued',
      audience: AUDIENCE,
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(1_000_000).toISOString(),
    };
    expect((): unknown => verifier.verify(sign(strayChallenge), holder.publicJwk, AUDIENCE, 1))
      .toThrow('never issued');
  });

  it('rejects replay of a consumed nonce (T-19).', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const challenge = verifier.issueChallenge(AUDIENCE, { now: 0 });
    const proof = sign(challenge);
    verifier.verify(proof, holder.publicJwk, AUDIENCE, 1);
    expect((): unknown => verifier.verify(proof, holder.publicJwk, AUDIENCE, 1)).toThrow('already been used');
  });

  it('rejects an audience mismatch between proof, challenge and expectation (T-52).', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const challenge = verifier.issueChallenge(AUDIENCE, { now: 0 });
    // Caller expects a different audience than the challenge was bound to.
    expect((): unknown => verifier.verify(sign(challenge), holder.publicJwk, 'https://other.example/', 1))
      .toThrow('audience does not match');

    // A proof whose signed audience differs from the issued challenge's audience.
    const verifier2 = new HolderKeyProofVerifier();
    const challenge2 = verifier2.issueChallenge(AUDIENCE, { now: 0 });
    const tampered = sign({ ...challenge2, audience: 'https://swapped.example/' });
    expect((): unknown => verifier2.verify(tampered, holder.publicJwk, 'https://swapped.example/', 1))
      .toThrow('audience does not match');
  });

  it('rejects an expired challenge.', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const challenge = verifier.issueChallenge(AUDIENCE, { now: 0, ttlMs: 100 });
    expect((): unknown => verifier.verify(sign(challenge), holder.publicJwk, AUDIENCE, 1000)).toThrow('expired');
  });

  it('evicts expired outstanding challenges on the next issuance (MED-5).', (): void => {
    const verifier = new HolderKeyProofVerifier();
    verifier.issueChallenge(AUDIENCE, { now: 0, ttlMs: 100 });
    expect(verifier.pendingChallengeCount).toBe(1);
    // A later issuance sweeps the un-presented, now-expired challenge — the store does not grow unbounded.
    verifier.issueChallenge(AUDIENCE, { now: 1000, ttlMs: 100 });
    expect(verifier.pendingChallengeCount).toBe(1);
  });

  it('evicts consumed nonces once their window passes (MED-5).', (): void => {
    const verifier = new HolderKeyProofVerifier();
    const challenge = verifier.issueChallenge(AUDIENCE, { now: 0, ttlMs: 100 });
    verifier.verify(sign(challenge), holder.publicJwk, AUDIENCE, 1);
    // Trigger a sweep past the consumed nonce's window; the nonce is forgotten, so a replay now reads as
    // "never issued" rather than "already used" — proving the consumed set is bounded, not ever-growing.
    verifier.issueChallenge(AUDIENCE, { now: 1000 });
    expect((): unknown => verifier.verify(sign(challenge), holder.publicJwk, AUDIENCE, 1001)).toThrow('never issued');
  });
});
