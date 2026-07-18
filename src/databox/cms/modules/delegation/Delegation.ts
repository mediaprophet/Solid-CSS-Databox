import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface DelegationInput {
  readonly id: string;
  readonly principal: string;
  readonly delegate: string;
  readonly scope: readonly string[];
  readonly expires: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A delegation ${field} must be an absolute URI.`);
  }
}

/**
 * Build a scoped, revocable delegation as schema.org JSON-LD (see `databox/solid-cms-plan.md`,
 * §5.5) — assisted agency: the principal retains ownership of the resource, and a delegate is
 * granted the ability to act on their behalf within a bounded `actionOption` scope until `expires`.
 * Pure and deterministic (the expiry is supplied by the caller — this function never reads the
 * clock).
 */
export function buildDelegation(input: DelegationInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const principal = requireUri(input.principal, 'principal');
  const delegate = requireUri(input.delegate, 'delegate');
  if (input.scope.length === 0) {
    throw new BadRequestHttpError('A delegation needs at least one scope entry.');
  }
  if (input.expires.trim().length === 0) {
    throw new BadRequestHttpError('A delegation needs an expires timestamp.');
  }

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_ID]: id,
    [LD_TYPE]: 'DelegateAction',
    agent: { [LD_ID]: principal },
    participant: { [LD_ID]: delegate },
    actionOption: input.scope,
    expires: input.expires,
  };
}

/**
 * Check whether a delegation grant currently authorizes `action`: the action must be within the
 * granted scope, and `asOfIso` must not be past the grant's expiry (string comparison, so callers
 * must pass comparable ISO-8601 timestamps). Pure — the caller supplies "now".
 */
export function isDelegationValid(grant: DelegationInput, action: string, asOfIso: string): boolean {
  return grant.scope.includes(action) && asOfIso <= grant.expires;
}
