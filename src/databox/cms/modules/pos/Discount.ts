import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

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

export interface DiscountRecordInput extends DiscountInput {
  readonly id: string;
  readonly order: string;
  readonly currency: string;
  readonly appliedAt: string;
  readonly code?: string;
}

export interface DiscountRecordResult extends DiscountResult {
  readonly record: Record<string, unknown>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A POS discount ${field} must be an absolute URI.`);
  }
}

function requireFinitePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`A POS discount ${field} must be greater than 0.`);
  }
  return value;
}

function requireFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`A POS discount ${field} must not be negative.`);
  }
  return value;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A POS discount currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A POS discount ${field} must be a valid date.`);
  }
  return value;
}

function optionalCode(code: string | undefined): string | undefined {
  if (code === undefined) {
    return undefined;
  }
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError('A POS discount code must not be empty when supplied.');
  }
  return trimmed;
}

export function applyDiscount(input: DiscountInput): DiscountResult {
  const subtotal = requireFinitePositive(input.subtotal, 'subtotal');
  const value = requireFiniteNonNegative(input.value, 'value');

  let discount: number;

  if (input.type === 'percent') {
    if (value > 100) {
      throw new BadRequestHttpError('value must be between 0 and 100 for a percent discount.');
    }
    discount = round2(subtotal * value / 100);
  } else if (input.type === 'fixed') {
    if (value > subtotal) {
      throw new BadRequestHttpError('value must be between 0 and subtotal for a fixed discount.');
    }
    discount = round2(value);
  } else {
    throw new BadRequestHttpError('type must be either percent or fixed.');
  }

  const total = round2(subtotal - discount);

  return { discount, total };
}

/**
 * Build an auditable schema.org `Order` record for a POS discount. The calculation is shared
 * with `applyDiscount`, while every identifier and timestamp is supplied by the caller.
 */
export function buildDiscountRecord(input: DiscountRecordInput): DiscountRecordResult {
  const id = requireUri(input.id, 'id');
  const order = requireUri(input.order, 'order');
  const currency = requireCurrency(input.currency);
  const appliedAt = requireDate(input.appliedAt, 'appliedAt');
  const code = optionalCode(input.code);
  const discountCode = code === undefined ? {} : { discountCode: code };
  const { discount, total } = applyDiscount(input);

  return {
    discount,
    total,
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Order',
      [LD_ID]: id,
      orderNumber: order,
      discount,
      discountCurrency: currency,
      ...discountCode,
      priceCurrency: currency,
      orderDate: appliedAt,
      paymentDueDate: appliedAt,
      priceSpecification: {
        [LD_TYPE]: 'PriceSpecification',
        price: round2(input.subtotal),
        priceCurrency: currency,
      },
      totalPaymentDue: {
        [LD_TYPE]: 'PriceSpecification',
        price: total,
        priceCurrency: currency,
      },
      additionalProperty: [
        {
          [LD_TYPE]: 'PropertyValue',
          name: 'discountType',
          value: input.type,
        },
        {
          [LD_TYPE]: 'PropertyValue',
          name: 'discountValue',
          value: input.value,
        },
      ],
    },
  };
}
