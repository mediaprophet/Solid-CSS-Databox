import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export type DonationFrequency = 'one-off' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface DonationCampaign {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly targetAmount: number;
  readonly raisedAmount: number;
  readonly currency: string;
  readonly deadline: string;
  readonly active: boolean;
}

export interface DonationInput {
  readonly campaignId: string;
  readonly donorId: string;
  readonly amount: number;
  readonly currency: string;
  readonly frequency: DonationFrequency;
  readonly message?: string;
  readonly dedication?: string;
  readonly anonymous: boolean;
}

export interface DonationResult {
  readonly donationId: string;
  readonly campaignId: string;
  readonly donorId: string;
  readonly amount: number;
  readonly currency: string;
  readonly frequency: DonationFrequency;
  readonly anonymous: boolean;
  readonly newRaisedTotal: number;
  readonly progressPercent: number;
}

export interface DonationReceiptInput {
  readonly id: string;
  readonly organisation: string;
  readonly donor: string;
  readonly campaign: string;
  readonly amount: number;
  readonly currency: string;
  readonly taxDeductible: boolean;
  readonly donatedAt: string;
  readonly frequency: DonationFrequency;
}

export interface DonationReceiptResult {
  readonly receipt: Record<string, unknown>;
}

export interface DonationTransparencyReportInput {
  readonly id: string;
  readonly organisation: string;
  readonly campaignId: string;
  readonly currency: string;
  readonly donations: readonly { amount: number; allocatedTo: string }[];
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface DonationTransparencyReportResult {
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

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`${field} must be a positive finite number.`);
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
    throw new BadRequestHttpError(`A donation ${field} must be an absolute URI.`);
  }
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A donation ${field} must be a valid date.`);
  }
  return value;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A donation currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function requireFrequency(value: string): DonationFrequency {
  const valid: DonationFrequency[] = ['one-off', 'weekly', 'monthly', 'quarterly', 'annually'];
  if (!valid.includes(value as DonationFrequency)) {
    throw new BadRequestHttpError(`Donation frequency must be one of: ${valid.join(', ')}.`);
  }
  return value as DonationFrequency;
}

/**
 * Process a donation against a campaign, updating the raised total and computing progress.
 */
export function processDonation(
  campaign: DonationCampaign,
  input: DonationInput,
): DonationResult {
  const campaignId = requireNonEmptyString(input.campaignId, 'Campaign ID');
  const donorId = requireNonEmptyString(input.donorId, 'Donor ID');
  const amount = requirePositiveFinite(input.amount, 'Donation amount');
  const currency = requireCurrency(input.currency);
  const frequency = requireFrequency(input.frequency);

  if (campaignId !== campaign.id) {
    throw new BadRequestHttpError('Donation campaign ID does not match the campaign.');
  }

  if (!campaign.active) {
    throw new BadRequestHttpError('Donation campaign is not active.');
  }

  if (currency !== campaign.currency) {
    throw new BadRequestHttpError(`Donation currency (${currency}) does not match campaign currency (${campaign.currency}).`);
  }

  const deadline = new Date(campaign.deadline);
  if (new Date() > deadline) {
    throw new BadRequestHttpError('Donation campaign deadline has passed.');
  }

  const newRaisedTotal = round2(campaign.raisedAmount + amount);
  const progressPercent = campaign.targetAmount > 0
    ? Math.min(100, round2((newRaisedTotal / campaign.targetAmount) * 100))
    : 0;

  return {
    donationId: `don-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campaignId,
    donorId,
    amount,
    currency,
    frequency,
    anonymous: input.anonymous,
    newRaisedTotal,
    progressPercent,
  };
}

/**
 * Build a donation receipt as a schema.org JSON-LD document.
 * When taxDeductible is true, includes additional properties for tax receipt purposes.
 */
export function buildDonationReceipt(input: DonationReceiptInput): DonationReceiptResult {
  const id = requireUri(input.id, 'receipt id');
  const organisation = requireUri(input.organisation, 'organisation');
  const donor = requireUri(input.donor, 'donor');
  const campaign = requireUri(input.campaign, 'campaign');
  const amount = requirePositiveFinite(input.amount, 'Donation amount');
  const currency = requireCurrency(input.currency);
  const donatedAt = requireDate(input.donatedAt, 'donatedAt');
  const frequency = requireFrequency(input.frequency);

  return {
    receipt: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Invoice',
      [LD_ID]: id,
      sender: { [LD_ID]: donor },
      recipient: { [LD_ID]: organisation },
      description: `Donation to ${campaign}`,
      totalPaymentDue: { currency, value: amount },
      paymentStatus: 'PaymentComplete',
      datePaid: donatedAt,
      additionalProperty: [
        { name: 'donationFrequency', value: frequency },
        { name: 'taxDeductible', value: input.taxDeductible },
        { name: 'campaign', value: campaign },
      ],
    },
  };
}

/**
 * Build a transparency report showing how donations were allocated.
 * This is published as public RDF so donors and the public can verify fund usage.
 */
export function buildTransparencyReport(input: DonationTransparencyReportInput): DonationTransparencyReportResult {
  const id = requireUri(input.id, 'report id');
  const organisation = requireUri(input.organisation, 'organisation');
  const campaignId = requireNonEmptyString(input.campaignId, 'Campaign ID');
  const currency = requireCurrency(input.currency);
  const periodStart = requireDate(input.periodStart, 'periodStart');
  const periodEnd = requireDate(input.periodEnd, 'periodEnd');

  const totalRaised = round2(input.donations.reduce((sum, d) => sum + d.amount, 0));
  const allocations = new Map<string, number>();
  for (const d of input.donations) {
    const current = allocations.get(d.allocatedTo) ?? 0;
    allocations.set(d.allocatedTo, round2(current + d.amount));
  }

  return {
    report: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Dataset',
      [LD_ID]: id,
      creator: { [LD_ID]: organisation },
      name: `Donation Transparency Report — ${campaignId}`,
      description: `Public transparency report for donations to ${campaignId} (${periodStart} to ${periodEnd}).`,
      datePublished: new Date().toISOString(),
      additionalProperty: [
        { name: 'campaignId', value: campaignId },
        { name: 'periodStart', value: periodStart },
        { name: 'periodEnd', value: periodEnd },
        { name: 'totalRaised', value: totalRaised },
        { name: 'currency', value: currency },
      ],
      distribution: Array.from(allocations.entries()).map(([allocatedTo, amount]) => ({
        name: allocatedTo,
        amount,
        percent: totalRaised > 0 ? round2((amount / totalRaised) * 100) : 0,
      })),
    },
  };
}
