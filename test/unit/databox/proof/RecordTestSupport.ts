import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { BitstringStatusList, StatusListManager } from '../../../../src/databox/credential/BitstringStatusList';
import type { PublicJwk } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { publicJwkFromKeyObject, sha256Hex, signCompactJws } from '../../../../src/databox/credential/Es256';
import { PinnedContextSet } from '../../../../src/databox/proof/OfflineVerification';
import type {
  DataboxRecordCredential,
  RecordClaimBinding,
  StatusListResolver,
} from '../../../../src/databox/proof/RecordProofValidator';
import {
  DATABOX_RECORD_CREDENTIAL_TYPE,
  DBX_RECORD_CONTEXT,
  digestOfBytes,
  PINNED_CANONICALIZATION_ALG,
  RECORD_PROOF_JWS_TYP,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
} from '../../../../src/databox/proof/RecordProofValidator';

/** A generated ES256 (P-256) key pair plus its public JWK — test-only material (never a real key). */
export interface TestKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly publicJwk: PublicJwk;
}

/** Generate a fresh, clearly test-only ES256 key pair with `node:crypto` (DBX-16 constraint). */
export function generateEs256KeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, privateKey, publicJwk: publicJwkFromKeyObject(publicKey) };
}

export const ISSUER = 'https://records.example/id#issuer';
export const KID = 'https://records.example/id#key-1';
export const STATUS_CRED = 'https://records.example/status/records-1';
export const ACCEPTED_PAYLOAD = Buffer.from('the exact accepted record bytes', 'utf8');

/** The verbatim (synthetic) context documents carried in an offline bundle, keyed by URL. */
export const CONTEXT_CONTENT: Record<string, string> = {
  [VC_V2_CONTEXT]: '{"@context":{"vc2":"synthetic-test-content"}}',
  [DBX_RECORD_CONTEXT]: '{"@context":{"dbxRecord":"synthetic-test-content"}}',
};

/** A pinned-context set over the two allowlisted URLs, hashes computed from {@link CONTEXT_CONTENT}. */
export function pinnedContexts(): PinnedContextSet {
  return new PinnedContextSet(new Map([
    [ VC_V2_CONTEXT, sha256Hex(CONTEXT_CONTENT[VC_V2_CONTEXT]) ],
    [ DBX_RECORD_CONTEXT, sha256Hex(CONTEXT_CONTENT[DBX_RECORD_CONTEXT]) ],
  ]));
}

/** A resolver returning a live status list where nothing is revoked. */
export function openStatusResolver(list: BitstringStatusList = new BitstringStatusList()): StatusListResolver {
  return (cred): BitstringStatusList | undefined => cred === STATUS_CRED ? list : undefined;
}

/** A status manager registered with a small herd so it can publish (T-56 floor). */
export function statusManagerWithHerd(): { manager: StatusListManager; index: number } {
  const manager = new StatusListManager(STATUS_CRED);
  const index = manager.register('record-1');
  manager.register('record-2');
  return { manager, index };
}

/** Build a record claim binding over {@link ACCEPTED_PAYLOAD} with overridable valid-vs-true fields. */
export function recordBinding(overrides: Partial<RecordClaimBinding> = {}): RecordClaimBinding {
  return {
    payloadDigest: digestOfBytes(ACCEPTED_PAYLOAD),
    canonicalization: PINNED_CANONICALIZATION_ALG,
    recordClass: 'https://records.example/classes/warranty',
    relationship: 'urn:uuid:rel-1',
    policyDigest: 'urn:sha256:'.concat('a'.repeat(64)),
    author: 'https://records.example/parties/org',
    method: 'institutional-record',
    verificationStatus: 'verified',
    ...overrides,
  };
}

/** Build a full record credential object with a given status index and optional overrides. */
export function recordCredential(
  index: number,
  now: number,
  binding: Partial<RecordClaimBinding> = {},
  credentialOverrides: Partial<DataboxRecordCredential> = {},
): DataboxRecordCredential {
  return {
    '@context': [ VC_V2_CONTEXT, DBX_RECORD_CONTEXT ],
    id: 'urn:uuid:record-1',
    type: [ VERIFIABLE_CREDENTIAL_TYPE, DATABOX_RECORD_CREDENTIAL_TYPE ],
    issuer: ISSUER,
    validFrom: new Date(now).toISOString(),
    validUntil: new Date(now + 1_000_000).toISOString(),
    credentialSubject: { id: 'https://records.example/subjects/s1', record: recordBinding(binding) },
    credentialStatus: {
      id: `${STATUS_CRED}#${index}`,
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: index,
      statusListCredential: STATUS_CRED,
    },
    ...credentialOverrides,
  };
}

/** Sign a credential body as a record-proof compact JWS with the given key + kid. */
export function signRecord(
  body: Record<string, unknown>,
  privateKey: KeyObject,
  kid: string = KID,
): string {
  return signCompactJws({ alg: 'ES256', typ: RECORD_PROOF_JWS_TYP, cty: 'vc', kid }, body, privateKey);
}
