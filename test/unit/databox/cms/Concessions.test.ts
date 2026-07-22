import {
  applyConcessionPricing,
  buildConcessionRecord,
  evaluateConcessionEligibility,
} from '../../../../src/databox/cms/modules/concessions/Concessions';

describe('Concessions module', () => {
  describe('evaluateConcessionEligibility', () => {
    it('returns verified=true when credentialId is provided', () => {
      const result = evaluateConcessionEligibility({
        customerId: 'cust-001',
        credentialId: 'vc-001',
        requestedGroupIds: [ 'pensioner' ],
      });
      expect(result.verified).toBe(true);
      expect(result.eligibleGroups).toHaveLength(1);
    });

    it('returns verified=false without credentialId', () => {
      const result = evaluateConcessionEligibility({
        customerId: 'cust-001',
        requestedGroupIds: [ 'student' ],
      });
      expect(result.verified).toBe(false);
    });

    it('returns empty groups for empty request', () => {
      const result = evaluateConcessionEligibility({
        customerId: 'cust-001',
        requestedGroupIds: [],
      });
      expect(result.eligibleGroups).toHaveLength(0);
    });
  });

  describe('applyConcessionPricing', () => {
    it('applies percentage discount to line items', () => {
      const result = applyConcessionPricing({
        groupId: 'pensioner',
        discountPercent: 20,
        lineItems: [
          { productId: 'p1', name: 'Meal', originalPrice: 50 },
          { productId: 'p2', name: 'Drink', originalPrice: 10 },
        ],
      });
      expect(result.totalOriginal).toBe(60);
      expect(result.totalDiscount).toBe(12);
      expect(result.totalFinal).toBe(48);
      expect(result.lines[0].discountAmount).toBe(10);
    });

    it('throws on empty line items', () => {
      expect(() => applyConcessionPricing({
        groupId: 'pensioner',
        discountPercent: 20,
        lineItems: [],
      })).toThrow('at least one line item');
    });

    it('throws on invalid discount percent', () => {
      expect(() => applyConcessionPricing({
        groupId: 'pensioner',
        discountPercent: 150,
        lineItems: [{ productId: 'p1', name: 'Meal', originalPrice: 50 }],
      })).toThrow('between 0 and 100');
    });
  });

  describe('buildConcessionRecord', () => {
    it('builds a JSON-LD concession record', () => {
      const result = buildConcessionRecord({
        id: 'https://example.org/concessions/001',
        customer: 'https://example.org/members/alice',
        groupId: 'pensioner',
        groupName: 'Pensioner Concession',
        currency: 'AUD',
        appliedAt: '2025-01-15',
        lines: [
          { productId: 'p1', name: 'Meal', originalPrice: 50, discountAmount: 10, finalPrice: 40 },
        ],
      });
      expect(result.record['@type']).toBe('Order');
      expect(result.record['@id']).toBe('https://example.org/concessions/001');
    });
  });
});
