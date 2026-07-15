import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import type { PublicJwk } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { publicJwkFromKeyObject, signCompactJws } from '../../../../src/databox/credential/Es256';
import type { DataboxRequestContext } from '../../../../src/databox/context/DataboxRequestContext';
import type { PolicyEvaluation } from '../../../../src/databox/evidence/AuditEvidence';
import { DBX_ACTIONS, DBX_DUTIES, DBX_LEFT_OPERANDS, DBX_PROFILE_V1, DBX_SOURCE_RANKS, ODRL_NAMESPACE }
  from '../../../../src/databox/odrl/terms';
import { IssuerTrustStore } from '../../../../src/databox/proof/IssuerTrustStore';
import type { CompiledPolicyBundle, PolicyRule } from '../../../../src/databox/policy/PolicyBundle';
import { computeBundleDigest } from '../../../../src/databox/policy/PolicyBundle';

/** A generated, clearly test-only ES256 (P-256) key pair plus its public JWK. */
export interface TestKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly publicJwk: PublicJwk;
}

export function generateEs256KeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, privateKey, publicJwk: publicJwkFromKeyObject(publicKey) };
}

export const ISSUER = 'https://org.example/id#issuer';
export const KID = 'https://org.example/id#bundle-key-1';
export const ISSUED_AT = '2026-07-15T00:00:00.000Z';
export const DIGEST_A = `urn:sha256:${'a'.repeat(64)}`;
export const DIGEST_B = `urn:sha256:${'b'.repeat(64)}`;
export const DIGEST_C = `urn:sha256:${'c'.repeat(64)}`;

export const signerKey = generateEs256KeyPair();

/** A trusted-issuer store scoped to `program-1` with a single active key covering {@link ISSUED_AT}. */
export function trustStore(): IssuerTrustStore {
  return new IssuerTrustStore('program-1', [{
    issuer: ISSUER,
    verificationMethod: KID,
    publicKeyJwk: signerKey.publicJwk,
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
  }]);
}

/** The IRIs the synthetic fixtures use. */
export const READ_ACTION = `${ODRL_NAMESPACE}read`;
export const DISTRIBUTE_ACTION = `${ODRL_NAMESPACE}distribute`;
export const EQ_OP = `${ODRL_NAMESPACE}eq`;
export const ASSET_CLASS = 'retail-receipt';

/** A permission rule (read, mandatory baseline) activating the two hackathon duties. */
export function permissionRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    ruleType: 'permission',
    target: ASSET_CLASS,
    action: READ_ACTION,
    source: DBX_SOURCE_RANKS.mandatoryBaseline,
    duties: [ DBX_DUTIES.issueReceipt, DBX_DUTIES.signalHolder ],
    ...overrides,
  };
}

/** A prohibition rule (read, user preference by default). */
export function prohibitionRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    ruleType: 'prohibition',
    target: ASSET_CLASS,
    action: READ_ACTION,
    source: DBX_SOURCE_RANKS.userPreference,
    ...overrides,
  };
}

/**
 * Build a valid, admissible compiled bundle whose `compiledPolicyDigest` matches its content (so it is not
 * substituted). Any override is applied BEFORE the digest is computed, unless the override sets the digest
 * itself (used by substitution tests).
 */
export function buildBundle(overrides: Partial<CompiledPolicyBundle> = {}): CompiledPolicyBundle {
  const base: CompiledPolicyBundle = {
    syntheticFixture: true,
    policyId: 'https://databox.example/policies/retail-receipt',
    policyVersion: 'v1',
    profile: DBX_PROFILE_V1,
    issuer: ISSUER,
    issuedAt: ISSUED_AT,
    affectedAssetClasses: [ ASSET_CLASS ],
    updateEffect: 'Prospective',
    effectiveInterval: { effectiveFrom: '2026-07-15T00:00:00.000Z' },
    rules: [ permissionRule() ],
    compiledPolicyDigest: DIGEST_A,
    corpusManifestDigest: DIGEST_B,
    profileDigest: DIGEST_C,
    evaluatorVersion: 'dbx-eval/1',
    attestation: {
      attester: 'https://org.example/legal#reviewer',
      method: 'human-attested-synthetic',
      verificationState: 'verified',
      scope: 'synthetic-fixture-only',
      status: 'attested',
      attestationId: 'urn:uuid:att-1',
    },
    ...overrides,
  };
  // Re-seal the content digest unless a test pinned it explicitly (to exercise substitution detection).
  if (overrides.compiledPolicyDigest === undefined) {
    return { ...base, compiledPolicyDigest: computeBundleDigest(base) };
  }
  return base;
}

/** Sign a bundle as a compact ES256 JWS whose payload is the bundle (the compilation-stage signature). */
export function signBundle(
  bundle: CompiledPolicyBundle,
  privateKey: KeyObject = signerKey.privateKey,
  kid: string = KID,
): string {
  return signCompactJws({ alg: 'ES256', kid }, bundle as unknown as Record<string, unknown>, privateKey);
}

/** A fully-populated verified context bound into every duty transition. */
export const CONTEXT: DataboxRequestContext = {
  webId: 'https://id.example/alice#me',
  actor: 'https://id.example/alice#me',
  clientId: 'client-1',
  issuer: 'https://issuer.example',
  audience: 'https://databox.example/t1',
};

/** The governing-policy binding recorded on each transition. */
export const DUTY_POLICY: PolicyEvaluation = {
  odrlPolicy: 'https://databox.example/policies/retail-receipt',
  policyVersion: 'v1',
  policyDigest: DIGEST_A,
};

/** A monotonic ISO clock so committed times are distinct and deterministic. */
export function fixedClock(): () => string {
  let tick = 0;
  return (): string => {
    tick += 1;
    return `2026-07-15T10:00:0${tick}.000Z`;
  };
}

/** Re-export the duty/left-operand IRIs tests reference. */
export { DBX_DUTIES, DBX_ACTIONS, DBX_LEFT_OPERANDS, DBX_SOURCE_RANKS };
