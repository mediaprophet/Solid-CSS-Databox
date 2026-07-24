import {
  exportToAccounting,
  importFromAccounting,
} from '../../../../src/databox/ipms/modules/accounting/AccountingBridge';
import type {
  AccountingExportInput,
  AccountingImportInput,
} from '../../../../src/databox/ipms/modules/accounting/AccountingBridge';

describe('Accounting Import / Export module', () => {
  const sampleExportData = {
    invoices: [
      {
        id: 'INV-001',
        contactId: 'C-001',
        contactName: 'Acme Corp',
        issueDate: '2025-07-01',
        dueDate: '2025-07-15',
        status: 'SENT' as const,
        lineItems: [
          { description: 'Consulting', quantity: 10, unitAmount: 100, taxRate: 0.1 },
        ],
      },
    ],
    payments: [
      {
        id: 'PMT-001',
        invoiceId: 'INV-001',
        contactId: 'C-001',
        amount: 1100,
        date: '2025-07-10',
        method: 'BANK_TRANSFER' as const,
        reference: 'REF-001',
      },
    ],
    contacts: [
      {
        id: 'C-001',
        name: 'Acme Corp',
        email: 'accounts@acme.com',
        isSupplier: false,
        isCustomer: true,
      },
    ],
  };

  describe('exportToAccounting', () => {
    it('exports invoices to Xero CSV format', () => {
      const input: AccountingExportInput = {
        id: 'https://databox.example.org/exports/001',
        organisation: 'https://databox.example.org/org',
        package: 'xero',
        exportType: 'invoices',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        currency: 'AUD',
        data: sampleExportData,
      };
      const result = exportToAccounting(input);
      expect(result.package).toBe('xero');
      expect(result.recordCount).toBeGreaterThan(0);
      expect(result.content).toContain('INV-001');
      expect(result.content).toContain('Acme Corp');
      expect(result.record['@type']).toBe('DataExport');
    });

    it('exports payments to QIF format', () => {
      const input: AccountingExportInput = {
        id: 'https://databox.example.org/exports/002',
        organisation: 'https://databox.example.org/org',
        package: 'qif',
        exportType: 'payments',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        currency: 'AUD',
        data: sampleExportData,
      };
      const result = exportToAccounting(input);
      expect(result.content).toContain('!Type:Bank');
      expect(result.content).toContain('D2025-07-10');
      expect(result.content).toContain('T1100');
      expect(result.recordCount).toBe(1);
    });

    it('exports payments to OFX format', () => {
      const input: AccountingExportInput = {
        id: 'https://databox.example.org/exports/003',
        organisation: 'https://databox.example.org/org',
        package: 'ofx',
        exportType: 'payments',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        currency: 'AUD',
        data: sampleExportData,
      };
      const result = exportToAccounting(input);
      expect(result.content).toContain('OFXHEADER');
      expect(result.content).toContain('<STMTTRN>');
      expect(result.content).toContain('<TRNAMT>1100');
    });

    it('exports full data to JSON-LD format', () => {
      const input: AccountingExportInput = {
        id: 'https://databox.example.org/exports/004',
        organisation: 'https://databox.example.org/org',
        package: 'json-ld',
        exportType: 'full-export',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        currency: 'AUD',
        data: sampleExportData,
      };
      const result = exportToAccounting(input);
      const parsed = JSON.parse(result.content);
      expect(parsed['@type']).toBe('DataExport');
      expect(parsed.invoices).toHaveLength(1);
      expect(parsed.payments).toHaveLength(1);
      expect(parsed.contacts).toHaveLength(1);
    });

    it('exports to QuickBooks IIF format', () => {
      const input: AccountingExportInput = {
        id: 'https://databox.example.org/exports/005',
        organisation: 'https://databox.example.org/org',
        package: 'quickbooks',
        exportType: 'invoices',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        currency: 'AUD',
        data: sampleExportData,
      };
      const result = exportToAccounting(input);
      expect(result.content).toContain('!TRNS');
      expect(result.content).toContain('TRNS\tINVOICE');
      expect(result.content).toContain('ENDTRNS');
    });

    it('rejects invalid currency', () => {
      expect(() => exportToAccounting({

        id: 'https://databox.example.org/exports/006',
        organisation: 'https://databox.example.org/org',
        package: 'xero',
        exportType: 'invoices',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        currency: 'DOLLARS',
        data: sampleExportData,
      })).toThrow('three-letter ISO 4217');
    });

    it('rejects invalid date', () => {
      expect(() => exportToAccounting({
        id: 'https://databox.example.org/exports/007',
        organisation: 'https://databox.example.org/org',
        package: 'xero',
        exportType: 'invoices',
        periodStart: 'not-a-date',
        periodEnd: '2025-07-31',
        currency: 'AUD',
        data: sampleExportData,
      })).toThrow('valid date');
    });
  });

  describe('importFromAccounting', () => {
    it('imports CSV data', () => {
      const csv = 'Name,Email,Amount\nAcme,acme@test.com,100\nBeta,beta@test.com,200';
      const input: AccountingImportInput = {
        id: 'https://databox.example.org/imports/001',
        organisation: 'https://databox.example.org/org',
        package: 'csv-generic',
        importType: 'contacts',
        content: csv,
        format: 'text/csv',
      };
      const result = importFromAccounting(input);
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.records[0].Name).toBe('Acme');
      expect(result.records[1].Amount).toBe('200');
    });

    it('imports JSON-LD data', () => {
      const json = JSON.stringify([
        { id: 'C-001', name: 'Acme Corp' },
        { id: 'C-002', name: 'Beta Inc' },
      ]);
      const input: AccountingImportInput = {
        id: 'https://databox.example.org/imports/002',
        organisation: 'https://databox.example.org/org',
        package: 'json-ld',
        importType: 'contacts',
        content: json,
        format: 'application/ld+json',
      };
      const result = importFromAccounting(input);
      expect(result.imported).toBe(2);
      expect(result.records[0].id).toBe('C-001');
    });

    it('imports QIF data', () => {
      const qif = '!Type:Bank\nD2025-07-01\nT100.00\nPAcme Corp\n^D2025-07-02\nT50.00\nPBeta Inc\n^';
      const input: AccountingImportInput = {
        id: 'https://databox.example.org/imports/003',
        organisation: 'https://databox.example.org/org',
        package: 'qif',
        importType: 'opening-balances',
        content: qif,
        format: 'application/vnd.qif',
      };
      const result = importFromAccounting(input);
      expect(result.imported).toBe(2);
      expect(result.records[0].date).toBe('2025-07-01');
      expect(result.records[0].payee).toBe('Acme Corp');
    });

    it('imports OFX data', () => {
      const ofx = '<STMTTRN><DTPOSTED>20250701<TRNAMT>100.00<NAME>Acme<FITID>F001</STMTTRN>' +
        '<STMTTRN><DTPOSTED>20250702<TRNAMT>-50.00<NAME>Beta<FITID>F002</STMTTRN>';
      const input: AccountingImportInput = {
        id: 'https://databox.example.org/imports/004',
        organisation: 'https://databox.example.org/org',
        package: 'ofx',
        importType: 'opening-balances',
        content: ofx,
        format: 'application/x-ofx',
      };
      const result = importFromAccounting(input);
      expect(result.imported).toBe(2);
      expect(result.records[0].payee).toBe('Acme');
      expect(result.records[1].amount).toBe('-50.00');
    });

    it('skips CSV rows with mismatched columns', () => {
      const csv = 'A,B,C\n1,2\n4,5,6';
      const input: AccountingImportInput = {
        id: 'https://databox.example.org/imports/005',
        organisation: 'https://databox.example.org/org',
        package: 'csv-generic',
        importType: 'contacts',
        content: csv,
        format: 'text/csv',
      };
      const result = importFromAccounting(input);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
