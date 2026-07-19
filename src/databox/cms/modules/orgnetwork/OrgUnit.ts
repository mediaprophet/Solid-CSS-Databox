import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface OrgUnitInput {
  readonly org: string;
  readonly name: string;
  readonly parent: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`${field} must be an absolute URI.`);
  }
}

export function buildOrgUnit(input: OrgUnitInput): Record<string, unknown> {
  const org = requireUri(input.org, 'org');
  const parent = requireUri(input.parent, 'parent');
  const name = input.name.trim();
  if (name.length === 0) {
    throw new BadRequestHttpError('name must not be empty.');
  }
  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Organization',
    [LD_ID]: org,
    name,
    parentOrganization: {
      [LD_ID]: parent,
    },
  };
}
