import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface HouseholdInput {
  readonly id: string;
  readonly name: string;
  readonly members: readonly string[];
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`Household ${field} must be an absolute URI.`);
  }
}

/**
 * Build a household / domestic collective (see `databox/solid-cms-plan.md`, §household — the entity
 * at personal scale). Members are referenced by WebID, never decomposed. Pure and deterministic.
 */
export function buildHousehold(input: HouseholdInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  if (input.name.trim().length === 0) {
    throw new BadRequestHttpError('Household name must not be empty.');
  }
  if (input.members.length === 0) {
    throw new BadRequestHttpError('Household members must not be empty.');
  }
  const members: Record<string, unknown>[] = [];
  for (const member of input.members) {
    members.push({ [LD_ID]: requireUri(member, 'member') });
  }
  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Organization',
    [LD_ID]: id,
    name: input.name,
    member: members,
  };
}
