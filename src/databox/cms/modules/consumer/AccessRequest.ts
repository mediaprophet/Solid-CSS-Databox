import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface AccessRequestInput {
  readonly id: string;
  readonly dataSubject: string;
  readonly controller: string;
  readonly scope: readonly string[];
  readonly submittedAt: string;
  readonly dueDays: number;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`An access request ${field} must be an absolute URI.`);
  }
}

function requireScope(scope: readonly string[]): readonly string[] {
  if (scope.length === 0) {
    throw new BadRequestHttpError('An access request needs a non-empty scope.');
  }
  return scope;
}

function requireDueDays(dueDays: number): number {
  if (dueDays <= 0) {
    throw new BadRequestHttpError('An access request dueDays must be greater than zero.');
  }
  return dueDays;
}

function computeDueDate(submittedAt: string, dueDays: number): string {
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError('An access request submittedAt must be a valid date.');
  }
  date.setUTCDate(date.getUTCDate() + dueDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Build a data-subject access request as a schema.org `Action` (see `databox/solid-cms-plan.md`,
 * §consumer-rights, ADR-0023). Pure and deterministic — all identifiers and dates are supplied by
 * the caller.
 */
export function buildAccessRequest(input: AccessRequestInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const dataSubject = requireUri(input.dataSubject, 'dataSubject');
  const controller = requireUri(input.controller, 'controller');
  const scope = requireScope(input.scope);
  const dueDays = requireDueDays(input.dueDays);
  const dueDate = computeDueDate(input.submittedAt, dueDays);

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Action',
    [LD_ID]: id,
    agent: { [LD_ID]: dataSubject },
    object: { [LD_ID]: controller },
    name: 'AccessRequest',
    description: scope.join(', '),
    startTime: input.submittedAt,
    dueDate,
  };
}
