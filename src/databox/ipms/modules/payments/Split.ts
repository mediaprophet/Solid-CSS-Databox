import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface Payee {
  readonly id: string;
  readonly share: number;
}

export interface SplitInput {
  readonly total: number;
  readonly feePercent: number;
  readonly payees: readonly Payee[];
}

export interface Payout {
  readonly id: string;
  readonly amount: number;
}

export interface SplitResult {
  readonly platformFee: number;
  readonly payouts: Payout[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Split a completed payment between the platform (its fee) and the marketplace payees, in proportion
 * to each payee's share (plan §10.5 / §10.6). Pure and deterministic.
 */
export function splitPayment(input: SplitInput): SplitResult {
  if (input.total < 0) {
    throw new BadRequestHttpError('A split needs a non-negative total.');
  }
  if (input.feePercent < 0 || input.feePercent > 100) {
    throw new BadRequestHttpError('A split needs a fee percent between 0 and 100.');
  }
  if (input.payees.length === 0) {
    throw new BadRequestHttpError('A split needs at least one payee.');
  }
  let sumOfShares = 0;
  for (const payee of input.payees) {
    if (payee.share <= 0) {
      throw new BadRequestHttpError('Each payee needs a positive share.');
    }
    sumOfShares += payee.share;
  }

  const platformFee = round2(input.total * input.feePercent / 100);
  const remaining = input.total - platformFee;
  const payouts: Payout[] = [];
  for (const payee of input.payees) {
    payouts.push({ id: payee.id, amount: round2(remaining * payee.share / sumOfShares) });
  }

  return { platformFee, payouts };
}
