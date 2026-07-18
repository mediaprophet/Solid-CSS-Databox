import { BadRequestHttpError } from '../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_ID = '@id';
const LD_TYPE = '@type';

export interface LegalEntityInput {
  /** The organisation's URI / WebID. */
  readonly id: string;
  readonly legalName: string;
  /** ISO country code of the entity's jurisdiction, e.g. `AU`. */
  readonly jurisdiction?: string;
  /** Legal/registration identifier (e.g. ABN, company number). */
  readonly legalIdentifier?: string;
  readonly url?: string;
}

/**
 * Build the legal entity — the organisation as a legal person — as schema.org JSON-LD (see
 * `databox/solid-cms-plan.md`, §5.0 part 1). This is the *descriptive* facet of the org (its legal facts);
 * its *agency* (WebID, governance action) lives in the agent layer. Pure and deterministic.
 */
export function buildLegalEntity(input: LegalEntityInput): Record<string, unknown> {
  let id: string;
  try {
    id = new URL(input.id).href;
  } catch {
    throw new BadRequestHttpError('A legal entity id must be an absolute URI.');
  }
  if (input.legalName.trim().length === 0) {
    throw new BadRequestHttpError('A legal entity needs a legal name.');
  }

  const entity: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_ID]: id,
    [LD_TYPE]: 'Organization',
    legalName: input.legalName,
  };
  if (input.url !== undefined) {
    entity.url = input.url;
  }
  if (input.legalIdentifier !== undefined) {
    entity.identifier = input.legalIdentifier;
  }
  if (input.jurisdiction !== undefined) {
    entity.address = { [LD_TYPE]: 'PostalAddress', addressCountry: input.jurisdiction };
  }
  return entity;
}
