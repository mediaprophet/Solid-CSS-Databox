import {
  enrolDevice,
  verifyDeviceAuth,
  revokeDevice,
} from '../../../../src/databox/cms/modules/device-auth/DeviceAuth';
import type { DeviceEnrolmentInput, DeviceAuthInput, DeviceRevocationInput } from '../../../../src/databox/cms/modules/device-auth/DeviceAuth';

describe('Device Auth (mTLS) module', () => {
  const enrolmentInput: DeviceEnrolmentInput = {
    id: 'https://databox.example.org/devices/pos-001',
    deviceName: 'POS Terminal 001',
    organisation: 'https://databox.example.org/org/restaurant',
    deviceType: 'pos-terminal',
    claimUri: 'https://databox.example.org/devices/pos-001/claim',
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    enrolledAt: '2025-07-01T10:00:00Z',
  };

  describe('enrolDevice', () => {
    it('enrols a device with pending status', () => {
      const result = enrolDevice(enrolmentInput);
      expect(result.record['@type']).toContain('Device');
      expect(result.record['@type']).toContain('SolidDevice');
      expect(result.record.name).toBe('POS Terminal 001');
      expect(result.record.enrollmentStatus).toBe('pending');
      expect(result.status).toBe('pending');
      expect(result.deviceId).toBe(enrolmentInput.id);
    });

    it('rejects invalid device type', () => {
      expect(() => enrolDevice({ ...enrolmentInput, deviceType: 'rocket' as any }))
        .toThrow('Device type must be one of');
    });

    it('rejects non-URI id', () => {
      expect(() => enrolDevice({ ...enrolmentInput, id: 'bad' }))
        .toThrow('must be an absolute URI');
    });

    it('rejects empty public key', () => {
      expect(() => enrolDevice({ ...enrolmentInput, publicKeyPem: '  ' }))
        .toThrow('must not be empty');
    });

    it('rejects invalid date', () => {
      expect(() => enrolDevice({ ...enrolmentInput, enrolledAt: 'not-a-date' }))
        .toThrow('must be a valid date');
    });

    it('supports all device types', () => {
      for (const type of [ 'pos-terminal', 'customer-display', 'kitchen-display', 'scanner', 'printer', 'other' ] as const) {
        const result = enrolDevice({ ...enrolmentInput, deviceType: type });
        expect(result.record.deviceType).toBe(type);
      }
    });
  });

  describe('verifyDeviceAuth', () => {
    const authInput: DeviceAuthInput = {
      deviceId: 'https://databox.example.org/devices/pos-001',
      certificateFingerprint: 'sha256:abc123def456',
      presentedAt: '2025-07-01T11:00:00Z',
    };

    it('authenticates an enrolled device', () => {
      const enrolled = enrolDevice(enrolmentInput);
      const approved = { ...enrolled, status: 'enrolled' as const };
      const result = verifyDeviceAuth(approved, authInput);

      expect(result.authenticated).toBe(true);
      expect(result.record.actionStatus).toBe('CompletedActionStatus');
    });

    it('rejects mismatched device ID', () => {
      const enrolled = enrolDevice(enrolmentInput);
      const approved = { ...enrolled, status: 'enrolled' as const };
      const result = verifyDeviceAuth(approved, {
        ...authInput,
        deviceId: 'https://databox.example.org/devices/other',
      });

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain('does not match');
    });

    it('rejects pending device', () => {
      const enrolled = enrolDevice(enrolmentInput);
      const result = verifyDeviceAuth(enrolled, authInput);

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain('pending');
    });

    it('rejects revoked device', () => {
      const enrolled = enrolDevice(enrolmentInput);
      const revoked = { ...enrolled, status: 'revoked' as const };
      const result = verifyDeviceAuth(revoked, authInput);

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain('revoked');
    });
  });

  describe('revokeDevice', () => {
    it('builds a revocation record', () => {
      const input: DeviceRevocationInput = {
        deviceId: 'https://databox.example.org/devices/pos-001',
        revokedBy: 'https://databox.example.org/members/admin',
        revokedAt: '2025-07-01T12:00:00Z',
        reason: 'Device reported stolen.',
      };
      const result = revokeDevice(input);

      expect(result['@type']).toContain('RevokeAction');
      expect(result.actionStatus).toBe('CompletedActionStatus');
      expect(result.result).toBe('Device reported stolen.');
    });

    it('rejects non-URI device ID', () => {
      expect(() => revokeDevice({
        deviceId: 'bad',
        revokedBy: 'https://example.org/admin',
        revokedAt: '2025-07-01T12:00:00Z',
        reason: 'test',
      })).toThrow('must be an absolute URI');
    });

    it('rejects empty reason', () => {
      expect(() => revokeDevice({
        deviceId: 'https://example.org/device/1',
        revokedBy: 'https://example.org/admin',
        revokedAt: '2025-07-01T12:00:00Z',
        reason: '  ',
      })).toThrow('must not be empty');
    });
  });
});
