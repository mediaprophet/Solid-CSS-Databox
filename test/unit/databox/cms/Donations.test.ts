import { processDonation, buildDonationReceipt, buildTransparencyReport, type DonationCampaign } from '../../../../src/databox/cms/modules/donations/Donations';

describe('Donations module', () => {
  const activeCampaign: DonationCampaign = {
    id: 'camp-001',
    name: 'Building Fund',
    description: 'New community hall',
    targetAmount: 10000,
    raisedAmount: 3000,
    currency: 'AUD',
    deadline: '2026-12-31',
    active: true,
  };

  describe('processDonation', () => {
    it('processes a one-off donation and updates raised total', () => {
      const result = processDonation(activeCampaign, {
        campaignId: 'camp-001',
        donorId: 'donor-001',
        amount: 500,
        currency: 'AUD',
        frequency: 'one-off',
        anonymous: false,
      });
      expect(result.amount).toBe(500);
      expect(result.newRaisedTotal).toBe(3500);
      expect(result.progressPercent).toBe(35);
      expect(result.donationId).toMatch(/^don-/);
    });

    it('caps progress at 100%', () => {
      const result = processDonation(activeCampaign, {
        campaignId: 'camp-001',
        donorId: 'donor-001',
        amount: 8000,
        currency: 'AUD',
        frequency: 'one-off',
        anonymous: false,
      });
      expect(result.progressPercent).toBe(100);
    });

    it('throws on mismatched campaign ID', () => {
      expect(() => processDonation(activeCampaign, {
        campaignId: 'wrong-id',
        donorId: 'donor-001',
        amount: 500,
        currency: 'AUD',
        frequency: 'one-off',
        anonymous: false,
      })).toThrow('does not match');
    });

    it('throws on inactive campaign', () => {
      const inactive: DonationCampaign = { ...activeCampaign, active: false };
      expect(() => processDonation(inactive, {
        campaignId: 'camp-001',
        donorId: 'donor-001',
        amount: 500,
        currency: 'AUD',
        frequency: 'one-off',
        anonymous: false,
      })).toThrow('not active');
    });

    it('throws on currency mismatch', () => {
      expect(() => processDonation(activeCampaign, {
        campaignId: 'camp-001',
        donorId: 'donor-001',
        amount: 500,
        currency: 'USD',
        frequency: 'one-off',
        anonymous: false,
      })).toThrow('currency');
    });

    it('throws on expired campaign', () => {
      const expired: DonationCampaign = { ...activeCampaign, deadline: '2020-01-01' };
      expect(() => processDonation(expired, {
        campaignId: 'camp-001',
        donorId: 'donor-001',
        amount: 500,
        currency: 'AUD',
        frequency: 'one-off',
        anonymous: false,
      })).toThrow('deadline');
    });
  });

  describe('buildDonationReceipt', () => {
    it('builds a JSON-LD donation receipt', () => {
      const result = buildDonationReceipt({
        id: 'https://example.org/donations/receipt-001',
        organisation: 'https://example.org/org',
        donor: 'https://example.org/members/alice',
        campaign: 'https://example.org/campaigns/building-fund',
        amount: 500,
        currency: 'AUD',
        taxDeductible: true,
        donatedAt: '2025-01-15',
        frequency: 'one-off',
      });
      expect(result.receipt['@type']).toBe('Invoice');
      expect(result.receipt.paymentStatus).toBe('PaymentComplete');
    });
  });

  describe('buildTransparencyReport', () => {
    it('builds a JSON-LD transparency report with allocations', () => {
      const result = buildTransparencyReport({
        id: 'https://example.org/donations/report-001',
        organisation: 'https://example.org/org',
        campaignId: 'camp-001',
        currency: 'AUD',
        periodStart: '2025-01-01',
        periodEnd: '2025-03-31',
        donations: [
          { amount: 3000, allocatedTo: 'construction' },
          { amount: 500, allocatedTo: 'permits' },
        ],
      });
      expect(result.report['@type']).toBe('Dataset');
      expect(result.report.distribution).toHaveLength(2);
      expect(result.report.distribution[0].name).toBe('construction');
    });
  });
});
