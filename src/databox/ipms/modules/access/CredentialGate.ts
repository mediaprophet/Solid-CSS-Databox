/**
 * Credential-gated physical access.
 *
 * A turnstile (or any physical access point) checks a narrow claim about a
 * presented verifiable credential WITHOUT learning the identity of the
 * holder (plan §venue). Access is granted only when the credential is not
 * expired, was issued by an accepted issuer, and satisfies the required
 * claim.
 */

export interface AccessPolicy {
  readonly resource: string;
  readonly acceptedIssuers: readonly string[];
  readonly requiredClaim: string;
}

export interface PresentedCredential {
  readonly issuer: string;
  readonly claims: Record<string, unknown>;
  readonly expired: boolean;
}

export interface AccessDecision {
  readonly granted: boolean;
  readonly reason: string;
}

/**
 * Evaluate whether a presented credential satisfies an access policy.
 *
 * Access is granted iff all of the following hold:
 *  - the credential is not expired;
 *  - the credential's issuer is one of the policy's accepted issuers;
 *  - the credential's claim named by the policy's requiredClaim is `true`.
 *
 * This function is pure and never throws.
 */
export function evaluateAccess(policy: AccessPolicy, credential: PresentedCredential): AccessDecision {
  if (credential.expired) {
    return { granted: false, reason: 'expired' };
  }
  if (!policy.acceptedIssuers.includes(credential.issuer)) {
    return { granted: false, reason: 'issuer-not-accepted' };
  }
  if (credential.claims[policy.requiredClaim] !== true) {
    return { granted: false, reason: 'claim-not-satisfied' };
  }
  return { granted: true, reason: 'granted' };
}
