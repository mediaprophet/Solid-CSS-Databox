import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export type DiscountType = 'percentage' | 'fixed' | 'bundle' | 'quantity';

export interface DiscountCode {
  readonly id: string;
  readonly code: string;
  readonly type: DiscountType;
  readonly value: number;
  readonly minSpend?: number;
  readonly maxDiscount?: number;
  readonly usageLimit?: number;
  readonly usageCount: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly stackable: boolean;
  readonly applicableCategories?: readonly string[];
}

export interface DiscountApplicationInput {
  readonly code: string;
  readonly lineItems: readonly DiscountLineItem[];
  readonly subtotal: number;
  readonly appliedDiscounts?: readonly string[];
}

export interface DiscountLineItem {
  readonly productId: string;
  readonly name: string;
  readonly category: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface DiscountLineResult {
  readonly productId: string;
  readonly name: string;
  readonly originalLineTotal: number;
  readonly discountAmount: number;
  readonly finalLineTotal: number;
}

export interface DiscountApplicationResult {
  readonly code: string;
  readonly type: DiscountType;
  readonly valid: boolean;
  readonly reason?: string;
  readonly discountAmount: number;
  readonly lines: readonly DiscountLineResult[];
  readonly totalOriginal: number;
  readonly totalDiscount: number;
  readonly totalFinal: number;
}

export interface DiscountRecordInput {
  readonly id: string;
  readonly organisation: string;
  readonly code: string;
  readonly customer?: string;
  readonly currency: string;
  readonly appliedAt: string;
  readonly result: DiscountApplicationResult;
}

export interface DiscountRecordResult {
  readonly record: Record<string, unknown>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireNonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`${field} must be a non-negative finite number.`);
  }
  return value;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new BadRequestHttpError(`${field} must be a positive integer.`);
  }
  return value;
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestHttpError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A discount record ${field} must be an absolute URI.`);
  }
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A discount record ${field} must be a valid date.`);
  }
  return value;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A discount record currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

/**
 * Apply a discount code to a set of line items.
 *
 * Supports percentage, fixed, bundle (buy N get M% off), and quantity (bulk) discounts.
 * Validates min spend, usage limits, expiry, and category restrictions.
 */
export function applyDiscount(
  discount: DiscountCode,
  input: DiscountApplicationInput,
): DiscountApplicationResult {
  const code = requireNonEmptyString(input.code, 'Discount code');
  const subtotal = requireNonNegativeFinite(input.subtotal, 'Subtotal');

  if (code !== discount.code) {
    return {
      code: input.code,
      type: discount.type,
      valid: false,
      reason: 'Discount code does not match.',
      discountAmount: 0,
      lines: [],
      totalOriginal: subtotal,
      totalDiscount: 0,
      totalFinal: subtotal,
    };
  }

  const now = new Date();
  const validFrom = new Date(discount.validFrom);
  const validUntil = new Date(discount.validUntil);

  if (now < validFrom) {
    return { code: discount.code, type: discount.type, valid: false, reason: 'Discount is not yet active.', discountAmount: 0, lines: [], totalOriginal: subtotal, totalDiscount: 0, totalFinal: subtotal };
  }

  if (now > validUntil) {
    return { code: discount.code, type: discount.type, valid: false, reason: 'Discount has expired.', discountAmount: 0, lines: [], totalOriginal: subtotal, totalDiscount: 0, totalFinal: subtotal };
  }

  if (discount.usageLimit !== undefined && discount.usageCount >= discount.usageLimit) {
    return { code: discount.code, type: discount.type, valid: false, reason: 'Discount usage limit reached.', discountAmount: 0, lines: [], totalOriginal: subtotal, totalDiscount: 0, totalFinal: subtotal };
  }

  if (discount.minSpend !== undefined && subtotal < discount.minSpend) {
    return { code: discount.code, type: discount.type, valid: false, reason: `Minimum spend of ${discount.minSpend} not met.`, discountAmount: 0, lines: [], totalOriginal: subtotal, totalDiscount: 0, totalFinal: subtotal };
  }

  if (input.lineItems.length === 0) {
    return { code: discount.code, type: discount.type, valid: false, reason: 'No line items to discount.', discountAmount: 0, lines: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 };
  }

  const applicableItems = discount.applicableCategories
    ? input.lineItems.filter((item) => discount.applicableCategories!.includes(item.category))
    : input.lineItems;

  if (applicableItems.length === 0) {
    return { code: discount.code, type: discount.type, valid: false, reason: 'No items match the discount categories.', discountAmount: 0, lines: [], totalOriginal: subtotal, totalDiscount: 0, totalFinal: subtotal };
  }

  let totalDiscount = 0;
  const lines: DiscountLineResult[] = input.lineItems.map((item) => {
    const quantity = requirePositiveInteger(item.quantity, 'Quantity');
    const unitPrice = requireNonNegativeFinite(item.unitPrice, 'Unit price');
    const originalLineTotal = round2(quantity * unitPrice);
    const isApplicable = applicableItems.includes(item);
    let lineDiscount = 0;

    if (isApplicable) {
      switch (discount.type) {
        case 'percentage':
          lineDiscount = round2(originalLineTotal * (discount.value / 100));
          break;
        case 'fixed':
          lineDiscount = round2(Math.min(discount.value, originalLineTotal));
          break;
        case 'quantity':
          if (quantity >= discount.value) {
            lineDiscount = round2(originalLineTotal * 0.1);
          }
          break;
        case 'bundle':
          if (quantity >= 2) {
            lineDiscount = round2(originalLineTotal * (discount.value / 100));
          }
          break;
      }
    }

    totalDiscount += lineDiscount;
    return {
      productId: item.productId,
      name: item.name,
      originalLineTotal,
      discountAmount: lineDiscount,
      finalLineTotal: round2(originalLineTotal - lineDiscount),
    };
  });

  if (discount.maxDiscount !== undefined && totalDiscount > discount.maxDiscount) {
    totalDiscount = discount.maxDiscount;
  }

  totalDiscount = round2(totalDiscount);
  const totalOriginal = round2(lines.reduce((sum, l) => sum + l.originalLineTotal, 0));
  const totalFinal = round2(totalOriginal - totalDiscount);

  return {
    code: discount.code,
    type: discount.type,
    valid: true,
    discountAmount: totalDiscount,
    lines,
    totalOriginal,
    totalDiscount,
    totalFinal,
  };
}

/**
 * Build an auditable schema.org discount record as JSON-LD.
 */
export function buildDiscountRecord(input: DiscountRecordInput): DiscountRecordResult {
  const id = requireUri(input.id, 'id');
  const organisation = requireUri(input.organisation, 'organisation');
  const code = requireNonEmptyString(input.code, 'Discount code');
  const currency = requireCurrency(input.currency);
  const appliedAt = requireDate(input.appliedAt, 'appliedAt');

  return {
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Order',
      [LD_ID]: id,
      seller: { [LD_ID]: organisation },
      ...(input.customer ? { customer: { [LD_ID]: input.customer } } : {}),
      discount: code,
      discountCode: code,
      orderStatus: 'OrderCompleted',
      orderedAt: appliedAt,
      totalPrice: { currency, value: input.result.totalFinal },
      additionalProperty: [
        { name: 'discountType', value: input.result.type },
        { name: 'discountAmount', value: input.result.totalDiscount },
        { name: 'totalOriginal', value: input.result.totalOriginal },
        { name: 'totalFinal', value: input.result.totalFinal },
      ],
    },
  };
}
