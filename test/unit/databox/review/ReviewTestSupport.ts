import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import type { PublicJwk } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { publicJwkFromKeyObject } from '../../../../src/databox/credential/Es256';
import type { AssuranceContext, AssuranceDimensionLevels, DataboxRequestContext }
  from '../../../../src/databox/context/DataboxRequestContext';
import type { PolicyEvaluation } from '../../../../src/databox/evidence/AuditEvidence';
import { digestOfBytes } from '../../../../src/databox/proof/Canonicalization';
import type { CommittedSubmissionEvent, Reviewer } from '../../../../src/databox/review/ReviewTypes';

/** A generated, clearly test-only ES256 (P-256) key pair plus its public JWK (DBX-23 constraint 5). */
export interface TestKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly publicJwk: PublicJwk;
}

export function generateEs256KeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, privateKey, publicJwk: publicJwkFromKeyObject(publicKey) };
}

export const signerKey = generateEs256KeyPair();
export const KID = 'https://org.example/review#reviewer-key-1';

export const PAYLOAD_DIGEST = digestOfBytes(Buffer.from('the exact submitted correction bytes', 'utf8'));

/** The governing-policy binding recorded on every review evidence transition. */
export const POLICY: PolicyEvaluation = {
  odrlPolicy: 'https://databox.example/policies/correction',
  policyVersion: 'v1',
  policyDigest: `urn:sha256:${'a'.repeat(64)}`,
};

/** All six ADR-0010 assurance dimensions at `level`. */
export function fullDimensions(level: number): AssuranceDimensionLevels {
  return {
    identityProofing: level,
    authenticatorStrength: level,
    federationTrust: level,
    authenticationFreshness: level,
    stepUpState: level,
    delegationEvidence: level,
  };
}

/** A verified context with the given per-dimension assurance levels (or none, for the fail-closed path). */
export function makeContext(dimensions?: AssuranceDimensionLevels): DataboxRequestContext {
  const assurance: AssuranceContext | undefined =
    dimensions === undefined ? undefined : { grade: 'reviewer-grade', dimensions };
  return {
    webId: 'https://id.example/reviewer#me',
    actor: 'https://id.example/reviewer#me',
    issuer: 'https://issuer.example',
    audience: 'https://databox.example/t1',
    ...assurance === undefined ? {} : { assurance },
  };
}

/** A reviewer whose verified assurance sits at `level` on every dimension (or none). */
export function makeReviewer(reviewerId = 'reviewer-1', level?: number): Reviewer {
  return { reviewerId, context: makeContext(level === undefined ? undefined : fullDimensions(level)) };
}

/** A committed submission event, with overridable fields. Preserves submitter identity + payload digest. */
export function makeEvent(overrides: Partial<CommittedSubmissionEvent> = {}): CommittedSubmissionEvent {
  return {
    tenantId: 't1',
    eventId: 'evt-1',
    submissionRef: 'submission-abc',
    submissionKind: 'correction',
    submissionClass: 'record-correction',
    relationshipId: 'rel-1',
    payloadDigest: PAYLOAD_DIGEST,
    committedAt: '2026-07-15T00:00:00.000Z',
    submitter: { submitterRef: 'pairwise:submitter-1', actorRef: 'pairwise:actor-1', issuer: 'https://issuer.example' },
    policy: POLICY,
    ...overrides,
  };
}

/** A monotonic ISO clock so recorded times are distinct and deterministic. */
export function fixedClock(startMs = Date.parse('2026-07-15T10:00:00.000Z')): () => string {
  let tick = 0;
  return (): string => {
    tick += 1;
    return new Date(startMs + tick * 1000).toISOString();
  };
}
