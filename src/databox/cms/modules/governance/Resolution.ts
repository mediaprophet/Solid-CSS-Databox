import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface ResolutionInput {
  readonly id: string;
  readonly title: string;
  readonly decision: string;
  readonly votesFor: number;
  readonly votesAgainst: number;
  readonly abstain: number;
  readonly quorum: number;
  readonly date: string;
}

export interface ResolutionResult {
  readonly record: Record<string, unknown>;
  readonly carried: boolean;
  readonly quorumMet: boolean;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A resolution ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A resolution ${field} must not be empty.`);
  }
  return trimmed;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new BadRequestHttpError(`A resolution ${field} must be a non-negative integer.`);
  }
  return value;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestHttpError(`A resolution ${field} must be a positive integer.`);
  }
  return value;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A resolution ${field} must be a valid date.`);
  }
  return value;
}

/**
 * Record an auditable board/committee resolution as schema.org JSON-LD. The vote tally
 * and the derived quorum/carried outcome are machine-checkable and deterministic.
 */
export function recordResolution(input: ResolutionInput): ResolutionResult {
  const id = requireUri(input.id, 'id');
  const title = requireNonEmpty(input.title, 'title');
  const decision = requireNonEmpty(input.decision, 'decision');
  const votesFor = requireNonNegativeInteger(input.votesFor, 'votesFor');
  const votesAgainst = requireNonNegativeInteger(input.votesAgainst, 'votesAgainst');
  const abstain = requireNonNegativeInteger(input.abstain, 'abstain');
  const quorum = requirePositiveInteger(input.quorum, 'quorum');
  const date = requireDate(input.date, 'date');

  const quorumMet = (votesFor + votesAgainst + abstain) >= quorum;
  const carried = quorumMet && votesFor > votesAgainst;

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Action',
    [LD_ID]: id,
    name: title,
    description: decision,
    startTime: date,
    actionStatus: 'CompletedActionStatus',
    result: {
      for: votesFor,
      against: votesAgainst,
      abstain,
      carried,
      quorumMet,
    },
  };

  return { record, carried, quorumMet };
}
