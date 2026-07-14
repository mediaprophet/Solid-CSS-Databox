/**
 * Databox authenticated request context (component C3, DBX-04 §2).
 *
 * This is the immutable, request-scoped verified context that the Databox builds from a verified
 * token. It is deliberately richer than the CSS {@link Credentials} type, which captures only
 * `agent`/`client`/`issuer` and carries no assurance, audience or delegation information
 * (DBX-01 §2 — "the single biggest gap"). None of these fields exist in CSS 7.1.9 today.
 *
 * IMPORTANT: A `DataboxRequestContext` is evidence about *who is asking*, never a grant.
 * Possessing a context MUST NOT be treated as authorization; the composed authorizer (C4) still
 * decides. The context owner (C3) is authoritative for the assurance state and fails closed
 * (DBX-04 §6).
 */

/**
 * The assurance dimension of the verified context (ADR-0010 crosswalk).
 * CSS captures none of this today (no `acr`/`amr`/`loa`, DBX-01 §2).
 */
export interface AssuranceContext {
  /**
   * Opaque assurance grade token, interpreted against the program's ADR-0010 crosswalk.
   * Never compared numerically across programs without an explicit crosswalk.
   */
  readonly grade: string;
  /**
   * Authentication-instant as an ISO-8601 timestamp, used for step-up freshness checks.
   */
  readonly authTime?: string;
  /**
   * Raw authentication-method / context-class references as asserted by the issuer, retained
   * for audit. Opaque strings; never re-interpreted as a grade.
   */
  readonly methodRefs?: readonly string[];
}

/**
 * A delegation / on-behalf-of assertion (represented-entity), e.g. guardianship.
 * CSS has no delegation concept (DBX-01 §2).
 */
export interface DelegationContext {
  /**
   * The subject the actor is acting on behalf of.
   */
  readonly onBehalfOf: string;
  /**
   * Opaque reference to the delegation/guardianship grant that authorises this (owned by C9).
   */
  readonly grantRef: string;
}

/**
 * The immutable verified Databox request context (C3).
 * Every field is `readonly`; a context is never mutated after construction.
 */
export interface DataboxRequestContext {
  /**
   * The verified WebID of the acting agent, when present.
   */
  readonly webId?: string;
  /**
   * The verified OAuth/OIDC client identifier, when present.
   */
  readonly clientId?: string;
  /**
   * The verified issuer that asserted the claims.
   */
  readonly issuer?: string;
  /**
   * The audience the presented token was bound to (used to bind the request to a tenant).
   */
  readonly audience?: string;
  /**
   * The verified assurance context (ADR-0010). Absent means "unknown", which fails closed for
   * any grade-gated action.
   */
  readonly assurance?: AssuranceContext;
  /**
   * The delegation/represented-entity context, when the actor is acting on behalf of another.
   */
  readonly delegation?: DelegationContext;
}
