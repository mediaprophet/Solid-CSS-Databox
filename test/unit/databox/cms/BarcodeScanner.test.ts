import {
  processBarcodeScan,
  parseGs1Data,
  validateGtinCheckDigit,
  lookupProductByGtin,
  GS1_AIS,
} from '../../../../src/databox/cms/modules/barcode/BarcodeScanner';

describe('Barcode / QR Scanner module', () => {
  describe('detectSymbology (via processBarcodeScan)', () => {
    it('detects EAN-13', () => {
      const result = processBarcodeScan({ raw: '0000000000017' });
      expect(result.symbology).toBe('EAN-13');
    });

    it('detects EAN-8', () => {
      const result = processBarcodeScan({ raw: '12345670' });
      expect(result.symbology).toBe('EAN-8');
    });

    it('detects UPC-A', () => {
      const result = processBarcodeScan({ raw: '036000291452' });
      expect(result.symbology).toBe('UPC-A');
    });

    it('detects unknown symbology', () => {
      const result = processBarcodeScan({ raw: 'ABC123XYZ!!@#' });
      expect(result.symbology).toBe('UNKNOWN');
    });
  });

  describe('parseGs1Data', () => {
    it('parses parenthesized GS1-128 format', () => {
      const results = parseGs1Data('(01)93006750322491(10)BATCH001(17)251231');
      expect(results).toHaveLength(3);
      expect(results[0].ai).toBe('01');
      expect(results[0].value).toBe('93006750322491');
      expect(results[0].aiDescription).toContain('GTIN');
      expect(results[1].ai).toBe('10');
      expect(results[1].value).toBe('BATCH001');
      expect(results[2].ai).toBe('17');
      expect(results[2].value).toBe('251231');
    });

    it('returns empty array for non-GS1 data', () => {
      const results = parseGs1Data('1234567890123');
      expect(results).toHaveLength(0);
    });
  });

  describe('validateGtinCheckDigit', () => {
    it('validates a correct GTIN-13', () => {
      expect(validateGtinCheckDigit('0000000000017')).toBe(true);
    });

    it('rejects an incorrect GTIN-13', () => {
      expect(validateGtinCheckDigit('0000000000018')).toBe(false);
    });

    it('rejects non-numeric GTIN', () => {
      expect(validateGtinCheckDigit('ABCDEF')).toBe(false);
    });
  });

  describe('processBarcodeScan', () => {
    it('processes a GS1-128 barcode with GTIN and batch', () => {
      const result = processBarcodeScan({
        raw: '(01)00000000000171(10)BATCH001(17)251231',
      });
      expect(result.symbology).toBe('GS1-128');
      expect(result.gtin).toBe('00000000000171');
      expect(result.batchLot).toBe('BATCH001');
      expect(result.expiryDate).toBe('251231');
      expect(result.gs1Parsed).toHaveLength(3);
      expect(result.record['@type']).toBe('BarcodeScan');
    });

    it('includes organisation and scannedAt when provided', () => {
      const result = processBarcodeScan({
        raw: '0000000000017',
        organisation: 'https://example.org/org',
        scannedAt: '2025-07-22T10:00:00Z',
      });
      expect(result.record.organisation).toBe('https://example.org/org');
      expect(result.record.scannedAt).toBe('2025-07-22T10:00:00Z');
    });

    it('rejects empty raw value', () => {
      expect(() => processBarcodeScan({ raw: '' })).toThrow('must not be empty');
    });
  });

  describe('lookupProductByGtin', () => {
    const catalogue = [
      { productId: 'https://example.org/products/p1', gtin: '0000000000017', name: 'Coffee Beans 1kg' },
      { productId: 'https://example.org/products/p2', gtin: '1234567890123', name: 'Tea Bags 100ct' },
    ];

    it('finds a product by GTIN', () => {
      const result = lookupProductByGtin('0000000000017', catalogue);
      expect(result.found).toBe(true);
      expect(result.productId).toBe('https://example.org/products/p1');
      expect(result.productName).toBe('Coffee Beans 1kg');
      expect(result.record['@type']).toBe('Product');
    });

    it('returns not found for unknown GTIN', () => {
      const result = lookupProductByGtin('9999999999999', catalogue);
      expect(result.found).toBe(false);
      expect(result.record.found).toBe(false);
    });
  });

  describe('GS1_AIS', () => {
    it('contains common application identifiers', () => {
      expect(GS1_AIS['01']).toContain('GTIN');
      expect(GS1_AIS['10']).toContain('Batch');
      expect(GS1_AIS['17']).toContain('Expiration');
      expect(GS1_AIS['21']).toContain('Serial number');
    });
  });
});
