import {
  buildAppProfile,
  buildContainerBootConfig,
  checkNetworkScope,
  issueAppInstallLicence,
  serialiseAppProfile,
  validateAppInstallLicence,
} from '../../../../src/databox/ipms/OrgAppManifest';

const menuModule = {
  id: 'menu',
  moduleId: 'menu',
  label: 'Menu',
  ipmsRoute: '/.databox/ipms/menu',
  icon: 'utensils',
  defaultSort: 1,
};
const ordersModule = {
  id: 'orders',
  moduleId: 'pos',
  label: 'Active Orders',
  ipmsRoute: '/.databox/ipms/pos/orders',
  icon: 'clipboard',
  defaultSort: 2,
  requiredPermission: 'pos:order',
};
const bookingsModule = {
  id: 'bookings',
  moduleId: 'bookings',
  label: 'Reservations',
  ipmsRoute: '/.databox/ipms/bookings',
  icon: 'calendar',
  defaultSort: 3,
  requiredPermission: 'bookings:view',
};

const sampleProfileInput = {
  appId: 'waiter-app',
  name: 'Waiter App',
  description: 'Tableside ordering for restaurant staff',
  version: '1.0.0',
  networkScope: 'local-only' as const,
  requiredModules: [ 'menu', 'pos', 'bookings' ],
  verticalProfiles: [ 'food.restaurant', 'food.allergy-safety' ],
  uiModules: [
    menuModule,
    ordersModule,
    bookingsModule,
  ],
  defaultPermissions: [ 'pos:order', 'bookings:view' ],
  installUrl: 'https://databox.example.org/apps/waiter-app/',
};

const sampleLicenceInput = {
  licenceId: 'https://databox.example.org/licences/waiter-install-001',
  appId: 'waiter-app',
  organisation: 'https://databox.example.org/org/restaurant',
  deviceId: 'https://databox.example.org/devices/tablet-001',
  scope: 'full' as const,
  permissions: [ 'pos:order', 'bookings:view' ],
  issuedAt: '2025-07-01T10:00:00Z',
  issuedBy: 'https://databox.example.org/org/restaurant',
};

describe('Org App Manifest module', () => {
  describe('buildAppProfile', () => {
    it('builds a valid app profile', () => {
      const profile = buildAppProfile(sampleProfileInput);
      expect(profile.appId).toBe('waiter-app');
      expect(profile.networkScope).toBe('local-only');
      expect(profile.uiModules).toHaveLength(3);
    });

    it('rejects invalid network scope', () => {
      expect(() => buildAppProfile({ ...sampleProfileInput, networkScope: 'anywhere' as any }))
        .toThrow('Network scope must be \'local-only\' or \'remote-capable\'');
    });

    it('rejects empty required modules', () => {
      expect(() => buildAppProfile({ ...sampleProfileInput, requiredModules: []}))
        .toThrow('at least one required module');
    });

    it('rejects empty UI modules', () => {
      expect(() => buildAppProfile({ ...sampleProfileInput, uiModules: []}))
        .toThrow('at least one UI module');
    });

    it('includes icon URL when provided', () => {
      const profile = buildAppProfile({ ...sampleProfileInput, iconUrl: 'https://databox.example.org/apps/waiter-app/icon.png' });
      expect(profile.iconUrl).toContain('icon.png');
    });
  });

  describe('serialiseAppProfile', () => {
    it('produces JSON-LD with correct types', () => {
      const profile = buildAppProfile(sampleProfileInput);
      const record = serialiseAppProfile(profile);
      expect(record['@type']).toContain('SoftwareApplication');
      expect(record['@type']).toContain('SolidApp');
      expect(record['solid:networkScope']).toBe('local-only');
      expect(record.featureList).toHaveLength(3);
    });
  });

  describe('issueAppInstallLicence', () => {
    it('issues a valid licence', () => {
      const licence = issueAppInstallLicence(sampleLicenceInput);
      expect(licence.appId).toBe('waiter-app');
      expect(licence.scope).toBe('full');
      expect(licence.permissions).toContain('pos:order');
    });

    it('rejects empty permissions', () => {
      expect(() => issueAppInstallLicence({ ...sampleLicenceInput, permissions: []}))
        .toThrow('at least one permission');
    });

    it('rejects expiry before issue date', () => {
      expect(() => issueAppInstallLicence({
        ...sampleLicenceInput,
        expiresAt: '2025-06-01T10:00:00Z',
      })).toThrow('expiry must be after issue date');
    });

    it('supports all licence scopes', () => {
      for (const scope of [ 'full', 'read-only', 'trial', 'restricted' ] as const) {
        const licence = issueAppInstallLicence({ ...sampleLicenceInput, scope });
        expect(licence.scope).toBe(scope);
      }
    });

    it('rejects invalid licence scope', () => {
      expect(() => issueAppInstallLicence({ ...sampleLicenceInput, scope: 'admin' as any }))
        .toThrow('Licence scope must be one of');
    });
  });

  describe('validateAppInstallLicence', () => {
    it('validates a current licence', () => {
      const licence = issueAppInstallLicence(sampleLicenceInput);
      const result = validateAppInstallLicence(licence, '2025-07-15T10:00:00Z');
      expect(result.valid).toBe(true);
    });

    it('rejects an expired licence', () => {
      const licence = issueAppInstallLicence({
        ...sampleLicenceInput,
        expiresAt: '2025-07-10T10:00:00Z',
      });
      const result = validateAppInstallLicence(licence, '2025-07-15T10:00:00Z');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('rejects a trial licence older than 30 days', () => {
      const licence = issueAppInstallLicence({
        ...sampleLicenceInput,
        scope: 'trial' as const,
        issuedAt: '2025-06-01T10:00:00Z',
      });
      const result = validateAppInstallLicence(licence, '2025-07-15T10:00:00Z');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('30 days');
    });
  });

  describe('buildContainerBootConfig', () => {
    it('builds boot config with all UI modules available', () => {
      const profile = buildAppProfile(sampleProfileInput);
      const licence = issueAppInstallLicence(sampleLicenceInput);
      const result = buildContainerBootConfig(
        profile,
        [ 'menu', 'pos', 'bookings' ],
        licence,
        'https://databox.example.org',
        '2025-07-15T10:00:00Z',
      );
      expect(result.config.availableUiModules).toHaveLength(3);
      expect(result.denied).toHaveLength(0);
    });

    it('filters out UI modules for disabled IPMS modules', () => {
      const profile = buildAppProfile(sampleProfileInput);
      const licence = issueAppInstallLicence(sampleLicenceInput);
      const result = buildContainerBootConfig(
        profile,
        [ 'menu', 'pos' ], // Bookings not enabled
        licence,
        'https://databox.example.org',
        '2025-07-15T10:00:00Z',
      );
      expect(result.config.availableUiModules).toHaveLength(2);
      expect(result.denied.length).toBeGreaterThan(0);
      expect(result.denied.some(d => d.includes('bookings'))).toBe(true);
    });

    it('filters out UI modules requiring unlicensed permissions', () => {
      const profile = buildAppProfile(sampleProfileInput);
      const licence = issueAppInstallLicence({
        ...sampleLicenceInput,
        permissions: [ 'pos:order' ], // Bookings:view not granted
      });
      const result = buildContainerBootConfig(
        profile,
        [ 'menu', 'pos', 'bookings' ],
        licence,
        'https://databox.example.org',
        '2025-07-15T10:00:00Z',
      );
      expect(result.config.availableUiModules).toHaveLength(2);
      expect(result.denied.some(d => d.includes('bookings'))).toBe(true);
    });

    it('blocks write operations for read-only licence', () => {
      const readOnlyMenu = {
        ...menuModule,
      };
      const readOnlyOrders = {
        id: 'orders',
        moduleId: 'pos',
        label: 'Orders',
        ipmsRoute: 'POST /.databox/ipms/pos/orders',
        icon: 'clipboard',
        defaultSort: 2,
      };
      const profile = buildAppProfile({
        ...sampleProfileInput,
        uiModules: [
          readOnlyMenu,
          readOnlyOrders,
        ],
      });
      const licence = issueAppInstallLicence({
        ...sampleLicenceInput,
        scope: 'read-only' as const,
      });
      const result = buildContainerBootConfig(
        profile,
        [ 'menu', 'pos' ],
        licence,
        'https://databox.example.org',
        '2025-07-15T10:00:00Z',
      );
      expect(result.config.availableUiModules).toHaveLength(1);
      expect(result.denied.some(d => d.includes('read-only'))).toBe(true);
    });

    it('rejects mismatched app ID', () => {
      const profile = buildAppProfile(sampleProfileInput);
      const licence = issueAppInstallLicence({
        ...sampleLicenceInput,
        appId: 'different-app',
      });
      expect(() => buildContainerBootConfig(
        profile,
        [ 'menu', 'pos', 'bookings' ],
        licence,
        'https://databox.example.org',
        '2025-07-15T10:00:00Z',
      )).toThrow('Licence is for app "different-app"');
    });

    it('rejects expired licence at boot', () => {
      const profile = buildAppProfile(sampleProfileInput);
      const licence = issueAppInstallLicence({
        ...sampleLicenceInput,
        expiresAt: '2025-07-10T10:00:00Z',
      });
      expect(() => buildContainerBootConfig(
        profile,
        [ 'menu', 'pos', 'bookings' ],
        licence,
        'https://databox.example.org',
        '2025-07-15T10:00:00Z',
      )).toThrow('expired');
    });
  });

  describe('checkNetworkScope', () => {
    it('allows any origin for remote-capable apps', () => {
      const result = checkNetworkScope('remote-capable', '203.0.113.5', []);
      expect(result.allowed).toBe(true);
    });

    it('allows local-only from matching network', () => {
      const result = checkNetworkScope('local-only', '192.168.1.50', [ '192.168.1.0/24' ]);
      expect(result.allowed).toBe(true);
    });

    it('blocks local-only from external IP', () => {
      const result = checkNetworkScope('local-only', '203.0.113.5', [ '192.168.1.0/24' ]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in local network');
    });

    it('matches exact IP', () => {
      const result = checkNetworkScope('local-only', '10.0.0.5', [ '10.0.0.5' ]);
      expect(result.allowed).toBe(true);
    });

    it('matches /16 range', () => {
      const result = checkNetworkScope('local-only', '172.16.5.10', [ '172.16.0.0/16' ]);
      expect(result.allowed).toBe(true);
    });

    it('rejects unparseable origin', () => {
      const result = checkNetworkScope('local-only', 'not-an-ip', [ '192.168.1.0/24' ]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Could not determine');
    });
  });
});
