import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * Input for applying a loyalty-points transaction.
 */
export interface LoyaltyInput {
  readonly balance: number;
  readonly spendAmount: number;
  readonly earnRatePer: number;
  readonly redeemPoints: number;
  readonly redeemValuePer: number;
}

/**
 * The resolved outcome of a loyalty-points transaction.
 */
export interface LoyaltyResult {
  readonly earned: number;
  readonly redeemedPoints: number;
  readonly redeemedValue: number;
  readonly newBalance: number;
}

export interface LoyaltyRecordInput extends LoyaltyInput {
  readonly id: string;
  readonly member: string;
  readonly program: string;
  readonly currency: string;
  readonly appliedAt: string;
}

export interface LoyaltyRecordResult extends LoyaltyResult {
  readonly record: Record<string, unknown>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A loyalty record ${field} must be an absolute URI.`);
  }
}

function requireNonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`${field} must be greater than or equal to 0.`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new BadRequestHttpError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A loyalty record currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A loyalty record ${field} must be a valid date.`);
  }
  return value;
}

/**
 * Applies a loyalty-points earn/redeem transaction to an existing balance.
 *
 * Points are earned from the spend amount at the given rate, and points may be redeemed
 * for value, capped at the current balance.
 */
export function applyLoyalty(input: LoyaltyInput): LoyaltyResult {
  const balance = requireNonNegativeInteger(input.balance, 'Loyalty balance');
  const spendAmount = requireNonNegativeFinite(input.spendAmount, 'Spend amount');
  const earnRatePer = requireNonNegativeFinite(input.earnRatePer, 'Earn rate');
  const redeemPoints = requireNonNegativeInteger(input.redeemPoints, 'Redeem points');
  const redeemValuePer = requireNonNegativeFinite(input.redeemValuePer, 'Redeem value');

  const earned = Math.floor(spendAmount * earnRatePer);
  const redeemedPoints = Math.min(redeemPoints, balance);
  const redeemedValue = round2(redeemedPoints * redeemValuePer);
  const newBalance = balance + earned - redeemedPoints;

  return {
    earned,
    redeemedPoints,
    redeemedValue,
    newBalance,
  };
}

/**
 * Build an auditable schema.org `Action` for a loyalty earn/redeem transaction.
 */
export function buildLoyaltyRecord(input: LoyaltyRecordInput): LoyaltyRecordResult {
  const id = requireUri(input.id, 'id');
  const member = requireUri(input.member, 'member');
  const program = requireUri(input.program, 'program');
  const currency = requireCurrency(input.currency);
  const appliedAt = requireDate(input.appliedAt, 'appliedAt');
  const result = applyLoyalty(input);

  return {
    ...result,
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Action',
      [LD_ID]: id,
      agent: { [LD_ID]: member },
      instrument: { [LD_ID]: program },
      name: 'LoyaltyTransaction',
      actionStatus: 'CompletedActionStatus',
      startTime: appliedAt,
      result: {
        currency,
        earned: result.earned,
        redeemedPoints: result.redeemedPoints,
        redeemedValue: result.redeemedValue,
        newBalance: result.newBalance,
      },
    },
  };
}
