import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface ConsentInput {
  readonly id: string;
  readonly dataSubject: string;
  readonly controller: string;
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly legalBasis: string;
  readonly granted: boolean;
  readonly timestamp: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A consent ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A consent needs a ${field}.`);
  }
  return trimmed;
}

function requireDataCategories(dataCategories: readonly string[]): readonly string[] {
  const categories = dataCategories.map((category): string => category.trim());
  if (categories.length === 0 || categories.some((category): boolean => category.length === 0)) {
    throw new BadRequestHttpError('A consent needs at least one non-empty data category.');
  }
  return categories;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A consent ${field} must be a valid date.`);
  }
  return value;
}

/**
 * Build a DPV-shaped consent record as JSON-LD. Pure and deterministic: the
 * granted/withdrawn status and timestamp are both supplied by the caller.
 */
export function buildConsent(input: ConsentInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const dataSubject = requireUri(input.dataSubject, 'dataSubject');
  const controller = requireUri(input.controller, 'controller');
  const purpose = requireNonEmpty(input.purpose, 'purpose');
  const dataCategories = requireDataCategories(input.dataCategories);
  const legalBasis = requireNonEmpty(input.legalBasis, 'legalBasis');
  const timestamp = requireDate(input.timestamp, 'timestamp');

  return {
    [LD_CONTEXT]: 'https://w3id.org/dpv#',
    [LD_ID]: id,
    [LD_TYPE]: 'Consent',
    dataSubject: { [LD_ID]: dataSubject },
    dataController: { [LD_ID]: controller },
    hasPurpose: purpose,
    hasPersonalData: dataCategories,
    hasLegalBasis: legalBasis,
    hasConsentStatus: input.granted ? 'ConsentGiven' : 'ConsentWithdrawn',
    timestamp,
  };
}
