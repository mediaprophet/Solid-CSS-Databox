import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface ProfileInput {
  readonly owner: string;
  readonly measurements?: Record<string, string>;
  readonly allergies?: readonly string[];
  readonly preferences?: Record<string, string>;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A profile ${field} must be an absolute URI.`);
  }
}

/**
 * Build a person-owned portable profile (see `databox/solid-cms-plan.md`, §person-owned profiles).
 * The person owns this document; it is shared minimally. Pure and deterministic.
 */
export function buildProfile(input: ProfileInput): Record<string, unknown> {
  const owner = requireUri(input.owner, 'owner');

  const profile: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Person',
    [LD_ID]: owner,
  };
  if (input.measurements !== undefined) {
    profile.measurements = input.measurements;
  }
  if (input.allergies !== undefined && input.allergies.length > 0) {
    profile.allergies = input.allergies;
  }
  if (input.preferences !== undefined) {
    profile.preferences = input.preferences;
  }
  return profile;
}
