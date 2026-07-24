import {
  buildPromotionDescriptor,
  evaluatePromotionEligibility,
} from '../../../../../../src/databox/ipms/modules/pos/Promotion';

const promotion = {
  id: 'https://example.org/promotions/lunch',
  name: 'Lunch special',
  benefit: 'percent' as const,
  value: 10,
  currency: 'AUD',
  startsAt: '2026-07-19T00:00:00.000Z',
  endsAt: '2026-07-19T23:59:59.000Z',
  requiredCode: 'LUNCH10',
  minSubtotal: 20,
  eligibleSkus: [ 'BOWL', 'COFFEE' ],
  eligibleCustomerSegments: [ 'member' ],
};

describe('evaluatePromotionEligibility', (): void => {
  it('returns an eligible discount amount when all gates pass.', (): void => {
    const result = evaluatePromotionEligibility(promotion, {
      subtotal: 50,
      currency: 'aud',
      skus: [ 'COFFEE' ],
      customerSegments: [ 'member' ],
      code: 'lunch10',
      now: '2026-07-19T12:00:00.000Z',
    });

    expect(result).toStrictEqual({ eligible: true, discountAmount: 5, reasons: []});
  });

  it('collects ineligibility reasons without applying a discount.', (): void => {
    const result = evaluatePromotionEligibility(promotion, {
      subtotal: 10,
      currency: 'NZD',
      skus: [ 'TEA' ],
      customerSegments: [ 'guest' ],
      now: '2026-07-20T12:00:00.000Z',
    });

    expect(result.eligible).toBe(false);
    expect(result.discountAmount).toBe(0);
    expect(result.reasons).toEqual([
      'expired',
      'currency-mismatch',
      'subtotal-too-low',
      'code-required',
      'sku-not-eligible',
      'customer-segment-not-eligible',
    ]);
  });

  it('caps fixed discounts at the subtotal and allows message-only promotions.', (): void => {
    expect(evaluatePromotionEligibility({
      id: 'https://example.org/promotions/fixed',
      name: 'Five off',
      benefit: 'fixed',
      value: 50,
      currency: 'AUD',
    }, {
      subtotal: 20,
      currency: 'AUD',
      skus: [],
      now: '2026-07-19T12:00:00.000Z',
    }).discountAmount).toBe(20);

    expect(evaluatePromotionEligibility({
      id: 'https://example.org/promotions/message',
      name: 'Try the cake',
      benefit: 'messageOnly',
      value: 0,
      currency: 'AUD',
    }, {
      subtotal: 20,
      currency: 'AUD',
      skus: [],
      now: '2026-07-19T12:00:00.000Z',
    }).discountAmount).toBe(0);
  });

  it('rejects invalid promotion metadata.', (): void => {
    expect((): unknown => evaluatePromotionEligibility({
      ...promotion,
      id: 'not-a-uri',
    }, {
      subtotal: 50,
      currency: 'AUD',
      skus: [],
      now: '2026-07-19T12:00:00.000Z',
    })).toThrow('id must be an absolute URI');
    expect((): unknown => evaluatePromotionEligibility({
      ...promotion,
      value: 101,
    }, {
      subtotal: 50,
      currency: 'AUD',
      skus: [ 'COFFEE' ],
      customerSegments: [ 'member' ],
      code: 'LUNCH10',
      now: '2026-07-19T12:00:00.000Z',
    })).toThrow('percent value must be between 0 and 100');
  });
});

describe('buildPromotionDescriptor', (): void => {
  it('builds a schema.org offer descriptor with eligibility detail.', (): void => {
    const result = buildPromotionDescriptor(promotion, {
      subtotal: 50,
      currency: 'AUD',
      skus: [ 'COFFEE' ],
      customerSegments: [ 'member' ],
      code: 'LUNCH10',
      now: '2026-07-19T12:00:00.000Z',
    });

    expect(result.eligibility.eligible).toBe(true);
    expect(result.record['@context']).toBe('https://schema.org/');
    expect(result.record['@type']).toBe('Offer');
    expect(result.record['@id']).toBe('https://example.org/promotions/lunch');
    expect(result.record.validFrom).toBe('2026-07-19T00:00:00.000Z');
    expect(result.record.validThrough).toBe('2026-07-19T23:59:59.000Z');

    const additional = result.record.additionalProperty as Record<string, unknown>[];
    expect(additional).toContainEqual({ '@type': 'PropertyValue', name: 'benefit', value: 'percent' });
    expect(additional).toContainEqual({ '@type': 'PropertyValue', name: 'eligibleSku', value: 'COFFEE' });
    expect(additional).toContainEqual({ '@type': 'PropertyValue', name: 'eligibleCustomerSegment', value: 'member' });
  });
});
