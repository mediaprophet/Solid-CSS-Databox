import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import type { PublicJwk } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { publicJwkFromKeyObject, signCompactJws } from '../../../../src/databox/credential/Es256';
import { digestOfBytes } from '../../../../src/databox/proof/Canonicalization';
import { IssuerTrustStore } from '../../../../src/databox/proof/IssuerTrustStore';
import type { IssuerKeyDescriptor } from '../../../../src/databox/proof/RecordProofTypes';
import type {
  AcceptanceReceiptBinding,
  AcceptanceReceiptRequest,
  DataboxAcceptanceReceiptCredential,
  DurableCommit,
} from '../../../../src/databox/receipt/AcceptanceReceiptSigner';
import {
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  DBX_RECORD_CONTEXT,
  PINNED_CANONICALIZATION_ALG,
  RECORD_PROOF_JWS_TYP,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
} from '../../../../src/databox/receipt/AcceptanceReceiptSigner';

/** A generated ES256 (P-256) key pair plus its public JWK — test-only material (never a real key). */
export interface TestKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly publicJwk: PublicJwk;
}

/** Generate a fresh, clearly test-only ES256 key pair with `node:crypto` (DBX-18 constraint 4). */
export function generateEs256KeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, privateKey, publicJwk: publicJwkFromKeyObject(publicKey) };
}

export const ISSUER = 'https://org.example/id#issuer';
export const KID = 'https://org.example/id#key-1';
export const NOW = Date.parse('2026-07-14T00:00:00.000Z');
export const COMMITTED_AT = new Date(NOW).toISOString();
export const ACCEPTED_PAYLOAD = Buffer.from('the exact committed record bytes', 'utf8');
export const PAYLOAD_DIGEST = digestOfBytes(ACCEPTED_PAYLOAD);
export const POLICY_DIGEST = `urn:sha256:${'a'.repeat(64)}`;

export const signerKey = generateEs256KeyPair();

/** A trusted-issuer store scoped to `program-1` with a single active key covering NOW. */
export function trustStore(overrides: Partial<IssuerKeyDescriptor> = {}): IssuerTrustStore {
  return new IssuerTrustStore('program-1', [{
    issuer: ISSUER,
    verificationMethod: KID,
    publicKeyJwk: signerKey.publicJwk,
    status: 'active',
    validFrom: new Date(NOW - 1_000_000).toISOString(),
    ...overrides,
  }]);
}

/** A confirmed durable commit over {@link PAYLOAD_DIGEST}, with overridable fields. */
export function validCommit(overrides: Partial<DurableCommit> = {}): DurableCommit {
  return {
    eventId: 'evt-1',
    committedAt: COMMITTED_AT,
    payloadDigest: PAYLOAD_DIGEST,
    confirmed: true,
    ...overrides,
  };
}

/** A complete, valid acceptance-receipt request, with overridable fields. */
export function baseRequest(overrides: Partial<AcceptanceReceiptRequest> = {}): AcceptanceReceiptRequest {
  return {
    transaction: 'urn:uuid:txn-1',
    acceptedResource: 'https://databox.example/boxes/bx_1/records/rcpt_1',
    payloadDigest: PAYLOAD_DIGEST,
    sender: ISSUER,
    addressedRelationship: 'urn:uuid:rel-1',
    operation: 'deposit',
    profileVersion: 'member-v1',
    profileDigest: 'profile-digest-1',
    policyDigest: POLICY_DIGEST,
    odrlPolicy: 'https://databox.example/policies/retail-receipt-v1',
    activatedDuties: [ 'issueReceipt', 'signalHolder' ],
    durableCommit: validCommit(),
    ...overrides,
  };
}

/** Build a receipt binding directly (for verifier negative tests that bypass the signer's validation). */
export function receiptBinding(overrides: Partial<AcceptanceReceiptBinding> = {}): AcceptanceReceiptBinding {
  return {
    transaction: 'urn:uuid:txn-1',
    acceptedResource: 'https://databox.example/boxes/bx_1/records/rcpt_1',
    payloadDigest: PAYLOAD_DIGEST,
    canonicalization: PINNED_CANONICALIZATION_ALG,
    sender: ISSUER,
    addressedRelationship: 'urn:uuid:rel-1',
    acceptedAt: COMMITTED_AT,
    operation: 'deposit',
    profileVersion: 'member-v1',
    profileDigest: 'profile-digest-1',
    policyDigest: POLICY_DIGEST,
    odrlPolicy: 'https://databox.example/policies/retail-receipt-v1',
    activatedDuties: [ 'issueReceipt' ],
    commitEventId: 'evt-1',
    state: 'accepted',
    ...overrides,
  };
}

/** Build a full receipt credential for verifier tests, with overridable binding + credential fields. */
export function receiptCredential(
  bindingOverrides: Partial<AcceptanceReceiptBinding> = {},
  credentialOverrides: Partial<DataboxAcceptanceReceiptCredential> = {},
): DataboxAcceptanceReceiptCredential {
  return {
    '@context': [ VC_V2_CONTEXT, DBX_RECORD_CONTEXT ],
    id: 'urn:uuid:receipt-1',
    type: [ VERIFIABLE_CREDENTIAL_TYPE, DATABOX_RECEIPT_CREDENTIAL_TYPE ],
    issuer: ISSUER,
    validFrom: COMMITTED_AT,
    credentialSubject: { receipt: receiptBinding(bindingOverrides) },
    ...credentialOverrides,
  };
}

/** Sign an arbitrary credential body as a receipt-proof compact JWS (for negative/tamper tests). */
export function signReceipt(
  body: Record<string, unknown>,
  privateKey: KeyObject = signerKey.privateKey,
  header?: Record<string, unknown>,
): string {
  return signCompactJws(header ?? { alg: 'ES256', typ: RECORD_PROOF_JWS_TYP, cty: 'vc', kid: KID }, body, privateKey);
}
