import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * A tax jurisdiction definition (e.g. AU-GST, EU-VAT, US-SALES).
 */
export interface TaxJurisdiction {
  readonly code: string;
  readonly name: string;
  readonly rate: number;
  readonly taxInclusive: boolean;
}

/**
 * A tax exemption certificate (e.g. charity, reseller).
 */
export interface TaxExemption {
  readonly id: string;
  readonly holder: string;
  readonly type: 'charity' | 'reseller' | 'government' | 'diplomatic' | 'other';
  readonly jurisdictionCode: string;
  readonly validUntil: string;
}

/**
 * Input for computing tax on a set of line items.
 */
export interface TaxComputationInput {
  readonly jurisdictionCode: string;
  readonly taxInclusive: boolean;
  readonly lineItems: readonly TaxLineItem[];
  readonly exemptionId?: string;
}

export interface TaxLineItem {
  readonly productId: string;
  readonly category: string;
  readonly amount: number;
  readonly taxRate?: number;
}

export interface TaxLineResult {
  readonly productId: string;
  readonly category: string;
  readonly netAmount: number;
  readonly taxAmount: number;
  readonly grossAmount: number;
  readonly taxRate: number;
  readonly exempt: boolean;
}

export interface TaxComputationResult {
  readonly jurisdictionCode: string;
  readonly taxInclusive: boolean;
  readonly lines: readonly TaxLineResult[];
  readonly totalNet: number;
  readonly totalTax: number;
  readonly totalGross: number;
  readonly exemptionApplied: boolean;
}

export interface TaxReportInput {
  readonly id: string;
  readonly organisation: string;
  readonly jurisdictionCode: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly currency: string;
  readonly lines: readonly TaxLineResult[];
}

export interface TaxReportResult {
  readonly report: Record<string, unknown>;
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

function requireRate(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestHttpError(`${field} must be between 0 and 1.`);
  }
  return value;
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestHttpError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A tax report ${field} must be a valid date.`);
  }
  return value;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A tax report currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A tax report ${field} must be an absolute URI.`);
  }
}

/**
 * Compute tax for a set of line items under a given jurisdiction.
 *
 * When `taxInclusive` is true, the line item `amount` includes tax and we extract it.
 * When false, tax is added on top of the net amount.
 * If an exemption ID is provided, tax is zeroed for all lines.
 */
export function computeTax(input: TaxComputationInput): TaxComputationResult {
  const jurisdictionCode = requireNonEmptyString(input.jurisdictionCode, 'Jurisdiction code');
  const taxInclusive = input.taxInclusive;
  const exemptionApplied = input.exemptionId !== undefined && input.exemptionId.length > 0;

  if (input.lineItems.length === 0) {
    throw new BadRequestHttpError('Tax computation requires at least one line item.');
  }

  const lines: TaxLineResult[] = input.lineItems.map((item) => {
    const amount = requireNonNegativeFinite(item.amount, 'Line item amount');
    const rate = item.taxRate === undefined ? 0 : requireRate(item.taxRate, 'Line item tax rate');
    const exempt = exemptionApplied;

    if (exempt) {
      return {
        productId: item.productId,
        category: item.category,
        netAmount: taxInclusive ? round2(amount / (1 + rate)) : amount,
        taxAmount: 0,
        grossAmount: amount,
        taxRate: rate,
        exempt: true,
      };
    }

    if (taxInclusive) {
      const netAmount = round2(amount / (1 + rate));
      const taxAmount = round2(amount - netAmount);
      return {
        productId: item.productId,
        category: item.category,
        netAmount,
        taxAmount,
        grossAmount: amount,
        taxRate: rate,
        exempt: false,
      };
    }

    const taxAmount = round2(amount * rate);
    return {
      productId: item.productId,
      category: item.category,
      netAmount: amount,
      taxAmount,
      grossAmount: round2(amount + taxAmount),
      taxRate: rate,
      exempt: false,
    };
  });

  const totalNet = round2(lines.reduce((sum, l) => sum + l.netAmount, 0));
  const totalTax = round2(lines.reduce((sum, l) => sum + l.taxAmount, 0));
  const totalGross = round2(totalNet + totalTax);

  return {
    jurisdictionCode,
    taxInclusive,
    lines,
    totalNet,
    totalTax,
    totalGross,
    exemptionApplied,
  };
}

/**
 * Build an auditable schema.org tax report as JSON-LD for accounting export.
 */
export function buildTaxReport(input: TaxReportInput): TaxReportResult {
  const id = requireUri(input.id, 'id');
  const organisation = requireUri(input.organisation, 'organisation');
  const jurisdictionCode = requireNonEmptyString(input.jurisdictionCode, 'Jurisdiction code');
  const periodStart = requireDate(input.periodStart, 'periodStart');
  const periodEnd = requireDate(input.periodEnd, 'periodEnd');
  const currency = requireCurrency(input.currency);

  const totalNet = round2(input.lines.reduce((sum, l) => sum + l.netAmount, 0));
  const totalTax = round2(input.lines.reduce((sum, l) => sum + l.taxAmount, 0));

  return {
    report: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Invoice',
      [LD_ID]: id,
      sender: { [LD_ID]: organisation },
      description: `Tax report for ${jurisdictionCode} (${periodStart} to ${periodEnd})`,
      totalPaymentDue: {
        currency,
        value: totalTax,
      },
      referencesOrder: input.lines.map(l => ({
        [LD_TYPE]: 'OrderItem',
        productID: l.productId,
        category: l.category,
        netAmount: l.netAmount,
        taxAmount: l.taxAmount,
        grossAmount: l.grossAmount,
        taxRate: l.taxRate,
        exempt: l.exempt,
      })),
      additionalProperty: [
        { name: 'jurisdictionCode', value: jurisdictionCode },
        { name: 'periodStart', value: periodStart },
        { name: 'periodEnd', value: periodEnd },
        { name: 'totalNet', value: totalNet },
        { name: 'totalTax', value: totalTax },
      ],
    },
  };
}
