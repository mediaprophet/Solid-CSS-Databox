import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface TaxInput {
  readonly amount: number;
  readonly ratePercent: number;
  readonly inclusive: boolean;
}

export interface TaxResult {
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeTax(input: TaxInput): TaxResult {
  if (input.amount < 0) {
    throw new BadRequestHttpError('amount must not be negative.');
  }
  if (input.ratePercent < 0) {
    throw new BadRequestHttpError('ratePercent must not be negative.');
  }
  if (input.inclusive) {
    const gross = input.amount;
    const net = round2(input.amount / (1 + (input.ratePercent / 100)));
    const tax = round2(gross - net);
    return { net, tax, gross };
  }
  const net = input.amount;
  const tax = round2(input.amount * (input.ratePercent / 100));
  const gross = round2(net + tax);
  return { net, tax, gross };
}
