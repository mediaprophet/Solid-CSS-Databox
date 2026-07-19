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
  if (value.trim().length === 0) {
    throw new BadRequestHttpError(`A resolution ${field} must not be empty.`);
  }
  return value;
}

function requireNonNegative(value: number, field: string): number {
  if (value < 0) {
    throw new BadRequestHttpError(`A resolution ${field} must not be negative.`);
  }
  return value;
}

/**
 * Record an auditable board/committee resolution as schema.org JSON-LD (see
 * `databox/solid-cms-plan.md`, §5.7) — a vote tally captured as an `Action` whose `result` carries
 * the count and the derived quorum/carried outcome, so governance decisions are machine-checkable
 * and provenance-linked like every other module record. Pure and deterministic.
 */
export function recordResolution(input: ResolutionInput): ResolutionResult {
  const id = requireUri(input.id, 'id');
  const title = requireNonEmpty(input.title, 'title');
  const decision = requireNonEmpty(input.decision, 'decision');
  const votesFor = requireNonNegative(input.votesFor, 'votesFor');
  const votesAgainst = requireNonNegative(input.votesAgainst, 'votesAgainst');
  const abstain = requireNonNegative(input.abstain, 'abstain');
  const quorum = requireNonNegative(input.quorum, 'quorum');
  const date = requireNonEmpty(input.date, 'date');

  const quorumMet = (votesFor + votesAgainst + abstain) >= quorum;
  const carried = quorumMet && votesFor > votesAgainst;

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Action',
    [LD_ID]: id,
    name: title,
    description: decision,
    startTime: date,
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
