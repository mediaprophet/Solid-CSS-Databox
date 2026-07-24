import { applyDiscount, buildDiscountRecord } from '../../../../../../src/databox/ipms/modules/pos/Discount';
import { BadRequestHttpError } from '../../../../../../src/util/errors/BadRequestHttpError';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('applyDiscount', (): void => {
  it('applies a percent discount to the subtotal.', (): void => {
    const result = applyDiscount({ subtotal: 200, type: 'percent', value: 10 });
    expect(result).toStrictEqual({ discount: 20, total: 180 });
  });

  it('applies a fixed discount to the subtotal.', (): void => {
    const result = applyDiscount({ subtotal: 200, type: 'fixed', value: 30 });
    expect(result).toStrictEqual({ discount: 30, total: 170 });
  });

  it('rounds calculated discounts and totals to two decimals.', (): void => {
    const result = applyDiscount({ subtotal: 10, type: 'percent', value: 33.333 });
    expect(result).toStrictEqual({ discount: 3.33, total: 6.67 });
  });

  it('throws when subtotal is not greater than 0.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 0, type: 'percent', value: 10 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when subtotal is not finite.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: Number.POSITIVE_INFINITY, type: 'percent', value: 10 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a percent discount value is below 0.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'percent', value: -1 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a percent discount value is above 100.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'percent', value: 101 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a fixed discount value is below 0.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'fixed', value: -1 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a fixed discount value is greater than the subtotal.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'fixed', value: 101 });
    }).toThrow(BadRequestHttpError);
  });
});

describe('buildDiscountRecord', (): void => {
  it('builds an auditable schema.org Order for a POS discount.', (): void => {
    const result = buildDiscountRecord({
      id: 'https://example.org/discounts/1',
      order: 'https://example.org/orders/checkout-1',
      subtotal: 50,
      type: 'percent',
      value: 10,
      currency: 'aud',
      appliedAt: '2026-07-19T09:30:00.000Z',
      code: 'WELCOME10',
    });

    expect(result.discount).toBe(5);
    expect(result.total).toBe(45);
    expect(result.record['@context']).toBe('https://schema.org/');
    expect(result.record['@type']).toBe('Order');
    expect(result.record['@id']).toBe('https://example.org/discounts/1');
    expect(result.record.orderNumber).toBe('https://example.org/orders/checkout-1');
    expect(result.record.discount).toBe(5);
    expect(result.record.discountCurrency).toBe('AUD');
    expect(result.record.discountCode).toBe('WELCOME10');
    expect(result.record.orderDate).toBe('2026-07-19T09:30:00.000Z');

    const priceSpecification = record(result.record.priceSpecification);
    expect(priceSpecification['@type']).toBe('PriceSpecification');
    expect(priceSpecification.price).toBe(50);
    expect(priceSpecification.priceCurrency).toBe('AUD');

    const totalPaymentDue = record(result.record.totalPaymentDue);
    expect(totalPaymentDue['@type']).toBe('PriceSpecification');
    expect(totalPaymentDue.price).toBe(45);
    expect(totalPaymentDue.priceCurrency).toBe('AUD');
  });

  it('omits discountCode when no code is supplied.', (): void => {
    const result = buildDiscountRecord({
      id: 'https://example.org/discounts/1',
      order: 'https://example.org/orders/checkout-1',
      subtotal: 50,
      type: 'fixed',
      value: 5,
      currency: 'AUD',
      appliedAt: '2026-07-19T09:30:00.000Z',
    });

    expect(result.record.discountCode).toBeUndefined();
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildDiscountRecord({
      id: 'not-a-uri',
      order: 'https://example.org/orders/checkout-1',
      subtotal: 50,
      type: 'fixed',
      value: 5,
      currency: 'AUD',
      appliedAt: '2026-07-19T09:30:00.000Z',
    })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI order.', (): void => {
    expect((): unknown => buildDiscountRecord({
      id: 'https://example.org/discounts/1',
      order: 'not-a-uri',
      subtotal: 50,
      type: 'fixed',
      value: 5,
      currency: 'AUD',
      appliedAt: '2026-07-19T09:30:00.000Z',
    })).toThrow('order must be an absolute URI');
  });

  it('rejects an invalid currency.', (): void => {
    expect((): unknown => buildDiscountRecord({
      id: 'https://example.org/discounts/1',
      order: 'https://example.org/orders/checkout-1',
      subtotal: 50,
      type: 'fixed',
      value: 5,
      currency: 'AU',
      appliedAt: '2026-07-19T09:30:00.000Z',
    })).toThrow('currency must be a three-letter ISO 4217 code');
  });

  it('rejects a blank code.', (): void => {
    expect((): unknown => buildDiscountRecord({
      id: 'https://example.org/discounts/1',
      order: 'https://example.org/orders/checkout-1',
      subtotal: 50,
      type: 'fixed',
      value: 5,
      currency: 'AUD',
      appliedAt: '2026-07-19T09:30:00.000Z',
      code: '  ',
    })).toThrow('code must not be empty');
  });

  it('rejects an invalid appliedAt date.', (): void => {
    expect((): unknown => buildDiscountRecord({
      id: 'https://example.org/discounts/1',
      order: 'https://example.org/orders/checkout-1',
      subtotal: 50,
      type: 'fixed',
      value: 5,
      currency: 'AUD',
      appliedAt: 'not-a-date',
    })).toThrow('appliedAt must be a valid date');
  });
});
