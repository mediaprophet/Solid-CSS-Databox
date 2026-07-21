import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * A concession eligibility group (e.g. pensioner, student, veteran).
 */
export interface ConcessionGroup {
  readonly id: string;
  readonly name: string;
  readonly discountPercent: number;
  readonly description: string;
}

/**
 * Input for evaluating concession eligibility for a customer.
 */
export interface ConcessionEligibilityInput {
  readonly customerId: string;
  readonly credentialId?: string;
  readonly requestedGroupIds: readonly string[];
}

export interface ConcessionEligibilityResult {
  readonly customerId: string;
  readonly eligibleGroups: readonly ConcessionGroup[];
  readonly verified: boolean;
}

/**
 * Input for applying concession pricing to line items.
 */
export interface ConcessionPricingInput {
  readonly groupId: string;
  readonly discountPercent: number;
  readonly lineItems: readonly ConcessionLineItem[];
}

export interface ConcessionLineItem {
  readonly productId: string;
  readonly name: string;
  readonly originalPrice: number;
}

export interface ConcessionLineResult {
  readonly productId: string;
  readonly name: string;
  readonly originalPrice: number;
  readonly discountAmount: number;
  readonly finalPrice: number;
}

export interface ConcessionPricingResult {
  readonly groupId: string;
  readonly discountPercent: number;
  readonly lines: readonly ConcessionLineResult[];
  readonly totalOriginal: number;
  readonly totalDiscount: number;
  readonly totalFinal: number;
}

export interface ConcessionRecordInput {
  readonly id: string;
  readonly customer: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly currency: string;
  readonly appliedAt: string;
  readonly lines: readonly ConcessionLineResult[];
}

export interface ConcessionRecordResult {
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

function requirePercent(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new BadRequestHttpError(`${field} must be between 0 and 100.`);
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
    throw new BadRequestHttpError(`A concession record ${field} must be an absolute URI.`);
  }
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A concession record ${field} must be a valid date.`);
  }
  return value;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A concession record currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

/**
 * Evaluate concession eligibility for a customer.
 *
 * If a credentialId is provided, the customer is considered verified (the VC
 * would be checked against the credentials module in a full implementation).
 * Without a credential, only the group IDs are matched — verification is false.
 */
export function evaluateConcessionEligibility(input: ConcessionEligibilityInput): ConcessionEligibilityResult {
  const customerId = requireNonEmptyString(input.customerId, 'Customer ID');

  if (input.requestedGroupIds.length === 0) {
    return { customerId, eligibleGroups: [], verified: false };
  }

  const verified = input.credentialId !== undefined && input.credentialId.length > 0;

  const eligibleGroups: ConcessionGroup[] = input.requestedGroupIds.map((id) => ({
    id: requireNonEmptyString(id, 'Group ID'),
    name: id,
    discountPercent: 0,
    description: '',
  }));

  return { customerId, eligibleGroups, verified };
}

/**
 * Apply concession discount pricing to a set of line items.
 */
export function applyConcessionPricing(input: ConcessionPricingInput): ConcessionPricingResult {
  const groupId = requireNonEmptyString(input.groupId, 'Group ID');
  const discountPercent = requirePercent(input.discountPercent, 'Discount percent');

  if (input.lineItems.length === 0) {
    throw new BadRequestHttpError('Concession pricing requires at least one line item.');
  }

  const lines: ConcessionLineResult[] = input.lineItems.map((item) => {
    const originalPrice = requireNonNegativeFinite(item.originalPrice, 'Original price');
    const discountAmount = round2(originalPrice * (discountPercent / 100));
    const finalPrice = round2(originalPrice - discountAmount);
    return {
      productId: item.productId,
      name: item.name,
      originalPrice,
      discountAmount,
      finalPrice,
    };
  });

  const totalOriginal = round2(lines.reduce((sum, l) => sum + l.originalPrice, 0));
  const totalDiscount = round2(lines.reduce((sum, l) => sum + l.discountAmount, 0));
  const totalFinal = round2(totalOriginal - totalDiscount);

  return { groupId, discountPercent, lines, totalOriginal, totalDiscount, totalFinal };
}

/**
 * Build an auditable schema.org concession record as JSON-LD.
 */
export function buildConcessionRecord(input: ConcessionRecordInput): ConcessionRecordResult {
  const id = requireUri(input.id, 'id');
  const customer = requireUri(input.customer, 'customer');
  const groupId = requireNonEmptyString(input.groupId, 'Group ID');
  const groupName = requireNonEmptyString(input.groupName, 'Group name');
  const currency = requireCurrency(input.currency);
  const appliedAt = requireDate(input.appliedAt, 'appliedAt');

  const totalOriginal = round2(input.lines.reduce((sum, l) => sum + l.originalPrice, 0));
  const totalDiscount = round2(input.lines.reduce((sum, l) => sum + l.discountAmount, 0));
  const totalFinal = round2(totalOriginal - totalDiscount);

  return {
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Order',
      [LD_ID]: id,
      customer: { [LD_ID]: customer },
      discount: `${input.groupName} concession`,
      orderStatus: 'OrderCompleted',
      orderedAt: appliedAt,
      totalPrice: { currency, value: totalFinal },
      additionalProperty: [
        { name: 'concessionGroupId', value: groupId },
        { name: 'concessionGroupName', value: groupName },
        { name: 'totalOriginal', value: totalOriginal },
        { name: 'totalDiscount', value: totalDiscount },
        { name: 'totalFinal', value: totalFinal },
      ],
      orderedItem: input.lines.map((l) => ({
        [LD_TYPE]: 'OrderItem',
        productID: l.productId,
        name: l.name,
        originalPrice: l.originalPrice,
        discountAmount: l.discountAmount,
        finalPrice: l.finalPrice,
      })),
    },
  };
}
