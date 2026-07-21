import { applyDiscount, buildDiscountRecord, type DiscountCode } from '../../../../src/databox/cms/modules/discounts/Discounts';

describe('Discounts module', () => {
  const validDiscount: DiscountCode = {
    id: 'd1',
    code: 'SAVE10',
    type: 'percentage',
    value: 10,
    usageCount: 0,
    validFrom: '2025-01-01',
    validUntil: '2027-12-31',
    stackable: false,
  };

  describe('applyDiscount', () => {
    it('applies a percentage discount', () => {
      const result = applyDiscount(validDiscount, {
        code: 'SAVE10',
        subtotal: 100,
        lineItems: [
          { productId: 'p1', name: 'Item', category: 'food', quantity: 1, unitPrice: 100 },
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(10);
      expect(result.totalFinal).toBe(90);
    });

    it('rejects expired discount', () => {
      const expired: DiscountCode = { ...validDiscount, validUntil: '2020-01-01' };
      const result = applyDiscount(expired, {
        code: 'SAVE10',
        subtotal: 100,
        lineItems: [{ productId: 'p1', name: 'Item', category: 'food', quantity: 1, unitPrice: 100 }],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('rejects wrong code', () => {
      const result = applyDiscount(validDiscount, {
        code: 'WRONG',
        subtotal: 100,
        lineItems: [{ productId: 'p1', name: 'Item', category: 'food', quantity: 1, unitPrice: 100 }],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not match');
    });

    it('rejects when usage limit reached', () => {
      const exhausted: DiscountCode = { ...validDiscount, usageLimit: 5, usageCount: 5 };
      const result = applyDiscount(exhausted, {
        code: 'SAVE10',
        subtotal: 100,
        lineItems: [{ productId: 'p1', name: 'Item', category: 'food', quantity: 1, unitPrice: 100 }],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('usage limit');
    });

    it('applies fixed discount capped at line total', () => {
      const fixed: DiscountCode = { ...validDiscount, type: 'fixed', value: 50 };
      const result = applyDiscount(fixed, {
        code: 'SAVE10',
        subtotal: 30,
        lineItems: [{ productId: 'p1', name: 'Item', category: 'food', quantity: 1, unitPrice: 30 }],
      });
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(30);
    });

    it('applies quantity discount for bulk purchases', () => {
      const bulk: DiscountCode = { ...validDiscount, type: 'quantity', value: 5 };
      const result = applyDiscount(bulk, {
        code: 'SAVE10',
        subtotal: 500,
        lineItems: [{ productId: 'p1', name: 'Item', category: 'food', quantity: 10, unitPrice: 50 }],
      });
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(50);
    });

    it('respects minSpend requirement', () => {
      const withMin: DiscountCode = { ...validDiscount, minSpend: 200 };
      const result = applyDiscount(withMin, {
        code: 'SAVE10',
        subtotal: 100,
        lineItems: [{ productId: 'p1', name: 'Item', category: 'food', quantity: 1, unitPrice: 100 }],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Minimum spend');
    });

    it('respects category restrictions', () => {
      const restricted: DiscountCode = { ...validDiscount, applicableCategories: ['electronics'] };
      const result = applyDiscount(restricted, {
        code: 'SAVE10',
        subtotal: 100,
        lineItems: [{ productId: 'p1', name: 'Item', category: 'food', quantity: 1, unitPrice: 100 }],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No items match');
    });
  });

  describe('buildDiscountRecord', () => {
    it('builds a JSON-LD discount record', () => {
      const result = buildDiscountRecord({
        id: 'https://example.org/discounts/001',
        organisation: 'https://example.org/org',
        code: 'SAVE10',
        currency: 'AUD',
        appliedAt: '2025-01-15',
        result: {
          code: 'SAVE10',
          type: 'percentage',
          valid: true,
          discountAmount: 10,
          lines: [],
          totalOriginal: 100,
          totalDiscount: 10,
          totalFinal: 90,
        },
      });
      expect(result.record['@type']).toBe('Order');
      expect(result.record.discountCode).toBe('SAVE10');
    });
  });
});
