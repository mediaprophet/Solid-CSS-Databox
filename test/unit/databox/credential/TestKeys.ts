import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import type { PublicJwk } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { publicJwkFromKeyObject } from '../../../../src/databox/credential/Es256';

/** A generated ES256 (P-256) key pair plus its public JWK — test-only material (never a real key). */
export interface TestKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly publicJwk: PublicJwk;
}

/** Generate a fresh, clearly test-only ES256 key pair with `node:crypto` (DBX-13 constraint 4). */
export function generateEs256KeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, privateKey, publicJwk: publicJwkFromKeyObject(publicKey) };
}
