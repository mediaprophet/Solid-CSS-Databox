import type { AccessMode } from '../../authorization/permissions/Permissions';
import type { AssuranceDimension } from '../profile/InstitutionProfile';

/**
 * Structured, audit-safe denial reason codes for the composed Databox authorizer (component C4,
 * DBX-04 §2; DBX-14). Each code names *which conjunct* of the authorization conjunction
 * (`tenant ∧ token-audience ∧ relationship ∧ credential ∧ assurance ∧ delegation ∧ ODRL ∧ immutability`)
 * forced the request to deny.
 *
 * A reason code is written to the C13 evidence deny event (ADR-0013 §Privacy: "the audit reason codes
 * must themselves avoid leaking protected facts"). It therefore NEVER carries resource content,
 * resource existence, a customer identifier, or any protected fact — only the abstract conjunct that
 * failed. The safe HTTP surface (see {@link ./SafeStepUpResponse}) is derived separately and also
 * hides existence (404-not-403).
 */
export const DATABOX_DENIAL_CODES = {
  /** A required authorization input (tenant, context, relationship, ODRL, …) was absent — fail closed. */
  missingInput: 'databox:missing-input',
  /** The target resource is not owned by the resolved tenant (binds the WAC map to the tenant box). */
  tenantMismatch: 'databox:tenant-mismatch',
  /** The presented token's audience is not bound to the resolved tenant (DBX-11 hard conjunct). */
  tokenAudienceMismatch: 'databox:token-audience-mismatch',
  /** The connection relationship is not active (DBX-13 per-request status). */
  relationshipInactive: 'databox:relationship-inactive',
  /** The connection credential is revoked/suspended (DBX-13 per-request status). */
  credentialRevoked: 'databox:credential-revoked',
  /** Authentication assurance is below the record/submission-class minimum (ADR-0010) — step-up. */
  assuranceInsufficient: 'databox:assurance-insufficient',
  /** A delegation/guardianship claim is present but its grant is not valid for this op (T-47). */
  delegationInvalid: 'databox:delegation-invalid',
  /** The target is an accepted resource and the op would replace/delete it (ADR-0018). */
  immutableOperation: 'databox:immutable-operation',
  /** An ODRL prohibition applies to the intended action (ADR-0013 stage 1). */
  odrlProhibited: 'databox:odrl-prohibited',
  /** An ODRL term is unsupported/ambiguous, so the policy composition fails closed (ADR-0013 stage 5). */
  odrlUnsupported: 'databox:odrl-unsupported',
} as const;

/** A machine-usable Databox denial reason code (audit-safe). */
export type DataboxDenialCode = typeof DATABOX_DENIAL_CODES[keyof typeof DATABOX_DENIAL_CODES];

/**
 * The named conjuncts of the composed authorization decision, listed in their deterministic
 * precedence order (DBX-14 §precedence). The first conjunct that denies wins.
 */
export const DATABOX_CONJUNCTS = [
  'tenant',
  'token-audience',
  'relationship',
  'credential',
  'assurance',
  'delegation',
  'odrl',
  'immutability',
] as const;

/** One conjunct of the composed authorization decision. */
export type DataboxConjunct = typeof DATABOX_CONJUNCTS[number];

/**
 * A SAFE step-up challenge (IF-20, ADR-0009). It names ONLY the assurance dimension that fell short and
 * the level required — facts about the *actor's* authentication, never about the resource. It therefore
 * cannot leak resource existence and is only surfaced to an actor who may already observe the resource
 * (see {@link ./SafeStepUpResponse}).
 */
export interface StepUpChallenge {
  /** The assurance dimension (ADR-0010) that is below the class minimum. */
  readonly dimension: AssuranceDimension;
  /** The minimum level the record/submission class requires on that dimension. */
  readonly requiredLevel: number;
  /** The level the verified context currently supplies on that dimension (`0` = absent, fail closed). */
  readonly currentLevel: number;
}

/**
 * The structured, deterministic outcome of the composed Databox authorization conjunction for one
 * (resource, request). It is audit-safe: it records the failing conjunct and code, never protected
 * content. `deniedModes` is the set of access modes the Databox layer forces to `false` — the ONLY way
 * this layer influences the permission map (narrow-never-broaden, invariant 12).
 */
export interface DataboxAuthorizationDecision {
  /** True iff every conjunct allowed (the Databox layer subtracts nothing). */
  readonly allowed: boolean;
  /** The first conjunct that denied, when `allowed` is false. */
  readonly conjunct?: DataboxConjunct;
  /** The audit reason code, when `allowed` is false. */
  readonly code?: DataboxDenialCode;
  /** A short, non-leaking human-readable reason (safe for the audit ledger). */
  readonly reason: string;
  /** The access modes the Databox layer forces to `false`; empty when `allowed`. */
  readonly deniedModes: readonly AccessMode[];
  /** A safe step-up challenge, present only for an assurance-gap denial. */
  readonly stepUp?: StepUpChallenge;
}
