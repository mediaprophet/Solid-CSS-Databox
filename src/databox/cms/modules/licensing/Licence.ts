import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface LicenceInput {
  readonly id: string;
  readonly asset: string;
  readonly assignee: string;
  readonly permittedActions: readonly string[];
  readonly prohibitedActions?: readonly string[];
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A licence ${field} must be an absolute URI.`);
  }
}

/**
 * Build an ODRL usage licence (an `Agreement`) granting an assignee permitted actions over an
 * asset — used for plan usage-licensing of print files / 3D models / other content (see
 * `databox/solid-cms-plan.md`). Pure and deterministic.
 */
export function buildLicence(input: LicenceInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const asset = requireUri(input.asset, 'asset');
  const assignee = requireUri(input.assignee, 'assignee');
  if (input.permittedActions.length === 0) {
    throw new BadRequestHttpError('A licence needs at least one permitted action.');
  }

  const permission = input.permittedActions.map((action): Record<string, unknown> => ({
    target: asset,
    assignee,
    action,
  }));

  const licence: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://www.w3.org/ns/odrl.jsonld',
    [LD_TYPE]: 'Agreement',
    [LD_ID]: id,
    permission,
  };

  if (input.prohibitedActions !== undefined && input.prohibitedActions.length > 0) {
    licence.prohibition = input.prohibitedActions.map((action): Record<string, unknown> => ({
      target: asset,
      assignee,
      action,
    }));
  }

  return licence;
}

/**
 * Whether `action` is permitted under `licence`: it must be in `permittedActions` and must not be
 * in `prohibitedActions`. Pure.
 */
export function isActionPermitted(licence: LicenceInput, action: string): boolean {
  return licence.permittedActions.includes(action) &&
    !(licence.prohibitedActions ?? []).includes(action);
}
