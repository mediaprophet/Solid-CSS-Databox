import type { DataboxRequestContext } from '../../../../src/databox/context/DataboxRequestContext';
import type { AuditRecordInput, PolicyEvaluation } from '../../../../src/databox/evidence/AuditEvidence';

/** A valid `urn:sha256` digest fixture (64 hex chars). */
export const DIGEST_A = `urn:sha256:${'a'.repeat(64)}`;
export const DIGEST_B = `urn:sha256:${'b'.repeat(64)}`;
export const RECEIPT_DIGEST = `urn:sha256:${'c'.repeat(64)}`;

/** A fully-populated verified context: exercises the left/defined side of every binder branch. */
export const FULL_CONTEXT: DataboxRequestContext = {
  webId: 'https://id.example/alice#me',
  actor: 'https://id.example/guardian#me',
  representedEntity: 'https://id.example/alice#me',
  delegation: { onBehalfOf: 'https://id.example/ward#me', grantRef: 'opaque:grant-1' },
  clientId: 'client-1',
  issuer: 'https://issuer.example',
  audience: 'https://databox.example/t1',
  authTime: '2026-07-15T09:00:00.000Z',
  assurance: {
    grade: 'strong',
    dimensions: {
      identityProofing: 2,
      authenticatorStrength: 2,
      federationTrust: 1,
      authenticationFreshness: 1,
      stepUpState: 1,
      delegationEvidence: 1,
    },
    crosswalkVersion: 'crosswalk-v1',
    authTime: '2026-07-15T08:59:00.000Z',
  },
};

/** An empty verified context: exercises the right/undefined side of every binder branch (fail-closed). */
export const MINIMAL_CONTEXT: DataboxRequestContext = {};

/**
 * A context with no `actor`, no `representedEntity` and no top-level `authTime`, but WITH a delegation and
 * an assurance `authTime` — exercises the "fall through to delegation/assurance" branches of the binder.
 */
export const DELEGATED_CONTEXT: DataboxRequestContext = {
  webId: 'https://id.example/bob#me',
  delegation: { onBehalfOf: 'https://id.example/ward#me', grantRef: 'opaque:grant-2' },
  assurance: {
    grade: 'basic',
    dimensions: {
      identityProofing: 1,
      authenticatorStrength: 1,
      federationTrust: 0,
      authenticationFreshness: 0,
      stepUpState: 0,
      delegationEvidence: 0,
    },
    authTime: '2026-07-15T07:00:00.000Z',
  },
};

/** A valid policy-evaluation fixture. */
export const POLICY: PolicyEvaluation = {
  odrlPolicy: 'https://policy.example/p1',
  policyVersion: 'p1@2026-07-01',
  policyDigest: DIGEST_B,
  odrlRule: 'https://policy.example/p1#read',
  odrlState: 'activated',
  evaluatorVersion: 'eval-1',
};

/** A valid allow-record input. */
export function allowInput(overrides: Partial<AuditRecordInput> = {}): AuditRecordInput {
  return {
    kind: 'deposit-accepted',
    decision: 'allow',
    reasonCode: 'ok',
    operation: 'deposit',
    targetDigest: DIGEST_A,
    policy: POLICY,
    ...overrides,
  };
}

/** A monotonic ISO clock so committed times are distinct and deterministic. */
export function fixedClock(): () => string {
  let tick = 0;
  return (): string => {
    tick += 1;
    return `2026-07-15T10:00:0${tick}.000Z`;
  };
}
