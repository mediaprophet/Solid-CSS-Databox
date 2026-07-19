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

/**
 * Build a DPV-shaped consent record as JSON-LD (see `databox/solid-cms-plan.md`, §consent —
 * the privacy spine shared by allied-health, charity, CDR, and GDPR flows). Pure and
 * deterministic: the granted/withdrawn status and timestamp are both supplied by the caller.
 */
export function buildConsent(input: ConsentInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const dataSubject = requireUri(input.dataSubject, 'dataSubject');
  const controller = requireUri(input.controller, 'controller');
  if (input.purpose.trim().length === 0) {
    throw new BadRequestHttpError('A consent needs a purpose.');
  }
  if (input.dataCategories.length === 0) {
    throw new BadRequestHttpError('A consent needs at least one data category.');
  }
  if (input.legalBasis.trim().length === 0) {
    throw new BadRequestHttpError('A consent needs a legalBasis.');
  }
  if (input.timestamp.trim().length === 0) {
    throw new BadRequestHttpError('A consent needs a timestamp.');
  }

  return {
    [LD_CONTEXT]: 'https://w3id.org/dpv#',
    [LD_ID]: id,
    [LD_TYPE]: 'Consent',
    dataSubject: { [LD_ID]: dataSubject },
    dataController: { [LD_ID]: controller },
    hasPurpose: input.purpose,
    hasPersonalData: input.dataCategories,
    hasLegalBasis: input.legalBasis,
    hasConsentStatus: input.granted ? 'ConsentGiven' : 'ConsentWithdrawn',
    timestamp: input.timestamp,
  };
}
