import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export type EmploymentType = 'employee' | 'contractor' | 'casual' | 'volunteer';

export interface OnboardingInput {
  readonly id: string;
  readonly person: string;
  readonly organisation: string;
  readonly role: string;
  readonly employmentType: EmploymentType;
  readonly startDate: string;
  readonly contractUrl?: string;
  readonly podUrl?: string;
  readonly webId?: string;
}

export interface OnboardingResult {
  readonly record: Record<string, unknown>;
  readonly status: 'onboarded';
  readonly employmentType: EmploymentType;
}

export interface ShiftInput {
  readonly id: string;
  readonly person: string;
  readonly organisation: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly role: string;
  readonly location?: string;
  readonly breakMinutes?: number;
}

export interface ShiftResult {
  readonly record: Record<string, unknown>;
  readonly durationMinutes: number;
}

export interface ComplianceCredentialInput {
  readonly id: string;
  readonly person: string;
  readonly credentialType: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly issuer: string;
  readonly status: 'valid' | 'expiring' | 'expired';
}

export interface ComplianceResult {
  readonly record: Record<string, unknown>;
  readonly needsRenewal: boolean;
  readonly daysToExpiry: number;
}

export interface PayslipInput {
  readonly id: string;
  readonly person: string;
  readonly organisation: string;
  readonly payPeriodStart: string;
  readonly payPeriodEnd: string;
  readonly grossAmount: number;
  readonly netAmount: number;
  readonly currency: string;
  readonly deductions: readonly { readonly label: string; readonly amount: number }[];
  readonly payDate: string;
}

export interface PayslipResult {
  readonly record: Record<string, unknown>;
  readonly totalDeductions: number;
}

export interface ExpenseClaimInput {
  readonly id: string;
  readonly person: string;
  readonly organisation: string;
  readonly amount: number;
  readonly currency: string;
  readonly category: string;
  readonly description: string;
  readonly incurredAt: string;
  readonly receiptUrl?: string;
}

export interface ExpenseClaimResult {
  readonly record: Record<string, unknown>;
  readonly status: 'pending';
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`An HR ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`An HR ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`An HR ${field} must be a valid date.`);
  }
  return value;
}

function requirePositiveNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`An HR ${field} must be a positive number.`);
  }
  return value;
}

function requireEmploymentType(value: string): EmploymentType {
  const valid: EmploymentType[] = [ 'employee', 'contractor', 'casual', 'volunteer' ];
  if (!valid.includes(value as EmploymentType)) {
    throw new BadRequestHttpError(`Employment type must be one of: ${valid.join(', ')}.`);
  }
  return value as EmploymentType;
}

/**
 * Onboard an employee or contractor — creates a directory entry,
 * member pod binding, role VC, and employment contract reference.
 */
export function onboardEmployee(input: OnboardingInput): OnboardingResult {
  const id = requireUri(input.id, 'id');
  const person = requireUri(input.person, 'person');
  const organisation = requireUri(input.organisation, 'organisation');
  const role = requireUri(input.role, 'role');
  const employmentType = requireEmploymentType(input.employmentType);
  const startDate = requireDate(input.startDate, 'startDate');

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://www.w3.org/ns/solid/v1' ],
    [LD_TYPE]: [ 'OnboardEvent', 'Action' ],
    [LD_ID]: id,
    agent: { [LD_ID]: organisation },
    object: { [LD_ID]: person },
    actionStatus: 'CompletedActionStatus',
    startTime: startDate,
    instrument: { [LD_TYPE]: 'Role', roleName: role },
    employmentType,
  };

  if (input.contractUrl) {
    record.target = { [LD_ID]: requireUri(input.contractUrl, 'contractUrl') };
  }
  if (input.podUrl) {
    record['solid:pod'] = requireUri(input.podUrl, 'podUrl');
  }
  if (input.webId) {
    record.identifier = requireUri(input.webId, 'webId');
  }

  return { record, status: 'onboarded', employmentType };
}

/**
 * Assign a shift to an employee — produces a schema.org Event record.
 */
export function assignShift(input: ShiftInput): ShiftResult {
  const id = requireUri(input.id, 'id');
  const person = requireUri(input.person, 'person');
  const organisation = requireUri(input.organisation, 'organisation');
  const role = requireUri(input.role, 'role');
  const startTime = requireDate(input.startTime, 'startTime');
  const endTime = requireDate(input.endTime, 'endTime');

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end <= start) {
    throw new BadRequestHttpError('Shift endTime must be after startTime.');
  }

  let durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (input.breakMinutes && input.breakMinutes > 0) {
    durationMinutes -= input.breakMinutes;
  }

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Event', 'Shift' ],
    [LD_ID]: id,
    organizer: { [LD_ID]: organisation },
    attendee: { [LD_ID]: person },
    startDate: startTime,
    endDate: endTime,
    about: { [LD_TYPE]: 'Role', roleName: role },
    duration: `PT${durationMinutes}M`,
  };

  if (input.location) {
    record.location = requireNonEmpty(input.location, 'location');
  }
  if (input.breakMinutes) {
    record.breakDuration = `PT${input.breakMinutes}M`;
  }

  return { record, durationMinutes };
}

/**
 * Track a compliance credential (e.g. RSA certificate, food safety, first aid)
 * with expiry monitoring.
 */
export function trackCompliance(input: ComplianceCredentialInput): ComplianceResult {
  const id = requireUri(input.id, 'id');
  const person = requireUri(input.person, 'person');
  const credentialType = requireNonEmpty(input.credentialType, 'credentialType');
  const issuedAt = requireDate(input.issuedAt, 'issuedAt');
  const expiresAt = requireDate(input.expiresAt, 'expiresAt');
  const issuer = requireUri(input.issuer, 'issuer');

  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysToExpiry = Math.floor((expiry.getTime() - now.getTime()) / 86400000);
  const needsRenewal = daysToExpiry <= 30;

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'EducationalOccupationalCredential', 'Action' ],
    [LD_ID]: id,
    agent: { [LD_ID]: person },
    provider: { [LD_ID]: issuer },
    name: credentialType,
    dateCreated: issuedAt,
    expiresAt,
    daysToExpiry,
    needsRenewal,
  };

  return { record, needsRenewal, daysToExpiry };
}

/**
 * Generate a payslip as RDF for delivery to a member's pod.
 */
export function generatePayslip(input: PayslipInput): PayslipResult {
  const id = requireUri(input.id, 'id');
  const person = requireUri(input.person, 'person');
  const organisation = requireUri(input.organisation, 'organisation');
  const grossAmount = requirePositiveNumber(input.grossAmount, 'grossAmount');
  const netAmount = requirePositiveNumber(input.netAmount, 'netAmount');
  const currency = requireNonEmpty(input.currency, 'currency');
  const payPeriodStart = requireDate(input.payPeriodStart, 'payPeriodStart');
  const payPeriodEnd = requireDate(input.payPeriodEnd, 'payPeriodEnd');
  const payDate = requireDate(input.payDate, 'payDate');

  if (netAmount > grossAmount) {
    throw new BadRequestHttpError('Net amount cannot exceed gross amount.');
  }

  const totalDeductions = grossAmount - netAmount;
  const deductionsSum = input.deductions.reduce((sum, d) => sum + d.amount, 0);
  if (Math.abs(deductionsSum - totalDeductions) > 0.01) {
    throw new BadRequestHttpError(
      `Deductions sum (${deductionsSum}) does not match gross-net difference (${totalDeductions}).`,
    );
  }

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Invoice', 'Payslip' ],
    [LD_ID]: id,
    provider: { [LD_ID]: organisation },
    customer: { [LD_ID]: person },
    paymentStatus: 'PaymentComplete',
    paymentMethod: 'DirectDeposit',
    totalPaymentDue: { [LD_TYPE]: 'MonetaryAmount', value: netAmount, currency },
    totalPrice: { [LD_TYPE]: 'MonetaryAmount', value: grossAmount, currency },
    referencesOrder: input.deductions.map((d, i) => ({
      [LD_TYPE]: 'OrderItem',
      description: d.label,
      orderItemNumber: i + 1,
      orderItemStatus: 'OrderDelivered',
      orderedItem: { [LD_TYPE]: 'MonetaryAmount', value: -d.amount, currency },
    })),
    paymentDueDate: payDate,
    billingPeriod: `${payPeriodStart}/${payPeriodEnd}`,
  };

  return { record, totalDeductions };
}

/**
 * Submit an expense claim for reimbursement.
 */
export function submitExpenseClaim(input: ExpenseClaimInput): ExpenseClaimResult {
  const id = requireUri(input.id, 'id');
  const person = requireUri(input.person, 'person');
  const organisation = requireUri(input.organisation, 'organisation');
  const amount = requirePositiveNumber(input.amount, 'amount');
  const currency = requireNonEmpty(input.currency, 'currency');
  const category = requireNonEmpty(input.category, 'category');
  const description = requireNonEmpty(input.description, 'description');
  const incurredAt = requireDate(input.incurredAt, 'incurredAt');

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Invoice', 'ExpenseClaim' ],
    [LD_ID]: id,
    provider: { [LD_ID]: person },
    customer: { [LD_ID]: organisation },
    paymentStatus: 'PaymentDue',
    totalPaymentDue: { [LD_TYPE]: 'MonetaryAmount', value: amount, currency },
    description,
    category,
    referencesOrder: [{
      [LD_TYPE]: 'OrderItem',
      description: category,
      orderedItem: { [LD_TYPE]: 'MonetaryAmount', value: amount, currency },
    }],
    billingPeriod: incurredAt,
  };

  if (input.receiptUrl) {
    record.orderDate = requireUri(input.receiptUrl, 'receiptUrl');
  }

  return { record, status: 'pending' };
}
