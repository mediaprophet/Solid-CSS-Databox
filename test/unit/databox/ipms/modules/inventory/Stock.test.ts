import { buildStockRecord, checkStock } from '../../../../../../src/databox/ipms/modules/inventory/Stock';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('checkStock', (): void => {
  it('is fulfillable when requested does not exceed available stock.', (): void => {
    const result = checkStock({ onHand: 10, reserved: 2, requested: 5 });
    expect(result).toEqual({ available: 8, fulfillable: true, shortfall: 0 });
  });

  it('reports the correct shortfall when it is not fulfillable.', (): void => {
    const result = checkStock({ onHand: 10, reserved: 2, requested: 9 });
    expect(result).toEqual({ available: 8, fulfillable: false, shortfall: 1 });
  });

  it('rejects invalid quantity shapes.', (): void => {
    expect((): unknown => checkStock({ onHand: -1, reserved: 0, requested: 1 }))
      .toThrow('Stock on hand must be a non-negative integer.');
    expect((): unknown => checkStock({ onHand: 5, reserved: -1, requested: 1 }))
      .toThrow('Reserved stock must be a non-negative integer.');
    expect((): unknown => checkStock({ onHand: 5, reserved: 0, requested: 0 }))
      .toThrow('Requested quantity must be a positive integer.');
    expect((): unknown => checkStock({ onHand: 5.5, reserved: 0, requested: 1 }))
      .toThrow('Stock on hand must be a non-negative integer.');
    expect((): unknown => checkStock({ onHand: 5, reserved: 0, requested: 1.5 }))
      .toThrow('Requested quantity must be a positive integer.');
  });

  it('rejects reserved stock exceeding stock on hand.', (): void => {
    expect((): unknown => checkStock({ onHand: 5, reserved: 6, requested: 1 }))
      .toThrow('Reserved stock must not exceed stock on hand.');
  });
});

describe('buildStockRecord', (): void => {
  it('builds an auditable product stock snapshot.', (): void => {
    const result = buildStockRecord({
      id: 'https://example.org/stock/sku-1',
      product: 'https://example.org/products/sku-1',
      sku: ' SKU-1 ',
      checkedAt: '2026-07-19T10:00:00.000Z',
      onHand: 10,
      reserved: 2,
      requested: 9,
    });

    expect(result.available).toBe(8);
    expect(result.fulfillable).toBe(false);
    expect(result.shortfall).toBe(1);
    expect(result.record['@context']).toBe('https://schema.org/');
    expect(result.record['@type']).toBe('Product');
    expect(result.record['@id']).toBe('https://example.org/stock/sku-1');
    expect(result.record.sku).toBe('SKU-1');
    expect(result.record.sameAs).toBe('https://example.org/products/sku-1');

    const inventoryLevel = record(result.record.inventoryLevel);
    expect(inventoryLevel['@type']).toBe('QuantitativeValue');
    expect(inventoryLevel.value).toBe(8);
  });

  it('rejects invalid record metadata.', (): void => {
    expect((): unknown => buildStockRecord({
      id: 'not-a-uri',
      product: 'https://example.org/products/sku-1',
      sku: 'SKU-1',
      checkedAt: '2026-07-19T10:00:00.000Z',
      onHand: 10,
      reserved: 2,
      requested: 1,
    })).toThrow('id must be an absolute URI');
    expect((): unknown => buildStockRecord({
      id: 'https://example.org/stock/sku-1',
      product: 'not-a-uri',
      sku: 'SKU-1',
      checkedAt: '2026-07-19T10:00:00.000Z',
      onHand: 10,
      reserved: 2,
      requested: 1,
    })).toThrow('product must be an absolute URI');
    expect((): unknown => buildStockRecord({
      id: 'https://example.org/stock/sku-1',
      product: 'https://example.org/products/sku-1',
      sku: '  ',
      checkedAt: '2026-07-19T10:00:00.000Z',
      onHand: 10,
      reserved: 2,
      requested: 1,
    })).toThrow('sku must not be empty');
    expect((): unknown => buildStockRecord({
      id: 'https://example.org/stock/sku-1',
      product: 'https://example.org/products/sku-1',
      sku: 'SKU-1',
      checkedAt: 'not-a-date',
      onHand: 10,
      reserved: 2,
      requested: 1,
    })).toThrow('checkedAt must be a valid date');
  });
});
