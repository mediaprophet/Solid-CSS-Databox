import { BitstringStatusList, StatusListManager } from '../../../../src/databox/credential/BitstringStatusList';
import type { IssuedConnectionCredential } from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import { ConnectionCredentialIssuer } from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import { ConnectionCredentialRegistry } from '../../../../src/databox/credential/ConnectionCredentialRegistry';
import { ConnectionCredentialValidator } from '../../../../src/databox/credential/ConnectionCredentialValidator';
import { jwkThumbprint } from '../../../../src/databox/credential/Es256';
import { HolderKeyProofVerifier, signHolderProof } from '../../../../src/databox/credential/HolderKeyProof';
import { ProvisionalTokenExchange } from '../../../../src/databox/credential/ProvisionalTokenExchange';
import type { TestKeyPair } from './TestKeys';
import { generateEs256KeyPair } from './TestKeys';

const ISSUER = 'https://databox.example/id#issuer';
const PROGRAM = 'https://databox.example/programs/rewards-v1';
const AUDIENCE = 'https://databox.example/boxes/bx_7/';
const STATUS_INDEX = 10;

const issuerKeys = generateEs256KeyPair();
const holder = generateEs256KeyPair();

function issue(): IssuedConnectionCredential {
  return new ConnectionCredentialIssuer(ISSUER, issuerKeys.privateKey, 'k').issue({
    pairwiseWebId: 'https://vault.example/id#me',
    holderPublicJwk: holder.publicJwk,
    program: PROGRAM,
    databox: AUDIENCE,
    storageDescription: 'https://databox.example/boxes/bx_7/description',
    accessGrant: { id: 'g', bytes: 'x' },
    accessProfile: 'https://w3id.org/solid-databox/access/v1',
    conformsTo: [ 'https://solidproject.org/TR/protocol' ],
    syncProfile: 'https://w3id.org/solid-databox/sync/v1',
    relationship: 'urn:uuid:rel-1',
    statusListIndex: STATUS_INDEX,
    statusListCredential: 'https://databox.example/status/1',
    now: 1_000_000,
    validForMs: 1_000_000,
  });
}

function validator(): ConnectionCredentialValidator {
  return new ConnectionCredentialValidator(new Map([[ ISSUER, issuerKeys.publicKey ]]));
}

function proof(verifier: HolderKeyProofVerifier, key: TestKeyPair = holder): string {
  const challenge = verifier.issueChallenge(AUDIENCE, { now: 1_000_100 });
  return signHolderProof(challenge, key.privateKey, jwkThumbprint(key.publicJwk));
}

const NOW = 1_000_200;

/** A fresh status manager whose bit for the credential's index is clear (not revoked). */
function freshStatus(): StatusListManager {
  return new StatusListManager('https://databox.example/status/1');
}

describe('ProvisionalTokenExchange', (): void => {
  it('returns a provisional (not-wire-format) short-lived token when the full ceremony passes.', (): void => {
    const cred = issue();
    const registry = new ConnectionCredentialRegistry();
    registry.install(cred);
    const statusManager = new StatusListManager('https://databox.example/status/1');
    statusManager.register(cred.connectionId);
    const proofVerifier = new HolderKeyProofVerifier();
    const exchange = new ProvisionalTokenExchange({ validator: validator(), proofVerifier, statusManager, registry });

    const token = exchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(proofVerifier),
      audience: AUDIENCE,
      program: PROGRAM,
      databox: AUDIENCE,
      now: NOW,
    });
    expect(token.notWireFormat).toBe(true);
    expect(token.audience).toBe(AUDIENCE);
    expect(token.connectionId).toBe(cred.connectionId);
    expect(Date.parse(token.expiresAt) - Date.parse(token.issuedAt)).toBe(300_000);
  });

  it('fails closed when NO status source is configured (MED-1 — revocation must not fail open).', (): void => {
    const cred = issue();
    const proofVerifier = new HolderKeyProofVerifier();
    const exchange = new ProvisionalTokenExchange({ validator: validator(), proofVerifier });
    expect((): unknown => exchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(proofVerifier),
      audience: AUDIENCE,
      program: PROGRAM,
      now: NOW,
    })).toThrow('No credential status source');
  });

  it('denies a token whose audience is not the credential\'s bound databox (MED-4).', (): void => {
    const cred = issue();
    const proofVerifier = new HolderKeyProofVerifier();
    const otherAudience = 'https://databox.example/boxes/other/';
    const challenge = proofVerifier.issueChallenge(otherAudience, { now: 1_000_100 });
    const proofJws = signHolderProof(challenge, holder.privateKey, jwkThumbprint(holder.publicJwk));
    const exchange = new ProvisionalTokenExchange({
      validator: validator(),
      proofVerifier,
      statusManager: freshStatus(),
    });
    expect((): unknown => exchange.exchange({
      credentialJws: cred.jws,
      proofJws,
      audience: otherAudience,
      program: PROGRAM,
      now: NOW,
    })).toThrow('not the credential\'s bound databox');
  });

  it('uses the wall clock and a custom token lifetime when none are supplied.', (): void => {
    // Issue against the real clock so the credential is valid "now".
    const cred = new ConnectionCredentialIssuer(ISSUER, issuerKeys.privateKey, 'k').issue({
      pairwiseWebId: 'https://vault.example/id#me',
      holderPublicJwk: holder.publicJwk,
      program: PROGRAM,
      databox: AUDIENCE,
      storageDescription: 'https://databox.example/boxes/bx_7/description',
      accessGrant: { id: 'g', bytes: 'x' },
      accessProfile: 'https://w3id.org/solid-databox/access/v1',
      conformsTo: [ 'https://solidproject.org/TR/protocol' ],
      syncProfile: 'https://w3id.org/solid-databox/sync/v1',
      relationship: 'urn:uuid:rel-1',
      statusListIndex: STATUS_INDEX,
      statusListCredential: 'https://databox.example/status/1',
      validForMs: 3_600_000,
    });
    const proofVerifier = new HolderKeyProofVerifier();
    const challenge = proofVerifier.issueChallenge(AUDIENCE);
    const proofJws = signHolderProof(challenge, holder.privateKey, jwkThumbprint(holder.publicJwk));
    const exchange = new ProvisionalTokenExchange({
      validator: validator(),
      proofVerifier,
      statusManager: freshStatus(),
    });
    const token = exchange.exchange({
      credentialJws: cred.jws,
      proofJws,
      audience: AUDIENCE,
      program: PROGRAM,
      tokenTtlMs: 60_000,
    });
    expect(Date.parse(token.expiresAt) - Date.parse(token.issuedAt)).toBe(60_000);
  });

  it('denies credential bytes presented without a valid holder proof (T-17).', (): void => {
    const cred = issue();
    const proofVerifier = new HolderKeyProofVerifier();
    const exchange = new ProvisionalTokenExchange({ validator: validator(), proofVerifier });
    // A proof signed by a different key cannot verify against the bound holder key.
    const attacker = generateEs256KeyPair();
    expect((): unknown => exchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(proofVerifier, attacker),
      audience: AUDIENCE,
      program: PROGRAM,
      now: NOW,
    })).toThrow('signature verification failed');
  });

  it('denies replay against a different program (T-08).', (): void => {
    const cred = issue();
    const proofVerifier = new HolderKeyProofVerifier();
    const exchange = new ProvisionalTokenExchange({ validator: validator(), proofVerifier });
    expect((): unknown => exchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(proofVerifier),
      audience: AUDIENCE,
      program: 'https://other.example/',
      now: NOW,
    })).toThrow('T-08');
  });

  it('denies a revoked credential via the status manager (by the credential\'s own index, MED-3).', (): void => {
    const cred = issue();
    const statusManager = new StatusListManager('https://databox.example/status/1');
    // Revoke by the credential's OWN embedded index — exactly what the exchange re-checks.
    statusManager.setRevokedByIndex(STATUS_INDEX, true);
    const proofVerifier = new HolderKeyProofVerifier();
    const exchange = new ProvisionalTokenExchange({ validator: validator(), proofVerifier, statusManager });
    expect((): unknown => exchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(proofVerifier),
      audience: AUDIENCE,
      program: PROGRAM,
      now: NOW,
    })).toThrow('revoked');
  });

  it('checks a published status list in preference to the manager.', (): void => {
    const cred = issue();
    const revokedList = new BitstringStatusList();
    revokedList.setStatus(STATUS_INDEX, true);
    const pv1 = new HolderKeyProofVerifier();
    const revokedExchange = new ProvisionalTokenExchange({
      validator: validator(),
      proofVerifier: pv1,
      statusList: revokedList,
    });
    expect((): unknown => revokedExchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(pv1),
      audience: AUDIENCE,
      program: PROGRAM,
      now: NOW,
    })).toThrow('published status list');

    // StatusList unset takes precedence over a (revoked) statusManager and lets the exchange through.
    const cleanList = new BitstringStatusList();
    const statusManager = new StatusListManager('https://databox.example/status/1');
    statusManager.register(cred.connectionId);
    statusManager.setRevoked(cred.connectionId, true);
    const pv2 = new HolderKeyProofVerifier();
    const cleanExchange = new ProvisionalTokenExchange({
      validator: validator(),
      proofVerifier: pv2,
      statusList: cleanList,
      statusManager,
    });
    expect(cleanExchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(pv2),
      audience: AUDIENCE,
      program: PROGRAM,
      now: NOW,
    }).notWireFormat).toBe(true);
  });

  it('denies when the connection is absent from or not active in the registry (prompt revocation).', (): void => {
    const cred = issue();
    const emptyRegistry = new ConnectionCredentialRegistry();
    const pv1 = new HolderKeyProofVerifier();
    const missingExchange = new ProvisionalTokenExchange({
      validator: validator(),
      proofVerifier: pv1,
      statusManager: freshStatus(),
      registry: emptyRegistry,
    });
    expect((): unknown => missingExchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(pv1),
      audience: AUDIENCE,
      program: PROGRAM,
      now: NOW,
    })).toThrow('not present');

    const registry = new ConnectionCredentialRegistry();
    registry.install(cred);
    registry.suspend(PROGRAM, cred.connectionId);
    const pv2 = new HolderKeyProofVerifier();
    const suspendedExchange = new ProvisionalTokenExchange({
      validator: validator(),
      proofVerifier: pv2,
      statusManager: freshStatus(),
      registry,
    });
    expect((): unknown => suspendedExchange.exchange({
      credentialJws: cred.jws,
      proofJws: proof(pv2),
      audience: AUDIENCE,
      program: PROGRAM,
      now: NOW,
    })).toThrow('suspended');
  });
});
