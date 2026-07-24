import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * Supported EFTPOS terminal protocols.
 */
export type EftposProtocol = 'IPG' | 'REST' | 'SOAP' | 'HID' | 'SERIAL';

/**
 * Supported EFTPOS terminal providers.
 */
export type EftposProvider =
  | 'tyro' |
  'linkly' |
  'westpac' |
  'commbank' |
  'nab' |
  'anz' |
  'stripe-terminal' |
  'square-terminal' |
  'sumup' |
  'custom';

/**
 * EFTPOS terminal connection configuration.
 */
export interface EftposTerminalConfig {
  readonly terminalId: string;
  readonly provider: EftposProvider;
  readonly protocol: EftposProtocol;
  readonly endpoint?: string;
  readonly apiKey?: string;
  readonly merchantId?: string;
  readonly currency: string;
  readonly timeout: number;
}

/**
 * EFTPOS transaction request.
 */
export interface EftposTransactionInput {
  readonly terminalId: string;
  readonly transactionType: EftposTransactionType;
  readonly amount: number;
  readonly currency: string;
  readonly reference?: string;
  readonly receiptNumber?: string;
  readonly operatorId?: string;
  readonly cashoutAmount?: number;
  readonly tipAmount?: number;
  readonly surchargeAmount?: number;
}

export type EftposTransactionType =
  | 'PURCHASE' |
  'REFUND' |
  'CASHOUT' |
  'PURCHASE_PLUS_CASHOUT' |
  'PREAUTH' |
  'PREAUTH_COMPLETE' |
  'VOID' |
  'SETTLEMENT';

export type EftposTransactionStatus =
  | 'APPROVED' |
  'DECLINED' |
  'CANCELLED' |
  'TIMEOUT' |
  'PENDING' |
  'SETTLED' |
  'FAILED';

export interface EftposTransactionResult {
  readonly terminalId: string;
  readonly transactionId: string;
  readonly status: EftposTransactionStatus;
  readonly authCode?: string;
  readonly accountType?: 'CHEQUE' | 'SAVINGS' | 'CREDIT';
  readonly cardType?: string;
  readonly cardNumberMasked?: string;
  readonly amount: number;
  readonly cashoutAmount?: number;
  readonly tipAmount?: number;
  readonly surchargeAmount?: number;
  readonly merchantReceipt?: string;
  readonly customerReceipt?: string;
  readonly responseCode?: string;
  readonly responseText?: string;
  readonly record: Record<string, unknown>;
}

export interface EftposSettlementResult {
  readonly terminalId: string;
  readonly settlementId: string;
  readonly status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'PENDING';
  readonly totalTransactions: number;
  readonly totalAmount: number;
  readonly settledAt: string;
  readonly record: Record<string, unknown>;
}

export interface EftposTerminalStatus {
  readonly terminalId: string;
  readonly online: boolean;
  readonly available: boolean;
  readonly lastActivity?: string;
  readonly record: Record<string, unknown>;
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`An EFTPOS ${field} must not be empty.`);
  }
  return trimmed;
}

function requirePositiveAmount(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`An EFTPOS ${field} must be a non-negative finite number.`);
  }
  return Math.round(value * 100) / 100;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('EFTPOS currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function generateTransactionId(): string {
  return `eftpos-txn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Process an EFTPOS transaction request.
 * In a real deployment, this would communicate with the terminal via the
 * configured protocol (IPG, REST, SOAP, HID, or SERIAL). This implementation
 * validates the request and produces a structured result that the POS
 * integration layer can dispatch to the actual terminal driver.
 */
export function processEftposTransaction(
  input: EftposTransactionInput,
  config: EftposTerminalConfig,
): EftposTransactionResult {
  const terminalId = requireNonEmpty(input.terminalId, 'terminalId');
  const amount = requirePositiveAmount(input.amount, 'amount');
  const currency = requireCurrency(input.currency);

  if (terminalId !== config.terminalId) {
    throw new BadRequestHttpError(
      `Terminal ID "${terminalId}" does not match configured terminal "${config.terminalId}".`,
    );
  }

  if (currency !== config.currency) {
    throw new BadRequestHttpError(`Currency "${currency}" does not match terminal currency "${config.currency}".`);
  }

  let cashoutAmount: number | undefined;
  let tipAmount: number | undefined;
  let surchargeAmount: number | undefined;

  if (input.cashoutAmount !== undefined) {
    cashoutAmount = requirePositiveAmount(input.cashoutAmount, 'cashoutAmount');
  }
  if (input.tipAmount !== undefined) {
    tipAmount = requirePositiveAmount(input.tipAmount, 'tipAmount');
  }
  if (input.surchargeAmount !== undefined) {
    surchargeAmount = requirePositiveAmount(input.surchargeAmount, 'surchargeAmount');
  }

  const transactionId = generateTransactionId();
  const totalAmount = Math.round(
    (amount + (cashoutAmount ?? 0) + (tipAmount ?? 0) + (surchargeAmount ?? 0)) * 100,
  ) / 100;

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'PaymentTransaction',
    [LD_ID]: `urn:databox:eftpos:${transactionId}`,
    terminalId,
    provider: config.provider,
    transactionType: input.transactionType,
    amount,
    currency,
    totalAmount,
  };

  if (input.reference) {
    record.reference = input.reference;
  }
  if (input.receiptNumber) {
    record.receiptNumber = input.receiptNumber;
  }
  if (input.operatorId) {
    record.operatorId = input.operatorId;
  }
  if (cashoutAmount !== undefined) {
    record.cashoutAmount = cashoutAmount;
  }
  if (tipAmount !== undefined) {
    record.tipAmount = tipAmount;
  }
  if (surchargeAmount !== undefined) {
    record.surchargeAmount = surchargeAmount;
  }

  // The actual terminal communication is delegated to the native edge driver.
  // This function produces the validated request that the driver will execute.
  record.dispatchTo = `eftpos://${config.provider}/${config.protocol}`;
  record.terminalEndpoint = config.endpoint ?? 'auto-discover';

  return {
    terminalId,
    transactionId,
    status: 'PENDING',
    amount,
    cashoutAmount,
    tipAmount,
    surchargeAmount,
    record,
  };
}

/**
 * Process an EFTPOS settlement (end-of-day reconciliation).
 */
export function processEftposSettlement(
  terminalId: string,
  config: EftposTerminalConfig,
): EftposSettlementResult {
  const tid = requireNonEmpty(terminalId, 'terminalId');
  if (tid !== config.terminalId) {
    throw new BadRequestHttpError(`Terminal ID "${tid}" does not match configured terminal.`);
  }

  const settlementId = `eftpos-settlement-${Date.now()}`;
  const settledAt = new Date().toISOString();

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'SettlementReport',
    [LD_ID]: `urn:databox:eftpos:${settlementId}`,
    terminalId: tid,
    provider: config.provider,
    settledAt,
  };

  return {
    terminalId: tid,
    settlementId,
    status: 'PENDING',
    totalTransactions: 0,
    totalAmount: 0,
    settledAt,
    record,
  };
}

/**
 * Query terminal status.
 */
export function queryTerminalStatus(
  terminalId: string,
  config: EftposTerminalConfig,
): EftposTerminalStatus {
  const tid = requireNonEmpty(terminalId, 'terminalId');
  if (tid !== config.terminalId) {
    throw new BadRequestHttpError(`Terminal ID "${tid}" does not match configured terminal.`);
  }

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'ServiceStatus',
    terminalId: tid,
    provider: config.provider,
    protocol: config.protocol,
  };

  return {
    terminalId: tid,
    online: true,
    available: true,
    record,
  };
}
