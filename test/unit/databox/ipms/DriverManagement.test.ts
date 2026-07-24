import {
  createJobOffer,
  dispatchMatch,
  registerDriver,
  updateJobStatus,
} from '../../../../src/databox/ipms/modules/delivery/DriverManagement';

describe('Driver Management module', () => {
  const baseDriver = {
    id: 'https://databox.example.org/drivers/d001',
    person: 'https://databox.example.org/members/dave',
    organisation: 'https://databox.example.org/org/logistics',
    vehicleType: 'van',
    vehicleRego: 'ABC123',
    licenseNumber: 'L1234567',
    licenseExpiry: '2026-12-31',
    zones: [ 'north', 'central' ],
    availability: 'available' as const,
    registeredAt: '2025-07-01T10:00:00Z',
  };

  describe('registerDriver', () => {
    it('registers a driver', () => {
      const result = registerDriver(baseDriver);
      expect(result.record['@type']).toContain('Driver');
      expect(result.status).toBe('registered');
      expect(result.driverId).toBe(baseDriver.id);
    });

    it('rejects empty zones', () => {
      expect(() => registerDriver({ ...baseDriver, zones: []}))
        .toThrow('at least one zone');
    });

    it('rejects invalid URI', () => {
      expect(() => registerDriver({ ...baseDriver, id: 'bad' }))
        .toThrow('must be an absolute URI');
    });
  });

  describe('createJobOffer', () => {
    it('creates a job offer', () => {
      const result = createJobOffer({
        id: 'https://databox.example.org/jobs/j001',
        organisation: 'https://databox.example.org/org/logistics',
        driver: 'https://databox.example.org/drivers/d001',
        pickupLocation: 'Store A',
        dropoffLocation: '123 Main St',
        pickupTime: '2025-07-01T14:00:00Z',
        estimatedDurationMinutes: 45,
        paymentAmount: 35,
        currency: 'AUD',
        storeName: 'Store A',
        priority: 'normal',
        offeredAt: '2025-07-01T13:00:00Z',
      });
      expect(result.record['@type']).toContain('Offer');
      expect(result.status).toBe('offered');
    });
  });

  describe('updateJobStatus', () => {
    it('updates to delivered status', () => {
      const result = updateJobStatus({
        jobId: 'https://databox.example.org/jobs/j001',
        driver: 'https://databox.example.org/drivers/d001',
        status: 'delivered',
        updatedAt: '2025-07-01T15:00:00Z',
      });
      expect(result.actionStatus).toBe('CompletedActionStatus');
    });

    it('updates to in-transit status', () => {
      const result = updateJobStatus({
        jobId: 'https://databox.example.org/jobs/j001',
        driver: 'https://databox.example.org/drivers/d001',
        status: 'in-transit',
        updatedAt: '2025-07-01T14:30:00Z',
      });
      expect(result.actionStatus).toBe('ActiveActionStatus');
    });

    it('rejects invalid status', () => {
      expect(() => updateJobStatus({
        jobId: 'https://databox.example.org/jobs/j001',
        driver: 'https://databox.example.org/drivers/d001',
        status: 'teleported' as any,
        updatedAt: '2025-07-01T14:30:00Z',
      })).toThrow('must be one of');
    });
  });

  describe('dispatchMatch', () => {
    const drivers = [
      baseDriver,
      { ...baseDriver, id: 'https://example.org/d2', person: 'https://example.org/p2', zones: [ 'south' ]},
      { ...baseDriver, id: 'https://example.org/d3', person: 'https://example.org/p3', zones: [ 'north', 'central' ], availability: 'busy' as const },
    ];

    it('matches available drivers in correct zones', () => {
      const results = dispatchMatch({
        drivers,
        jobZones: [ 'north' ],
        jobPriority: 'normal',
      });
      expect(results).toHaveLength(1);
      expect(results[0].driverId).toBe(baseDriver.id);
    });

    it('excludes unavailable drivers', () => {
      const results = dispatchMatch({
        drivers,
        jobZones: [ 'north', 'central' ],
        jobPriority: 'high',
      });
      expect(results).toHaveLength(1);
      expect(results[0].driverId).toBe(baseDriver.id);
    });

    it('returns empty for no matching zones', () => {
      const results = dispatchMatch({
        drivers,
        jobZones: [ 'east' ],
        jobPriority: 'normal',
      });
      expect(results).toHaveLength(0);
    });

    it('rejects empty drivers list', () => {
      expect(() => dispatchMatch({
        drivers: [],
        jobZones: [ 'north' ],
        jobPriority: 'normal',
      })).toThrow('at least one driver');
    });
  });
});
