import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface StockInput {
  readonly onHand: number;
  readonly reserved: number;
  readonly requested: number;
}

export interface StockResult {
  readonly available: number;
  readonly fulfillable: boolean;
  readonly shortfall: number;
}

export interface StockRecordInput extends StockInput {
  readonly id: string;
  readonly product: string;
  readonly sku: string;
  readonly checkedAt: string;
}

export interface StockRecordResult extends StockResult {
  readonly record: Record<string, unknown>;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A stock record ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A stock record ${field} must not be empty.`);
  }
  return trimmed;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new BadRequestHttpError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestHttpError(`${field} must be a positive integer.`);
  }
  return value;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A stock record ${field} must be a valid date.`);
  }
  return value;
}

/**
 * Determine whether a requested quantity can be fulfilled from on-hand stock net of reservations.
 * Pure and deterministic.
 */
export function checkStock(input: StockInput): StockResult {
  const onHand = requireNonNegativeInteger(input.onHand, 'Stock on hand');
  const reserved = requireNonNegativeInteger(input.reserved, 'Reserved stock');
  const requested = requirePositiveInteger(input.requested, 'Requested quantity');

  if (reserved > onHand) {
    throw new BadRequestHttpError('Reserved stock must not exceed stock on hand.');
  }

  const available = onHand - reserved;
  const fulfillable = requested <= available;
  const shortfall = fulfillable ? 0 : requested - available;

  return { available, fulfillable, shortfall };
}

/**
 * Build an auditable schema.org `Product` stock snapshot, retaining the pure fulfillment
 * calculation alongside the quantities that produced it.
 */
export function buildStockRecord(input: StockRecordInput): StockRecordResult {
  const id = requireUri(input.id, 'id');
  const product = requireUri(input.product, 'product');
  const sku = requireNonEmpty(input.sku, 'sku');
  const checkedAt = requireDate(input.checkedAt, 'checkedAt');
  const result = checkStock(input);

  return {
    ...result,
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'Product',
      [LD_ID]: id,
      sku,
      sameAs: product,
      inventoryLevel: {
        [LD_TYPE]: 'QuantitativeValue',
        value: result.available,
      },
      additionalProperty: [
        { [LD_TYPE]: 'PropertyValue', name: 'onHand', value: input.onHand },
        { [LD_TYPE]: 'PropertyValue', name: 'reserved', value: input.reserved },
        { [LD_TYPE]: 'PropertyValue', name: 'requested', value: input.requested },
        { [LD_TYPE]: 'PropertyValue', name: 'fulfillable', value: result.fulfillable },
        { [LD_TYPE]: 'PropertyValue', name: 'shortfall', value: result.shortfall },
        { [LD_TYPE]: 'PropertyValue', name: 'checkedAt', value: checkedAt },
      ],
    },
  };
}
