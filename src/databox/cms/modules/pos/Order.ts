import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { applyDiscount } from './Discount';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export type PosOrderStatus = 'draft' | 'held' | 'submitted' | 'paid' | 'voided';
export type PosPromotionType = 'percent' | 'fixed';

export interface PosCartLineInput {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxRate?: number;
  readonly modifiers?: readonly string[];
}

export interface PosPromotionRule {
  readonly id: string;
  readonly label: string;
  readonly type: PosPromotionType;
  readonly value: number;
  readonly minSubtotal?: number;
  readonly eligibleSkus?: readonly string[];
}

export interface PosOrderInput {
  readonly id: string;
  readonly tableId?: string;
  readonly waiterWebId?: string;
  readonly customerWebId?: string;
  readonly status: PosOrderStatus;
  readonly currency: string;
  readonly createdAt: string;
  readonly lines: readonly PosCartLineInput[];
  readonly promotions?: readonly PosPromotionRule[];
  readonly payment?: {
    readonly status: 'not-started' | 'authorized' | 'paid' | 'failed';
    readonly paymentId?: string;
  };
  readonly receiptUrl?: string;
}

export interface PosCartLine extends PosCartLineInput {
  readonly lineSubtotal: number;
  readonly tax: number;
  readonly total: number;
}

export interface AppliedPosPromotion {
  readonly id: string;
  readonly label: string;
  readonly discount: number;
}

export interface PosOrder {
  readonly [LD_CONTEXT]: Record<string, string>;
  readonly [LD_TYPE]: 'Order';
  readonly id: string;
  readonly status: PosOrderStatus;
  readonly tableId?: string;
  readonly waiterWebId?: string;
  readonly customerWebId?: string;
  readonly currency: string;
  readonly createdAt: string;
  readonly lines: readonly PosCartLine[];
  readonly subtotal: number;
  readonly tax: number;
  readonly discount: number;
  readonly total: number;
  readonly promotions: readonly AppliedPosPromotion[];
  readonly payment: {
    readonly status: 'not-started' | 'authorized' | 'paid' | 'failed';
    readonly paymentId?: string;
  };
  readonly receiptUrl?: string;
  readonly receiptHandoff?: {
    readonly kind: 'pod-rdf-receipt';
    readonly url: string;
  };
}

export interface CustomerTransactionDisplay {
  readonly orderId: string;
  readonly status: PosOrderStatus;
  readonly tableId?: string;
  readonly currency: string;
  readonly lines: readonly {
    readonly name: string;
    readonly quantity: number;
    readonly amount: number;
  }[];
  readonly subtotal: number;
  readonly tax: number;
  readonly discount: number;
  readonly total: number;
  readonly paymentStatus: PosOrder['payment']['status'];
  readonly receiptUrl?: string;
  readonly callsToAction: {
    readonly appInstallUrl?: string;
    readonly solidVaultConnectUrl?: string;
  };
}

export function buildPosOrder(input: PosOrderInput): PosOrder {
  const id = requireToken(input.id, 'id');
  const currency = requireCurrency(input.currency);
  const createdAt = requireDate(input.createdAt, 'createdAt');
  const waiterWebId = optionalUri(input.waiterWebId, 'waiterWebId');
  const customerWebId = optionalUri(input.customerWebId, 'customerWebId');
  const receiptUrl = optionalUri(input.receiptUrl, 'receiptUrl');
  const lines = input.lines.map(validateLine);
  if (lines.length === 0) {
    throw new BadRequestHttpError('A POS order needs at least one cart line.');
  }

  const subtotal = round2(lines.reduce((sum, line): number => sum + line.lineSubtotal, 0));
  const tax = round2(lines.reduce((sum, line): number => sum + line.tax, 0));
  const promotions = applyPromotions(input.promotions ?? [], lines, subtotal);
  const discount = round2(promotions.reduce((sum, promotion): number => sum + promotion.discount, 0));
  const total = round2(Math.max(0, subtotal + tax - discount));

  return {
    [LD_CONTEXT]: {
      schema: 'https://schema.org/',
      cms: 'urn:solid-server:databox:cms#',
      pos: 'urn:solid-server:databox:cms:pos#',
    },
    [LD_TYPE]: 'Order',
    id,
    status: requireStatus(input.status),
    ...input.tableId === undefined ? {} : { tableId: requireToken(input.tableId, 'tableId') },
    ...waiterWebId === undefined ? {} : { waiterWebId },
    ...customerWebId === undefined ? {} : { customerWebId },
    currency,
    createdAt,
    lines,
    subtotal,
    tax,
    discount,
    total,
    promotions,
    payment: {
      status: input.payment?.status ?? 'not-started',
      ...input.payment?.paymentId === undefined ?
          {} :
          { paymentId: requireToken(input.payment.paymentId, 'paymentId') },
    },
    ...receiptUrl === undefined ?
        {} :
        {
          receiptUrl,
          receiptHandoff: {
            kind: 'pod-rdf-receipt',
            url: receiptUrl,
          },
        },
  };
}

export function buildCustomerTransactionDisplay(
  order: PosOrder,
  callsToAction: CustomerTransactionDisplay['callsToAction'] = {},
): CustomerTransactionDisplay {
  const appInstallUrl = optionalUri(callsToAction.appInstallUrl, 'appInstallUrl');
  const solidVaultConnectUrl = optionalUri(callsToAction.solidVaultConnectUrl, 'solidVaultConnectUrl');
  return {
    orderId: order.id,
    status: order.status,
    ...order.tableId === undefined ? {} : { tableId: order.tableId },
    currency: order.currency,
    lines: order.lines.map((line): CustomerTransactionDisplay['lines'][number] => ({
      name: line.name,
      quantity: line.quantity,
      amount: line.total,
    })),
    subtotal: order.subtotal,
    tax: order.tax,
    discount: order.discount,
    total: order.total,
    paymentStatus: order.payment.status,
    ...order.receiptUrl === undefined ? {} : { receiptUrl: order.receiptUrl },
    callsToAction: {
      ...appInstallUrl === undefined ? {} : { appInstallUrl },
      ...solidVaultConnectUrl === undefined ? {} : { solidVaultConnectUrl },
    },
  };
}

function validateLine(line: PosCartLineInput): PosCartLine {
  const sku = requireToken(line.sku, 'line sku');
  const name = requireText(line.name, 'line name');
  const quantity = requirePositive(line.quantity, 'line quantity');
  const unitPrice = requireNonNegative(line.unitPrice, 'line unitPrice');
  const taxRate = line.taxRate === undefined ? 0 : requireNonNegative(line.taxRate, 'line taxRate');
  const lineSubtotal = round2(quantity * unitPrice);
  const tax = round2(lineSubtotal * taxRate / 100);
  return {
    sku,
    name,
    quantity,
    unitPrice,
    taxRate,
    modifiers: line.modifiers ?? [],
    lineSubtotal,
    tax,
    total: round2(lineSubtotal + tax),
  };
}

function applyPromotions(
  rules: readonly PosPromotionRule[],
  lines: readonly PosCartLine[],
  subtotal: number,
): readonly AppliedPosPromotion[] {
  const applied: AppliedPosPromotion[] = [];
  let discountableSubtotal = subtotal;
  for (const rule of rules) {
    const eligibleSubtotal = eligibleSubtotalFor(rule, lines);
    if (rule.minSubtotal !== undefined && subtotal < requireNonNegative(rule.minSubtotal, 'promotion minSubtotal')) {
      continue;
    }
    if (eligibleSubtotal <= 0) {
      continue;
    }
    const base = Math.min(eligibleSubtotal, discountableSubtotal);
    const { discount } = applyDiscount({ subtotal: base, type: rule.type, value: rule.value });
    if (discount > 0) {
      applied.push({
        id: requireToken(rule.id, 'promotion id'),
        label: requireText(rule.label, 'promotion label'),
        discount,
      });
      discountableSubtotal = round2(Math.max(0, discountableSubtotal - discount));
    }
  }
  return applied;
}

function eligibleSubtotalFor(rule: PosPromotionRule, lines: readonly PosCartLine[]): number {
  if (rule.eligibleSkus === undefined || rule.eligibleSkus.length === 0) {
    return round2(lines.reduce((sum, line): number => sum + line.lineSubtotal, 0));
  }
  const eligible = new Set(rule.eligibleSkus.map((sku): string => requireToken(sku, 'promotion eligible sku')));
  return round2(lines
    .filter((line): boolean => eligible.has(line.sku))
    .reduce((sum, line): number => sum + line.lineSubtotal, 0));
}

function requireStatus(status: PosOrderStatus): PosOrderStatus {
  if (!([ 'draft', 'held', 'submitted', 'paid', 'voided' ] as readonly string[]).includes(status)) {
    throw new BadRequestHttpError('A POS order status is invalid.');
  }
  return status;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A POS order currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function requireDate(value: string, field: string): string {
  const parsed = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(parsed.getTime())) {
    throw new BadRequestHttpError(`A POS order ${field} must be a valid date.`);
  }
  return value;
}

function optionalUri(value: string | undefined, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A POS order ${field} must be an absolute URI.`);
  }
}

function requireToken(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^[\w.:-]+$/u.test(trimmed)) {
    throw new BadRequestHttpError(`A POS order ${field} must be a non-empty safe token.`);
  }
  return trimmed;
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A POS order ${field} must not be empty.`);
  }
  return trimmed;
}

function requirePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`A POS order ${field} must be greater than 0.`);
  }
  return value;
}

function requireNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`A POS order ${field} must not be negative.`);
  }
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type PosOrderRecordState =
  'draft' |
  'open' |
  'held' |
  'paymentPending' |
  'paid' |
  'receiptIssued' |
  'fulfilled' |
  'voided';

export interface PosOrderRecordLineInput {
  readonly lineId: string;
  readonly product: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly sku?: string;
  readonly lineDiscount?: number;
}

export interface PosOrderPromotionInput {
  readonly promotion: string;
  readonly name: string;
  readonly amount: number;
}

export interface PosPaymentHandoffInput {
  readonly payment: string;
  readonly provider: string;
  readonly status: 'authorized' | 'captured' | 'failed' | 'refunded';
  readonly amount: number;
  readonly currency: string;
  readonly receipt?: string;
  readonly digitalReceiptUrl?: string;
}

export interface PosOrderRecordInput {
  readonly id: string;
  readonly orderNumber: string;
  readonly state: PosOrderRecordState;
  readonly seller: string;
  readonly customer?: string;
  readonly currency: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly lines: readonly PosOrderRecordLineInput[];
  readonly taxTotal?: number;
  readonly promotions?: readonly PosOrderPromotionInput[];
  readonly paymentHandoff?: PosPaymentHandoffInput;
}

export interface PosOrderRecordResult {
  readonly subtotal: number;
  readonly lineDiscountTotal: number;
  readonly promotionTotal: number;
  readonly taxTotal: number;
  readonly total: number;
  readonly record: Record<string, unknown>;
}

const ORDER_STATE_TRANSITIONS: ReadonlyMap<PosOrderRecordState, readonly PosOrderRecordState[]> = new Map([
  [ 'draft', [ 'open', 'voided' ]],
  [ 'open', [ 'held', 'paymentPending', 'voided' ]],
  [ 'held', [ 'open', 'voided' ]],
  [ 'paymentPending', [ 'open', 'paid', 'voided' ]],
  [ 'paid', [ 'receiptIssued', 'fulfilled' ]],
  [ 'receiptIssued', [ 'fulfilled' ]],
  [ 'fulfilled', []],
  [ 'voided', []],
]);

export function canTransitionOrderState(from: PosOrderRecordState, to: PosOrderRecordState): boolean {
  const checkedFrom = requireOrderRecordState(from);
  const checkedTo = requireOrderRecordState(to);
  return ORDER_STATE_TRANSITIONS.get(checkedFrom)?.includes(checkedTo) ?? false;
}

export function transitionOrderState(from: PosOrderRecordState, to: PosOrderRecordState): PosOrderRecordState {
  if (!canTransitionOrderState(from, to)) {
    throw new BadRequestHttpError(`A POS order cannot transition from ${from} to ${to}.`);
  }
  return to;
}

export function buildOrderRecord(input: PosOrderRecordInput): PosOrderRecordResult {
  const id = requireAbsoluteUri(input.id, 'id');
  const seller = requireAbsoluteUri(input.seller, 'seller');
  const customer = input.customer === undefined ? undefined : requireAbsoluteUri(input.customer, 'customer');
  const orderNumber = requireNonEmptyText(input.orderNumber, 'orderNumber');
  const currency = requireCurrency(input.currency);
  const createdAt = requireDate(input.createdAt, 'createdAt');
  const updatedAt = input.updatedAt === undefined ? undefined : requireDate(input.updatedAt, 'updatedAt');
  const state = requireOrderRecordState(input.state);

  if (input.lines.length === 0) {
    throw new BadRequestHttpError('A POS order needs at least one line.');
  }
  const lines = input.lines.map((line): PosOrderRecordLineInput & {
    readonly product: string;
    readonly lineDiscount: number;
    readonly lineSubtotal: number;
  } => {
    const quantity = requirePositive(line.quantity, 'line quantity');
    const unitPrice = requireNonNegative(line.unitPrice, 'line unitPrice');
    const lineDiscount = requireNonNegative(line.lineDiscount ?? 0, 'lineDiscount');
    const gross = round2(quantity * unitPrice);
    if (lineDiscount > gross) {
      throw new BadRequestHttpError('A POS order lineDiscount must not exceed the line gross amount.');
    }
    return {
      lineId: requireNonEmptyText(line.lineId, 'lineId'),
      product: requireAbsoluteUri(line.product, 'line product'),
      name: requireNonEmptyText(line.name, 'line name'),
      quantity,
      unitPrice: round2(unitPrice),
      ...line.sku === undefined ? {} : { sku: requireNonEmptyText(line.sku, 'line sku') },
      lineDiscount: round2(lineDiscount),
      lineSubtotal: round2(gross - lineDiscount),
    };
  });

  const subtotal = round2(lines.reduce((sum, line): number => sum + (line.quantity * line.unitPrice), 0));
  const lineDiscountTotal = round2(lines.reduce((sum, line): number => sum + line.lineDiscount, 0));
  const promotions = (input.promotions ?? []).map((promotion): PosOrderPromotionInput => ({
    promotion: requireAbsoluteUri(promotion.promotion, 'promotion'),
    name: requireNonEmptyText(promotion.name, 'promotion name'),
    amount: requireNonNegative(promotion.amount, 'promotion amount'),
  }));
  const promotionTotal = round2(promotions.reduce((sum, promotion): number => sum + promotion.amount, 0));
  if (lineDiscountTotal + promotionTotal > subtotal) {
    throw new BadRequestHttpError('A POS order promotion total must not exceed the order subtotal.');
  }
  const taxTotal = round2(requireNonNegative(input.taxTotal ?? 0, 'taxTotal'));
  const total = round2(subtotal - lineDiscountTotal - promotionTotal + taxTotal);
  const paymentHandoff = input.paymentHandoff === undefined ? undefined : validatePaymentHandoff(input.paymentHandoff);

  return {
    subtotal,
    lineDiscountTotal,
    promotionTotal,
    taxTotal,
    total,
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Order',
      id,
      orderNumber,
      orderStatus: schemaOrderStatus(state),
      paymentStatus: schemaPaymentStatus(state, paymentHandoff),
      seller: { [LD_TYPE]: 'Organization', [LD_ID]: seller },
      ...customer === undefined ? {} : { customer: { [LD_TYPE]: 'Person', [LD_ID]: customer }},
      orderDate: createdAt,
      ...updatedAt === undefined ? {} : { dateModified: updatedAt },
      acceptedOffer: lines.map((line): Record<string, unknown> => ({
        [LD_TYPE]: 'Offer',
        identifier: line.lineId,
        itemOffered: {
          [LD_TYPE]: 'Product',
          [LD_ID]: line.product,
          name: line.name,
          ...line.sku === undefined ? {} : { sku: line.sku },
        },
        price: moneyString(line.unitPrice),
        priceCurrency: currency,
        eligibleQuantity: { [LD_TYPE]: 'QuantitativeValue', value: line.quantity },
        totalPrice: moneyString(line.lineSubtotal),
      })),
      priceCurrency: currency,
      totalPaymentDue: {
        [LD_TYPE]: 'PriceSpecification',
        price: moneyString(total),
        priceCurrency: currency,
      },
      ...promotions.length === 0 ?
          {} :
          {
            discount: moneyString(promotionTotal),
            discountCurrency: currency,
          },
      additionalProperty: [
        { [LD_TYPE]: 'PropertyValue', name: 'state', value: state },
        { [LD_TYPE]: 'PropertyValue', name: 'lineDiscountTotal', value: moneyString(lineDiscountTotal) },
        { [LD_TYPE]: 'PropertyValue', name: 'promotionTotal', value: moneyString(promotionTotal) },
        { [LD_TYPE]: 'PropertyValue', name: 'taxTotal', value: moneyString(taxTotal) },
        ...promotions.map((promotion): Record<string, unknown> => ({
          [LD_TYPE]: 'PropertyValue',
          name: promotion.name,
          value: promotion.promotion,
        })),
      ],
      ...paymentHandoff === undefined ? {} : { potentialAction: paymentHandoffAction(paymentHandoff) },
    },
  };
}

function validatePaymentHandoff(input: PosPaymentHandoffInput): PosPaymentHandoffInput {
  return {
    payment: requireAbsoluteUri(input.payment, 'payment'),
    provider: requireNonEmptyText(input.provider, 'payment provider'),
    status: input.status,
    amount: requireNonNegative(input.amount, 'payment amount'),
    currency: requireCurrency(input.currency),
    ...input.receipt === undefined ? {} : { receipt: requireAbsoluteUri(input.receipt, 'receipt') },
    ...input.digitalReceiptUrl === undefined ?
        {} :
        {
          digitalReceiptUrl: requireAbsoluteUri(input.digitalReceiptUrl, 'digitalReceiptUrl'),
        },
  };
}

function paymentHandoffAction(input: PosPaymentHandoffInput): Record<string, unknown> {
  return {
    [LD_TYPE]: 'PayAction',
    [LD_ID]: input.payment,
    instrument: input.provider,
    price: moneyString(input.amount),
    priceCurrency: input.currency,
    result: {
      [LD_TYPE]: 'PaymentChargeSpecification',
      status: input.status,
      ...input.receipt === undefined ? {} : { receipt: input.receipt },
      ...input.digitalReceiptUrl === undefined ? {} : { digitalReceiptUrl: input.digitalReceiptUrl },
    },
  };
}

function requireOrderRecordState(state: PosOrderRecordState): PosOrderRecordState {
  if (!ORDER_STATE_TRANSITIONS.has(state)) {
    throw new BadRequestHttpError('A POS order state is not supported.');
  }
  return state;
}

function schemaOrderStatus(state: PosOrderRecordState): string {
  if (state === 'voided') {
    return 'https://schema.org/OrderCancelled';
  }
  if (state === 'paid' || state === 'receiptIssued' || state === 'fulfilled') {
    return 'https://schema.org/OrderDelivered';
  }
  if (state === 'paymentPending') {
    return 'https://schema.org/OrderPaymentDue';
  }
  return 'https://schema.org/OrderProcessing';
}

function schemaPaymentStatus(
  state: PosOrderRecordState,
  handoff: PosPaymentHandoffInput | undefined,
): string {
  if (handoff?.status === 'captured' || state === 'paid' || state === 'receiptIssued' || state === 'fulfilled') {
    return 'https://schema.org/PaymentComplete';
  }
  if (handoff?.status === 'failed') {
    return 'https://schema.org/PaymentDeclined';
  }
  return 'https://schema.org/PaymentDue';
}

function requireAbsoluteUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A POS order ${field} must be an absolute URI.`);
  }
}

function requireNonEmptyText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A POS order ${field} must not be empty.`);
  }
  return trimmed;
}

function moneyString(value: number): string {
  return round2(value).toFixed(2);
}
