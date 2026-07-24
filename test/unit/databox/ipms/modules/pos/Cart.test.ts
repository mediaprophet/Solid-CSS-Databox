import { buildCartRecord, summarizeCart } from '../../../../../../src/databox/ipms/modules/pos/Cart';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

const lines = [
  {
    lineId: 'line-1',
    product: 'https://example.org/products/coffee',
    sku: 'COFFEE',
    name: 'Coffee',
    quantity: 2,
    unitPrice: 4.5,
  },
  {
    lineId: 'line-2',
    product: 'https://example.org/products/muffin',
    name: 'Muffin',
    quantity: 1,
    unitPrice: 6,
    lineDiscount: 1,
  },
];

describe('summarizeCart', (): void => {
  it('normalizes cart lines and computes totals.', (): void => {
    const summary = summarizeCart({
      id: 'https://example.org/carts/1',
      state: 'active',
      currency: 'aud',
      updatedAt: '2026-07-19T11:00:00.000Z',
      lines,
    });

    expect(summary.state).toBe('active');
    expect(summary.currency).toBe('AUD');
    expect(summary.itemCount).toBe(3);
    expect(summary.subtotal).toBe(15);
    expect(summary.discountTotal).toBe(1);
    expect(summary.total).toBe(14);
    expect(summary.lines[1]).toMatchObject({
      lineId: 'line-2',
      lineDiscount: 1,
      lineSubtotal: 5,
    });
  });

  it('rejects invalid line shapes.', (): void => {
    expect((): unknown => summarizeCart({
      id: 'https://example.org/carts/1',
      state: 'active',
      currency: 'AUD',
      updatedAt: '2026-07-19T11:00:00.000Z',
      lines: [],
    })).toThrow('at least one line');
    expect((): unknown => summarizeCart({
      id: 'https://example.org/carts/1',
      state: 'active',
      currency: 'AUD',
      updatedAt: '2026-07-19T11:00:00.000Z',
      lines: [{ ...lines[0], quantity: 0 }],
    })).toThrow('quantity must be a positive integer');
    expect((): unknown => summarizeCart({
      id: 'https://example.org/carts/1',
      state: 'active',
      currency: 'AUD',
      updatedAt: '2026-07-19T11:00:00.000Z',
      lines: [{ ...lines[0], lineDiscount: 99 }],
    })).toThrow('lineDiscount must not exceed');
  });
});

describe('buildCartRecord', (): void => {
  it('builds a portable schema.org cart item list.', (): void => {
    const result = buildCartRecord({
      id: 'https://example.org/carts/1',
      state: 'held',
      currency: 'AUD',
      updatedAt: '2026-07-19T11:00:00.000Z',
      customer: 'https://example.org/people/alice',
      promotionIds: [ 'https://example.org/promotions/lunch' ],
      lines,
    });

    expect(result.record['@context']).toEqual({ '@vocab': 'https://schema.org/' });
    expect(result.record['@type']).toBe('ItemList');
    expect(result.record['@id']).toBe('https://example.org/carts/1');
    expect(result.record.numberOfItems).toBe(3);
    expect(result.record.dateModified).toBe('2026-07-19T11:00:00.000Z');

    const customer = record(result.record.customer);
    expect(customer['@id']).toBe('https://example.org/people/alice');

    const elements = result.record.itemListElement as Record<string, unknown>[];
    expect(elements).toHaveLength(2);
    expect(elements[0].position).toBe(1);
    const offer = record(elements[0].item);
    expect(offer['@type']).toBe('Offer');
    expect(offer.price).toBe('4.50');
    expect(offer.priceCurrency).toBe('AUD');
  });

  it('rejects invalid record metadata.', (): void => {
    expect((): unknown => buildCartRecord({
      id: 'not-a-uri',
      state: 'active',
      currency: 'AUD',
      updatedAt: '2026-07-19T11:00:00.000Z',
      lines: [ lines[0] ],
    })).toThrow('id must be an absolute URI');
    expect((): unknown => buildCartRecord({
      id: 'https://example.org/carts/1',
      state: 'active',
      currency: 'AU',
      updatedAt: '2026-07-19T11:00:00.000Z',
      lines: [ lines[0] ],
    })).toThrow('currency must be a three-letter ISO 4217 code');
    expect((): unknown => buildCartRecord({
      id: 'https://example.org/carts/1',
      state: 'active',
      currency: 'AUD',
      updatedAt: 'not-a-date',
      lines: [ lines[0] ],
    })).toThrow('updatedAt must be a valid date');
  });
});
