import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface CorrectionInput {
  readonly id: string;
  readonly dataSubject: string;
  readonly controller: string;
  readonly targetRecord: string;
  readonly field: string;
  readonly currentValue: string;
  readonly requestedValue: string;
  readonly submittedAt: string;
  readonly dueDays: number;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A correction request ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A correction request ${field} must be non-empty.`);
  }
  return trimmed;
}

function requireDueDays(dueDays: number): number {
  if (!Number.isFinite(dueDays) || !Number.isInteger(dueDays) || dueDays <= 0) {
    throw new BadRequestHttpError('A correction request dueDays must be a positive integer.');
  }
  return dueDays;
}

function computeDueDate(submittedAt: string, dueDays: number): string {
  const date = new Date(submittedAt);
  if (submittedAt.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError('A correction request submittedAt must be a valid date.');
  }
  date.setUTCDate(date.getUTCDate() + dueDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Build a data-subject correction/rectification request as a schema.org `Action`.
 * Pure and deterministic: all identifiers and dates are supplied by the caller.
 */
export function buildCorrectionRequest(input: CorrectionInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const dataSubject = requireUri(input.dataSubject, 'dataSubject');
  const controller = requireUri(input.controller, 'controller');
  const targetRecord = requireUri(input.targetRecord, 'targetRecord');
  const field = requireNonEmpty(input.field, 'field');
  const requestedValue = requireNonEmpty(input.requestedValue, 'requestedValue');
  const dueDays = requireDueDays(input.dueDays);
  const dueDate = computeDueDate(input.submittedAt, dueDays);

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Action',
    [LD_ID]: id,
    agent: { [LD_ID]: dataSubject },
    object: { [LD_ID]: controller },
    about: { [LD_ID]: targetRecord },
    name: 'CorrectionRequest',
    actionStatus: 'PotentialActionStatus',
    description: `field ${field}: '${input.currentValue}' -> '${requestedValue}'`,
    startTime: input.submittedAt,
    dueDate,
    result: {
      targetRecord,
      field,
      currentValue: input.currentValue,
      requestedValue,
      responseDueDate: dueDate,
    },
  };
}
