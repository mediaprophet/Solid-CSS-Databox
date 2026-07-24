import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface ProvenanceStep {
  readonly actor: string;
  readonly action: string;
  readonly date: string;
}

export interface ProvenanceInput {
  readonly product: string;
  readonly origin: string;
  readonly steps: readonly ProvenanceStep[];
  readonly certifications?: readonly string[];
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A provenance ${field} must be an absolute URI.`);
  }
}

/**
 * Build a verifiable product provenance chain as schema.org JSON-LD (see
 * `databox/solid-ipms-plan.md`, §10.8 / §MFG): a product's country of origin plus an ordered
 * chain of actions (`subjectOf`) taken on it by actors, optionally backed by credentials
 * (`hasCredential`). Pure and deterministic.
 */
export function buildProvenance(input: ProvenanceInput): Record<string, unknown> {
  const product = requireUri(input.product, 'product');
  if (input.origin.trim().length === 0) {
    throw new BadRequestHttpError('A provenance origin must not be empty.');
  }
  if (input.steps.length === 0) {
    throw new BadRequestHttpError('A provenance chain needs at least one step.');
  }

  const subjectOf = input.steps.map((step): Record<string, unknown> => ({
    [LD_TYPE]: 'Action',
    agent: { [LD_ID]: step.actor },
    name: step.action,
    startTime: step.date,
  }));

  const provenance: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Product',
    [LD_ID]: product,
    countryOfOrigin: input.origin,
    subjectOf,
  };

  if (input.certifications !== undefined && input.certifications.length > 0) {
    provenance.hasCredential = input.certifications.map((cert): Record<string, unknown> => ({
      [LD_ID]: cert,
    }));
  }

  return provenance;
}
