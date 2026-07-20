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
  requireOptionalUri,
  requirePositiveInteger,
  requireUri,
  round2,
} from './PosValidation';

export type CartState = 'active' | 'held' | 'submitted' | 'abandoned';

export interface CartLineInput {
  readonly lineId: string;
  readonly product: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly sku?: string;
  readonly lineDiscount?: number;
}

export interface CartInput {
  readonly id: string;
  readonly state: CartState;
  readonly currency: string;
  readonly updatedAt: string;
  readonly lines: readonly CartLineInput[];
  readonly customer?: string;
  readonly promotionIds?: readonly string[];
}

export interface CartLine {
  readonly lineId: string;
  readonly product: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly sku?: string;
  readonly lineDiscount: number;
  readonly lineSubtotal: number;
}

export interface CartSummary {
  readonly state: CartState;
  readonly currency: string;
  readonly itemCount: number;
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly total: number;
  readonly lines: readonly CartLine[];
}

export interface CartRecordResult extends CartSummary {
  readonly record: Record<string, unknown>;
}

const CART_STATES: ReadonlySet<CartState> = new Set([ 'active', 'held', 'submitted', 'abandoned' ]);

function requireCartState(state: CartState): CartState {
  if (!CART_STATES.has(state)) {
    throw new BadRequestHttpError('A POS cart state must be active, held, submitted, or abandoned.');
  }
  return state;
}

function normalizeLine(line: CartLineInput): CartLine {
  const lineId = requireNonEmpty(line.lineId, 'POS cart line', 'lineId');
  const product = requireUri(line.product, 'POS cart line', 'product');
  const name = requireNonEmpty(line.name, 'POS cart line', 'name');
  const quantity = requirePositiveInteger(line.quantity, 'POS cart line', 'quantity');
  const unitPrice = requireNonNegativeFinite(line.unitPrice, 'POS cart line', 'unitPrice');
  const lineDiscount = requireNonNegativeFinite(line.lineDiscount ?? 0, 'POS cart line', 'lineDiscount');
  const gross = round2(quantity * unitPrice);

  if (lineDiscount > gross) {
    throw new BadRequestHttpError('A POS cart line lineDiscount must not exceed the line gross amount.');
  }

  const sku = line.sku === undefined ? undefined : requireNonEmpty(line.sku, 'POS cart line', 'sku');

  return {
    lineId,
    product,
    name,
    quantity,
    unitPrice: round2(unitPrice),
    ...sku === undefined ? {} : { sku },
    lineDiscount: round2(lineDiscount),
    lineSubtotal: round2(gross - lineDiscount),
  };
}

export function summarizeCart(input: CartInput): CartSummary {
  const state = requireCartState(input.state);
  const currency = requireCurrency(input.currency, 'POS cart');
  requireDate(input.updatedAt, 'POS cart', 'updatedAt');

  if (input.lines.length === 0) {
    throw new BadRequestHttpError('A POS cart needs at least one line.');
  }

  const lines = input.lines.map(normalizeLine);
  const itemCount = lines.reduce((sum, line): number => sum + line.quantity, 0);
  const subtotal = round2(lines.reduce((sum, line): number => sum + (line.quantity * line.unitPrice), 0));
  const discountTotal = round2(lines.reduce((sum, line): number => sum + line.lineDiscount, 0));
  const total = round2(lines.reduce((sum, line): number => sum + line.lineSubtotal, 0));

  return { state, currency, itemCount, subtotal, discountTotal, total, lines };
}

export function buildCartRecord(input: CartInput): CartRecordResult {
  const id = requireUri(input.id, 'POS cart', 'id');
  const customer = requireOptionalUri(input.customer, 'POS cart', 'customer');
  const updatedAt = requireDate(input.updatedAt, 'POS cart', 'updatedAt');
  const promotionIds = (input.promotionIds ?? []).map((promotionId): string =>
    requireUri(promotionId, 'POS cart', 'promotionId'));
  const summary = summarizeCart(input);

  return {
    ...summary,
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'ItemList',
      [LD_ID]: id,
      name: 'POS cart',
      dateModified: updatedAt,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: summary.itemCount,
      itemListElement: summary.lines.map((line, index): Record<string, unknown> => ({
        [LD_TYPE]: 'ListItem',
        position: index + 1,
        identifier: line.lineId,
        item: {
          [LD_TYPE]: 'Offer',
          itemOffered: {
            [LD_TYPE]: 'Product',
            [LD_ID]: line.product,
            name: line.name,
            ...line.sku === undefined ? {} : { sku: line.sku },
          },
          price: money(line.unitPrice),
          priceCurrency: summary.currency,
          eligibleQuantity: { [LD_TYPE]: 'QuantitativeValue', value: line.quantity },
          totalPrice: money(line.lineSubtotal),
        },
      })),
      ...customer === undefined ? {} : { customer: { [LD_ID]: customer }},
      additionalProperty: [
        { [LD_TYPE]: 'PropertyValue', name: 'cartState', value: summary.state },
        { [LD_TYPE]: 'PropertyValue', name: 'subtotal', value: money(summary.subtotal) },
        { [LD_TYPE]: 'PropertyValue', name: 'discountTotal', value: money(summary.discountTotal) },
        { [LD_TYPE]: 'PropertyValue', name: 'total', value: money(summary.total) },
        ...promotionIds.map((promotionId): Record<string, unknown> => ({
          [LD_TYPE]: 'PropertyValue',
          name: 'appliedPromotion',
          value: promotionId,
        })),
      ],
    },
  };
}
