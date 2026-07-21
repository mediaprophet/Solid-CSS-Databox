import {
  processEftposTransaction,
  processEftposSettlement,
  queryTerminalStatus,
} from '../../../../src/databox/cms/modules/eftpos/EftposTerminal';
import type { EftposTerminalConfig, EftposTransactionInput } from '../../../../src/databox/cms/modules/eftpos/EftposTerminal';

describe('EFTPOS / Card Reader module', () => {
  const config: EftposTerminalConfig = {
    terminalId: 'TERM-001',
    provider: 'tyro',
    protocol: 'REST',
    endpoint: 'https://pos.tyro.com/api',
    currency: 'AUD',
    timeout: 30000,
  };

  describe('processEftposTransaction', () => {
    it('processes a purchase transaction', () => {
      const input: EftposTransactionInput = {
        terminalId: 'TERM-001',
        transactionType: 'PURCHASE',
        amount: 42.50,
        currency: 'AUD',
        reference: 'INV-001',
      };
      const result = processEftposTransaction(input, config);
      expect(result.terminalId).toBe('TERM-001');
      expect(result.status).toBe('PENDING');
      expect(result.amount).toBe(42.50);
      expect(result.transactionId).toMatch(/^eftpos-txn-/);
      expect(result.record['@type']).toBe('PaymentTransaction');
      expect(result.record.provider).toBe('tyro');
    });

    it('processes purchase with cashout and tip', () => {
      const result = processEftposTransaction({
        terminalId: 'TERM-001',
        transactionType: 'PURCHASE_PLUS_CASHOUT',
        amount: 25.00,
        currency: 'AUD',
        cashoutAmount: 20.00,
        tipAmount: 2.50,
      }, config);
      expect(result.cashoutAmount).toBe(20.00);
      expect(result.tipAmount).toBe(2.50);
      expect(result.record.totalAmount).toBe(47.50);
    });

    it('rejects mismatched terminal ID', () => {
      expect(() => processEftposTransaction({
        terminalId: 'WRONG-ID',
        transactionType: 'PURCHASE',
        amount: 10.00,
        currency: 'AUD',
      }, config)).toThrow('does not match configured terminal');
    });

    it('rejects mismatched currency', () => {
      expect(() => processEftposTransaction({
        terminalId: 'TERM-001',
        transactionType: 'PURCHASE',
        amount: 10.00,
        currency: 'USD',
      }, config)).toThrow('does not match terminal currency');
    });

    it('rejects negative amount', () => {
      expect(() => processEftposTransaction({
        terminalId: 'TERM-001',
        transactionType: 'PURCHASE',
        amount: -5.00,
        currency: 'AUD',
      }, config)).toThrow('non-negative finite');
    });

    it('rejects invalid currency code', () => {
      expect(() => processEftposTransaction({
        terminalId: 'TERM-001',
        transactionType: 'PURCHASE',
        amount: 10.00,
        currency: 'DOLLARS',
      }, config)).toThrow('three-letter ISO 4217');
    });
  });

  describe('processEftposSettlement', () => {
    it('processes a settlement request', () => {
      const result = processEftposSettlement('TERM-001', config);
      expect(result.terminalId).toBe('TERM-001');
      expect(result.status).toBe('PENDING');
      expect(result.settlementId).toMatch(/^eftpos-settlement-/);
      expect(result.record['@type']).toBe('SettlementReport');
    });

    it('rejects mismatched terminal ID', () => {
      expect(() => processEftposSettlement('WRONG', config)).toThrow('does not match');
    });
  });

  describe('queryTerminalStatus', () => {
    it('returns terminal status', () => {
      const result = queryTerminalStatus('TERM-001', config);
      expect(result.terminalId).toBe('TERM-001');
      expect(result.online).toBe(true);
      expect(result.available).toBe(true);
      expect(result.record['@type']).toBe('ServiceStatus');
    });

    it('rejects mismatched terminal ID', () => {
      expect(() => queryTerminalStatus('WRONG', config)).toThrow('does not match');
    });
  });
});
