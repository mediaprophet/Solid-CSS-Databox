import {
  createInterOrgPrintJob,
  createPrintJob,
  createPrintService,
  updatePrintJobStatus,
} from '../../../../src/databox/ipms/modules/print/PrintShop';

describe('Print Shop module', () => {
  describe('createPrintService', () => {
    it('creates a print service', () => {
      const result = createPrintService({
        id: 'https://databox.example.org/print/services/001',
        name: 'Business Cards',
        description: 'Full colour business cards, 350gsm',
        category: 'stationery',
        basePrice: 45,
        currency: 'AUD',
        unitType: 'pack of 100',
        minQuantity: 1,
        turnaroundHours: 48,
      });
      expect(result.record['@type']).toContain('Service');
      expect(result.record.name).toBe('Business Cards');
    });
  });

  describe('createPrintJob', () => {
    it('creates a print job', () => {
      const result = createPrintJob({
        id: 'https://databox.example.org/print/jobs/001',
        customer: 'https://databox.example.org/members/alice',
        organisation: 'https://databox.example.org/org/printshop',
        serviceId: 'https://databox.example.org/print/services/001',
        quantity: 500,
        specifications: [ '350gsm', 'matte laminate', 'double-sided' ],
        priority: 'standard',
        intakeAt: '2025-07-01T10:00:00Z',
      });
      expect(result.record['@type']).toContain('PrintJob');
      expect(result.status).toBe('intake');
      expect(result.estimatedCost).toBe(5000);
    });

    it('rejects empty specifications', () => {
      expect(() => createPrintJob({
        id: 'https://databox.example.org/print/jobs/002',
        customer: 'https://databox.example.org/members/alice',
        organisation: 'https://databox.example.org/org/printshop',
        serviceId: 'https://databox.example.org/print/services/001',
        quantity: 100,
        specifications: [],
        priority: 'standard',
        intakeAt: '2025-07-01T10:00:00Z',
      })).toThrow('at least one specification');
    });

    it('includes artwork URL when provided', () => {
      const result = createPrintJob({
        id: 'https://databox.example.org/print/jobs/003',
        customer: 'https://databox.example.org/members/alice',
        organisation: 'https://databox.example.org/org/printshop',
        serviceId: 'https://databox.example.org/print/services/001',
        quantity: 100,
        specifications: [ '350gsm' ],
        artworkUrl: 'https://databox.example.org/artwork/001.pdf',
        priority: 'rush',
        intakeAt: '2025-07-01T10:00:00Z',
      });
      expect(result.record.artwork).toContain('artwork/001');
    });
  });

  describe('updatePrintJobStatus', () => {
    it('updates to printing status', () => {
      const result = updatePrintJobStatus({
        jobId: 'https://databox.example.org/print/jobs/001',
        updatedBy: 'https://databox.example.org/members/operator',
        status: 'printing',
        updatedAt: '2025-07-02T10:00:00Z',
      });
      expect(result.actionStatus).toBe('ActiveActionStatus');
      expect(result.orderStatus).toBe('OrderProcessing');
    });

    it('updates to delivered status', () => {
      const result = updatePrintJobStatus({
        jobId: 'https://databox.example.org/print/jobs/001',
        updatedBy: 'https://databox.example.org/members/operator',
        status: 'delivered',
        updatedAt: '2025-07-04T10:00:00Z',
      });
      expect(result.actionStatus).toBe('CompletedActionStatus');
      expect(result.orderStatus).toBe('OrderDelivered');
    });

    it('rejects invalid status', () => {
      expect(() => updatePrintJobStatus({
        jobId: 'https://databox.example.org/print/jobs/001',
        updatedBy: 'https://databox.example.org/members/operator',
        status: 'teleported' as any,
        updatedAt: '2025-07-04T10:00:00Z',
      })).toThrow('must be one of');
    });
  });

  describe('createInterOrgPrintJob', () => {
    it('creates an inter-org print job with licence enforcement', () => {
      const result = createInterOrgPrintJob({
        id: 'https://databox.example.org/print/interorg/001',
        customerOrg: 'https://databox.example.org/org/restaurant-chain',
        printShopOrg: 'https://databox.example.org/org/printshop',
        serviceId: 'https://databox.example.org/print/services/001',
        quantity: 10000,
        specifications: [ 'A4', 'double-sided', 'gloss' ],
        artworkUrl: 'https://databox.example.org/artwork/flyers.pdf',
        licencePolicy: 'https://databox.example.org/policies/odrl/001',
        deliveryAddress: '123 Main St, Sydney',
        intakeAt: '2025-07-01T10:00:00Z',
        deadline: '2025-07-10T17:00:00Z',
        budget: 2500,
        currency: 'AUD',
      });
      expect(result.record['@type']).toContain('InterOrgPrintJob');
      expect(result.status).toBe('submitted');
      expect(result.licenceEnforced).toBe(true);
    });

    it('creates without licence policy', () => {
      const result = createInterOrgPrintJob({
        id: 'https://databox.example.org/print/interorg/002',
        customerOrg: 'https://databox.example.org/org/restaurant-chain',
        printShopOrg: 'https://databox.example.org/org/printshop',
        serviceId: 'https://databox.example.org/print/services/001',
        quantity: 5000,
        specifications: [ 'A5' ],
        artworkUrl: 'https://databox.example.org/artwork/flyers.pdf',
        deliveryAddress: '456 King St, Melbourne',
        intakeAt: '2025-07-01T10:00:00Z',
        deadline: '2025-07-08T17:00:00Z',
        budget: 1200,
        currency: 'AUD',
      });
      expect(result.licenceEnforced).toBe(false);
    });

    it('rejects empty specifications', () => {
      expect(() => createInterOrgPrintJob({
        id: 'https://databox.example.org/print/interorg/003',
        customerOrg: 'https://databox.example.org/org/restaurant-chain',
        printShopOrg: 'https://databox.example.org/org/printshop',
        serviceId: 'https://databox.example.org/print/services/001',
        quantity: 5000,
        specifications: [],
        artworkUrl: 'https://databox.example.org/artwork/flyers.pdf',
        deliveryAddress: '456 King St',
        intakeAt: '2025-07-01T10:00:00Z',
        deadline: '2025-07-08T17:00:00Z',
        budget: 1200,
        currency: 'AUD',
      })).toThrow('must include specifications');
    });
  });
});
