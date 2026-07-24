/** A unit of authority: a role may perform an action, optionally within a maximum amount. */
export interface AuthorityGrant {
  readonly role: string;
  readonly action: string;
  /** Optional spending/quantity limit for this grant. */
  readonly maxAmount?: number;
}

export interface AuthorityRequest {
  /** Roles the requesting agent holds (from the directory, §5.0). */
  readonly roles: readonly string[];
  readonly action: string;
  /** Amount at stake, if the action has one (e.g. a payment). */
  readonly amount?: number;
}

export interface AuthorityDecision {
  readonly permitted: boolean;
  readonly reason: string;
}

/**
 * Evaluate whether a request is authorised, given the entity's authority grants
 * (see `databox/solid-ipms-plan.md`, §5.7). This is the machine-checkable governance gate: authority is
 * **data** (role → action, with optional limits), so corporate, democratic/mutual and unincorporated
 * structures are just different grant sets — the evaluator itself is model-agnostic. Pure and deterministic.
 */
export function evaluateAuthority(
  grants: readonly AuthorityGrant[],
  request: AuthorityRequest,
): AuthorityDecision {
  const applicable = grants.filter(
    (grant): boolean => grant.action === request.action && request.roles.includes(grant.role),
  );
  if (applicable.length === 0) {
    return { permitted: false, reason: `No authority for action "${request.action}".` };
  }
  for (const grant of applicable) {
    if (grant.maxAmount === undefined || (request.amount ?? 0) <= grant.maxAmount) {
      return { permitted: true, reason: `Authorised by role "${grant.role}".` };
    }
  }
  return { permitted: false, reason: `Amount exceeds every limit for action "${request.action}".` };
}
