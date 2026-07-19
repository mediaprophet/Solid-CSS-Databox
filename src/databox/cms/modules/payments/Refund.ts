import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface RefundInput {
  readonly originalTotal: number;
  readonly refundAmount: number;
}

export interface RefundResult {
  readonly refundAmount: number;
  readonly remaining: number;
  readonly full: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute a refund against an original payment total: how much is refunded, how much remains,
 * and whether the refund is a full refund of the original total (plan §10.5). Pure and deterministic.
 */
export function computeRefund(input: RefundInput): RefundResult {
  if (input.originalTotal <= 0) {
    throw new BadRequestHttpError('A refund needs a positive original total.');
  }
  if (input.refundAmount <= 0) {
    throw new BadRequestHttpError('A refund needs a positive refund amount.');
  }
  if (input.refundAmount > input.originalTotal) {
    throw new BadRequestHttpError('The refund amount cannot exceed the original total.');
  }

  return {
    refundAmount: round2(input.refundAmount),
    remaining: round2(input.originalTotal - input.refundAmount),
    full: input.refundAmount === input.originalTotal,
  };
}
