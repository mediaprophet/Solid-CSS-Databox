import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import {
  LD_CONTEXT,
  LD_ID,
  LD_TYPE,
  money,
  requireCurrency,
  requireDate,
  requireNonEmpty,
  requireNonNegativeFinite,
  requireUri,
  round2,
} from './PosValidation';

export type PromotionBenefit = 'percent' | 'fixed' | 'messageOnly';

export interface PromotionDescriptorInput {
  readonly id: string;
  readonly name: string;
  readonly benefit: PromotionBenefit;
  readonly value: number;
  readonly currency: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly requiredCode?: string;
  readonly minSubtotal?: number;
  readonly eligibleSkus?: readonly string[];
  readonly eligibleCustomerSegments?: readonly string[];
}

export interface PromotionCartContext {
  readonly subtotal: number;
  readonly currency: string;
  readonly skus: readonly string[];
  readonly customerSegments?: readonly string[];
  readonly code?: string;
  readonly now: string;
}

export interface PromotionEligibilityResult {
  readonly eligible: boolean;
  readonly discountAmount: number;
  readonly reasons: readonly string[];
}

export interface PromotionDescriptorResult {
  readonly eligibility: PromotionEligibilityResult;
  readonly record: Record<string, unknown>;
}

const BENEFITS: ReadonlySet<PromotionBenefit> = new Set([ 'percent', 'fixed', 'messageOnly' ]);

function requireBenefit(benefit: PromotionBenefit): PromotionBenefit {
  if (!BENEFITS.has(benefit)) {
    throw new BadRequestHttpError('A POS promotion benefit is not supported.');
  }
  return benefit;
}

function optionalNonEmpty(value: string | undefined, subject: string, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmpty(value, subject, field);
}

function normalizeList(values: readonly string[] | undefined, subject: string, field: string): readonly string[] {
  return (values ?? []).map((value): string => requireNonEmpty(value, subject, field));
}

function evaluateDateWindow(
  promotion: PromotionDescriptorInput,
  nowValue: string,
  reasons: string[],
): void {
  const now = new Date(requireDate(nowValue, 'POS promotion eligibility', 'now')).getTime();
  if (promotion.startsAt !== undefined) {
    const startsAt = new Date(requireDate(promotion.startsAt, 'POS promotion', 'startsAt')).getTime();
    if (now < startsAt) {
      reasons.push('not-started');
    }
  }
  if (promotion.endsAt !== undefined) {
    const endsAt = new Date(requireDate(promotion.endsAt, 'POS promotion', 'endsAt')).getTime();
    if (now > endsAt) {
      reasons.push('expired');
    }
  }
}

export function evaluatePromotionEligibility(
  promotion: PromotionDescriptorInput,
  context: PromotionCartContext,
): PromotionEligibilityResult {
  const benefit = requireBenefit(promotion.benefit);
  const value = requireNonNegativeFinite(promotion.value, 'POS promotion', 'value');
  const promotionCurrency = requireCurrency(promotion.currency, 'POS promotion');
  const contextCurrency = requireCurrency(context.currency, 'POS promotion eligibility');
  const subtotal = requireNonNegativeFinite(context.subtotal, 'POS promotion eligibility', 'subtotal');
  const reasons: string[] = [];

  requireUri(promotion.id, 'POS promotion', 'id');
  requireNonEmpty(promotion.name, 'POS promotion', 'name');
  evaluateDateWindow(promotion, context.now, reasons);

  if (promotionCurrency !== contextCurrency) {
    reasons.push('currency-mismatch');
  }

  const minSubtotal = promotion.minSubtotal === undefined ?
    undefined :
      requireNonNegativeFinite(promotion.minSubtotal, 'POS promotion', 'minSubtotal');
  if (minSubtotal !== undefined && subtotal < minSubtotal) {
    reasons.push('subtotal-too-low');
  }

  const requiredCode = optionalNonEmpty(promotion.requiredCode, 'POS promotion', 'requiredCode');
  if (requiredCode !== undefined && requiredCode.toUpperCase() !== (context.code ?? '').trim().toUpperCase()) {
    reasons.push('code-required');
  }

  const eligibleSkus = normalizeList(promotion.eligibleSkus, 'POS promotion', 'eligibleSku');
  if (eligibleSkus.length > 0 && !context.skus.some((sku): boolean => eligibleSkus.includes(sku))) {
    reasons.push('sku-not-eligible');
  }

  const eligibleSegments = normalizeList(
    promotion.eligibleCustomerSegments,
    'POS promotion',
    'eligibleCustomerSegment',
  );
  const customerSegments = context.customerSegments ?? [];
  if (eligibleSegments.length > 0 && !customerSegments.some((segment): boolean => eligibleSegments.includes(segment))) {
    reasons.push('customer-segment-not-eligible');
  }

  if (benefit === 'percent' && value > 100) {
    throw new BadRequestHttpError('A POS promotion percent value must be between 0 and 100.');
  }

  const eligible = reasons.length === 0;
  const discountAmount = eligible ? calculateDiscount(benefit, value, subtotal) : 0;

  return { eligible, discountAmount, reasons };
}

function calculateDiscount(benefit: PromotionBenefit, value: number, subtotal: number): number {
  if (benefit === 'messageOnly') {
    return 0;
  }
  if (benefit === 'percent') {
    return round2(subtotal * value / 100);
  }
  return round2(Math.min(value, subtotal));
}

export function buildPromotionDescriptor(
  promotion: PromotionDescriptorInput,
  context: PromotionCartContext,
): PromotionDescriptorResult {
  const id = requireUri(promotion.id, 'POS promotion', 'id');
  const name = requireNonEmpty(promotion.name, 'POS promotion', 'name');
  const benefit = requireBenefit(promotion.benefit);
  const value = requireNonNegativeFinite(promotion.value, 'POS promotion', 'value');
  const currency = requireCurrency(promotion.currency, 'POS promotion');
  const eligibility = evaluatePromotionEligibility(promotion, context);
  const minSubtotal = promotion.minSubtotal === undefined ?
    undefined :
      requireNonNegativeFinite(promotion.minSubtotal, 'POS promotion', 'minSubtotal');
  const eligibleSkus = normalizeList(promotion.eligibleSkus, 'POS promotion', 'eligibleSku');
  const eligibleSegments = normalizeList(
    promotion.eligibleCustomerSegments,
    'POS promotion',
    'eligibleCustomerSegment',
  );

  return {
    eligibility,
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Offer',
      [LD_ID]: id,
      name,
      priceCurrency: currency,
      category: 'POS promotion',
      eligibleTransactionVolume: minSubtotal === undefined ?
        undefined :
          {
            [LD_TYPE]: 'PriceSpecification',
            price: money(minSubtotal),
            priceCurrency: currency,
          },
      ...promotion.startsAt === undefined ?
          {} :
          {
            validFrom: requireDate(promotion.startsAt, 'POS promotion', 'startsAt'),
          },
      ...promotion.endsAt === undefined ?
          {} :
          {
            validThrough: requireDate(promotion.endsAt, 'POS promotion', 'endsAt'),
          },
      additionalProperty: [
        { [LD_TYPE]: 'PropertyValue', name: 'benefit', value: benefit },
        { [LD_TYPE]: 'PropertyValue', name: 'value', value },
        { [LD_TYPE]: 'PropertyValue', name: 'eligible', value: eligibility.eligible },
        { [LD_TYPE]: 'PropertyValue', name: 'discountAmount', value: money(eligibility.discountAmount) },
        ...eligibleSkus.map((sku): Record<string, unknown> => ({
          [LD_TYPE]: 'PropertyValue',
          name: 'eligibleSku',
          value: sku,
        })),
        ...eligibleSegments.map((segment): Record<string, unknown> => ({
          [LD_TYPE]: 'PropertyValue',
          name: 'eligibleCustomerSegment',
          value: segment,
        })),
        ...eligibility.reasons.map((reason): Record<string, unknown> => ({
          [LD_TYPE]: 'PropertyValue',
          name: 'ineligibilityReason',
          value: reason,
        })),
      ],
    },
  };
}
