import type { AccessMode } from '../../authorization/permissions/Permissions';
import type { DataboxRequestContext } from '../context/DataboxRequestContext';
import type { AssuranceRequirement, ExistenceVisibility } from '../profile/InstitutionProfile';
import type { TenantContext } from '../tenant/TenantContext';

/**
 * Per-request relationship + credential status snapshot (component C4 consumes DBX-13's per-request
 * re-check, ADR-0009 prompt revocation). The Databox authorizer never re-implements the credential
 * crypto (DBX-13 owns {@link ../credential/ConnectionCredentialValidator} and the status list); it
 * consumes the *result* — is the relationship active and the credential un-revoked, right now.
 *
 * Absence of this snapshot is a MISSING policy input and fails closed (never "assume active").
 */
export interface RelationshipStatusSnapshot {
  /** Whether the connection relationship is currently active (not suspended/superseded). */
  readonly active: boolean;
  /** Whether the connection credential is currently revoked (per-request status re-check, DBX-13). */
  readonly credentialRevoked: boolean;
}

/**
 * The per-op delegation/guardianship grant validity decision (matrix "Delegation/guardianship grant",
 * T-47). C3 carries the delegation *claim* only (DBX-12 §5 provisional RFC 8693 seam); whether the
 * grant is in scope and unrevoked is decided per-op by C9/C4. This carries that decision's result.
 */
export interface DelegationDecision {
  /** Whether the presented delegation grant is valid (in-scope, unrevoked) for THIS operation. */
  readonly valid: boolean;
}

/**
 * Append-only classification of the operation (ADR-0018). `mutatesAcceptedResource` is true iff the
 * operation would replace or delete an already-accepted resource — the case the append-only invariant
 * forbids for EVERY actor including the owner/admin. Read/append/create operations set it false.
 *
 * This is defence-in-depth at the authorization layer; the binding enforcement is the C6 store
 * decorator below WAC/owner (ADR-0018 §Alternatives). Both deny; neither alone may be relied on.
 */
export interface ImmutableOperationClassification {
  /** True iff this op would replace/delete an existing accepted resource (append-only forbids it). */
  readonly mutatesAcceptedResource: boolean;
}

/**
 * The ODRL precondition outcome for the intended action (ADR-0013), produced by the deterministic
 * evaluator (component C12, IF-04; DBX-20). The composed authorizer treats this as an already-decided
 * conjunct: an ODRL `permission` can never ADD reachability (two-plane separation), only a `prohibited`
 * or a `fail-closed` (unsupported/ambiguous term, ADR-0013 stage 5) can SUBTRACT.
 */
export interface OdrlPreconditionDecision {
  /** `permitted` allows; `prohibited` denies (stage 1); `fail-closed` denies (unsupported/ambiguous). */
  readonly outcome: 'permitted' | 'prohibited' | 'fail-closed';
}

/**
 * The fully-resolved input to the composed authorization engine for one (resource, request). Every
 * conjunct's evidence is supplied here; the engine ({@link ./ComposedAuthorizationEngine}) is a pure,
 * deterministic function of this value. A missing conjunct is fail-closed, never defaulted to allow.
 *
 * The immutable {@link tenant} (DBX-11) and {@link context} (DBX-12) are consumed as already-decided,
 * deep-frozen upstream facts; the engine re-asserts the tenant/token-audience binding independently
 * because the resolver's origin check is attacker-controllable (DBX-11 §7).
 */
export interface DataboxAuthorizationInput {
  /** The resolved, immutable program tenant (component C5, DBX-11). Absent → fail closed. */
  readonly tenant?: TenantContext;
  /** The verified authenticated request context (component C3, DBX-12). Absent → fail closed. */
  readonly context?: DataboxRequestContext;
  /** The per-request relationship + credential status (DBX-13). Absent → fail closed. */
  readonly relationship?: RelationshipStatusSnapshot;
  /** The record/submission-class minimum assurance per dimension (ADR-0010, from the profile). */
  readonly requiredAssurance: readonly AssuranceRequirement[];
  /** The per-op delegation validity, required only when {@link context} carries a delegation claim. */
  readonly delegation?: DelegationDecision;
  /** The append-only classification of the operation (ADR-0018). Absent → fail closed. */
  readonly immutable?: ImmutableOperationClassification;
  /** The ODRL precondition outcome (ADR-0013). Absent → fail closed. */
  readonly odrl?: OdrlPreconditionDecision;
  /**
   * The record/submission-class existence visibility (ADR-0023). Consumed by the safe-response surface
   * ({@link ./SafeStepUpResponse}), not by the decision engine: a `suppressed` class always denies behind a
   * `404` — even a step-up that would otherwise apply is suppressed so it cannot confirm existence (T-07).
   */
  readonly existenceVisibility: ExistenceVisibility;
  /** The requested access modes for this resource (from the CSS {@link ../../authorization/PermissionReader}). */
  readonly requestedModes: ReadonlySet<AccessMode>;
  /** The full target resource path, used to bind the WAC map to the tenant's box root (DBX-11 §7). */
  readonly resourcePath: string;
}
