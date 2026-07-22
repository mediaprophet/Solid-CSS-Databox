import { buildTaxReport, computeTax } from '../../../../src/databox/cms/modules/tax/Tax';

describe('Tax module', () => {
  describe('computeTax', () => {
    it('computes tax-exclusive line items', () => {
      const result = computeTax({
        jurisdictionCode: 'AU-GST',
        taxInclusive: false,
        lineItems: [
          { productId: 'p1', category: 'food', amount: 100, taxRate: 0.1 },
          { productId: 'p2', category: 'drink', amount: 50, taxRate: 0.1 },
        ],
      });
      expect(result.totalNet).toBe(150);
      expect(result.totalTax).toBe(15);
      expect(result.totalGross).toBe(165);
      expect(result.exemptionApplied).toBe(false);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].taxAmount).toBe(10);
    });

    it('extracts tax from tax-inclusive line items', () => {
      const result = computeTax({
        jurisdictionCode: 'EU-VAT',
        taxInclusive: true,
        lineItems: [
          { productId: 'p1', category: 'food', amount: 110, taxRate: 0.1 },
        ],
      });
      expect(result.lines[0].netAmount).toBe(100);
      expect(result.lines[0].taxAmount).toBe(10);
      expect(result.totalGross).toBe(110);
    });

    it('applies tax exemption when exemptionId is provided', () => {
      const result = computeTax({
        jurisdictionCode: 'AU-GST',
        taxInclusive: false,
        exemptionId: 'exempt-001',
        lineItems: [
          { productId: 'p1', category: 'food', amount: 100, taxRate: 0.1 },
        ],
      });
      expect(result.exemptionApplied).toBe(true);
      expect(result.lines[0].exempt).toBe(true);
      expect(result.lines[0].taxAmount).toBe(0);
      expect(result.totalTax).toBe(0);
    });

    it('throws on empty line items', () => {
      expect(() => computeTax({
        jurisdictionCode: 'AU-GST',
        taxInclusive: false,
        lineItems: [],
      })).toThrow('at least one line item');
    });

    it('throws on invalid tax rate', () => {
      expect(() => computeTax({
        jurisdictionCode: 'AU-GST',
        taxInclusive: false,
        lineItems: [{ productId: 'p1', category: 'food', amount: 100, taxRate: 1.5 }],
      })).toThrow('between 0 and 1');
    });
  });

  describe('buildTaxReport', () => {
    it('builds a JSON-LD tax report', () => {
      const result = buildTaxReport({
        id: 'https://example.org/reports/tax-001',
        organisation: 'https://example.org/org',
        jurisdictionCode: 'AU-GST',
        periodStart: '2025-01-01',
        periodEnd: '2025-03-31',
        currency: 'AUD',
        lines: [
          {
            productId: 'p1',
            category: 'food',
            netAmount: 100,
            taxAmount: 10,
            grossAmount: 110,
            taxRate: 0.1,
            exempt: false,
          },
        ],
      });
      expect(result.report['@type']).toBe('Invoice');
      expect(result.report['@id']).toBe('https://example.org/reports/tax-001');
    });
  });
});
