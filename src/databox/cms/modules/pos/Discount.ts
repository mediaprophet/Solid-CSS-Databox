import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export type DiscountType = 'percent' | 'fixed';

export interface DiscountInput {
  readonly subtotal: number;
  readonly type: DiscountType;
  readonly value: number;
}

export interface DiscountResult {
  readonly discount: number;
  readonly total: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function applyDiscount(input: DiscountInput): DiscountResult {
  const { subtotal, type, value } = input;

  if (subtotal <= 0) {
    throw new BadRequestHttpError('subtotal must be greater than 0.');
  }

  let discount: number;

  if (type === 'percent') {
    if (value < 0 || value > 100) {
      throw new BadRequestHttpError('value must be between 0 and 100 for a percent discount.');
    }
    discount = round2(subtotal * value / 100);
  } else {
    if (value < 0 || value > subtotal) {
      throw new BadRequestHttpError('value must be between 0 and subtotal for a fixed discount.');
    }
    discount = round2(value);
  }

  const total = round2(subtotal - discount);

  return { discount, total };
}
