import type {
  NativePosDeviceDescriptor,
  NativePosOperatorSession,
} from '../../../../../../src/databox/ipms/modules/pos/NativePosDeviceContract';
import {
  buildOpenCashDrawerJob,
  capabilitiesForNativePosDevice,
  NATIVE_POS_DEVICE_MODULE_MANIFEST,
  parseNativePosDeviceDescriptorRdf,
  parseNativePosDeviceJobRdf,
  serializeNativePosDeviceDescriptorToTurtle,
  serializeNativePosDeviceJobToTurtle,
  toNativePosRuntimeWorkDescriptor,
  validateNativePosDeviceDescriptor,
  validateNativePosDeviceJob,
  validateNativePosRuntimeDescriptor,
} from '../../../../../../src/databox/ipms/modules/pos/NativePosDeviceContract';

const operatorWebId = 'https://staff.example/alice#me';
const cashierRole = 'https://pods.example/.databox/ipms/roles/cashier';
const managerRole = 'https://pods.example/.databox/ipms/roles/manager';
const deviceWebId = 'https://devices.example/pos/drawer-1#device';

const session: NativePosOperatorSession = {
  sessionId: 'session-2026-07-19-a',
  webId: operatorWebId,
  roleIri: cashierRole,
  startedAt: '2026-07-19T09:00:00.000Z',
  expiresAt: '2026-07-19T17:00:00.000Z',
};

const cashDrawer: NativePosDeviceDescriptor = {
  id: 'front-register.drawer-1',
  label: 'Front register drawer',
  kind: 'cash-drawer',
  deviceWebId,
  endpoint: {
    url: 'https://pos-edge.local:9443/devices/drawer-1',
    transport: 'https',
    tlsMode: 'direct-mtls',
    mtlsDeviceWebId: deviceWebId,
    privateNetworkAccess: true,
  },
  capabilities: [ 'cash-drawer.open' ],
  roleConstraints: {
    allowedRoleIris: [ cashierRole, managerRole ],
    allowedAgentWebIds: [ operatorWebId ],
    sessionMode: 'solid-oidc-bound',
    requireActiveSession: true,
    maxSessionAgeSeconds: 12 * 60 * 60,
  },
  execution: {
    tier: 'native-edge',
    browserHardwareAccess: false,
    transportSecurity: 'mutual-tls-direct',
  },
};

describe('Native POS device contract', (): void => {
  it('declares an opt-in IPMS module surface without touching browser hardware.', (): void => {
    expect(NATIVE_POS_DEVICE_MODULE_MANIFEST.id).toBe('pos.native-edge-devices');
    expect(NATIVE_POS_DEVICE_MODULE_MANIFEST.capabilities).toContain('cash-drawer.open');
    expect(NATIVE_POS_DEVICE_MODULE_MANIFEST.routes).toEqual([ '/pos/devices', '/pos/jobs' ]);
  });

  it('describes native-edge capabilities for each POS device kind.', (): void => {
    expect(capabilitiesForNativePosDevice('cash-drawer').map((capability): string => capability.id))
      .toEqual([ 'cash-drawer.open' ]);
    expect(capabilitiesForNativePosDevice('receipt-printer').map((capability): string => capability.id))
      .toEqual([ 'receipt-printer.print-receipt', 'receipt-printer.cut-paper' ]);
    expect(capabilitiesForNativePosDevice('customer-display').map((capability): string => capability.id))
      .toEqual([ 'customer-display.show-text', 'customer-display.show-total' ]);
    expect(capabilitiesForNativePosDevice('pos-terminal').map((capability): string => capability.id))
      .toEqual([ 'pos-terminal.request-payment', 'pos-terminal.cancel-payment' ]);
  });

  it('validates direct-TLS mTLS device WebID descriptors.', (): void => {
    expect(validateNativePosDeviceDescriptor(cashDrawer)).toEqual(cashDrawer);
  });

  it('rejects browser or local non-TLS device channels.', (): void => {
    expect((): unknown => validateNativePosDeviceDescriptor({
      ...cashDrawer,
      endpoint: {
        ...cashDrawer.endpoint,
        url: 'http://localhost:9443/devices/drawer-1',
      },
    })).toThrow('endpoint url must be an HTTPS IRI');

    expect((): unknown => validateNativePosDeviceDescriptor({
      ...cashDrawer,
      execution: {
        ...cashDrawer.execution,
        browserHardwareAccess: true,
      },
    } as unknown as NativePosDeviceDescriptor)).toThrow('browserHardwareAccess must be false');
  });

  it('rejects descriptors where the client certificate WebID does not bind to the device WebID.', (): void => {
    expect((): unknown => validateNativePosDeviceDescriptor({
      ...cashDrawer,
      endpoint: {
        ...cashDrawer.endpoint,
        mtlsDeviceWebId: 'https://devices.example/pos/other#device',
      },
    })).toThrow('mTLS device WebID must match');
  });

  it('rejects capabilities that do not belong to the described device kind.', (): void => {
    expect((): unknown => validateNativePosDeviceDescriptor({
      ...cashDrawer,
      capabilities: [ 'receipt-printer.print-receipt' ],
    })).toThrow('is not valid for cash-drawer');
  });

  it('builds a queued cash drawer open job with role and session constraints.', (): void => {
    const job = buildOpenCashDrawerJob({
      id: 'open-drawer-2026-07-19-001',
      descriptor: cashDrawer,
      requestedBy: operatorWebId,
      operatorSession: session,
      createdAt: '2026-07-19T09:30:00.000Z',
      reason: 'cash sale',
      registerId: 'front-register',
      pulseMs: 120,
    });

    expect(job).toMatchObject({
      deviceId: 'front-register.drawer-1',
      deviceWebId,
      command: 'cash-drawer.open',
      status: 'queued',
      requestedBy: operatorWebId,
      execution: {
        tier: 'native-edge',
        browserHardwareAccess: false,
        transportSecurity: 'mutual-tls-direct',
      },
      parameters: {
        reason: 'cash sale',
        registerId: 'front-register',
        pulseMs: 120,
      },
    });
  });

  it('rejects cash drawer jobs for the wrong device kind.', (): void => {
    expect((): unknown => buildOpenCashDrawerJob({
      id: 'open-drawer-2026-07-19-001',
      descriptor: {
        ...cashDrawer,
        kind: 'receipt-printer',
        capabilities: [ 'receipt-printer.print-receipt' ],
      },
      requestedBy: operatorWebId,
      operatorSession: session,
      createdAt: '2026-07-19T09:30:00.000Z',
      reason: 'cash sale',
    })).toThrow('require a cash-drawer device');
  });

  it('rejects jobs with stale, expired, or mismatched operator sessions.', (): void => {
    expect((): unknown => validateNativePosDeviceJob({
      ...buildOpenCashDrawerJob({
        id: 'open-drawer-2026-07-19-001',
        descriptor: cashDrawer,
        requestedBy: operatorWebId,
        operatorSession: session,
        createdAt: '2026-07-19T09:30:00.000Z',
        reason: 'cash sale',
      }),
      operatorSession: {
        ...session,
        roleIri: 'https://pods.example/.databox/ipms/roles/viewer',
      },
    }, cashDrawer)).toThrow('role is not allowed');

    expect((): unknown => buildOpenCashDrawerJob({
      id: 'open-drawer-2026-07-19-002',
      descriptor: cashDrawer,
      requestedBy: operatorWebId,
      operatorSession: {
        ...session,
        expiresAt: '2026-07-19T09:15:00.000Z',
      },
      createdAt: '2026-07-19T09:30:00.000Z',
      reason: 'cash sale',
    })).toThrow('session is expired');

    expect((): unknown => buildOpenCashDrawerJob({
      id: 'open-drawer-2026-07-19-003',
      descriptor: cashDrawer,
      requestedBy: 'https://staff.example/bob#me',
      operatorSession: session,
      createdAt: '2026-07-19T09:30:00.000Z',
      reason: 'cash sale',
    })).toThrow('requestedBy must match');
  });

  it('round-trips device descriptors and jobs as ordinary Turtle resources.', async(): Promise<void> => {
    const descriptorTurtle = await serializeNativePosDeviceDescriptorToTurtle(cashDrawer, {
      subjectIri: 'https://pods.example/.well-known/databox-ipms/pos/devices/drawer-1.ttl#device',
    });
    const job = buildOpenCashDrawerJob({
      id: 'open-drawer-2026-07-19-001',
      descriptor: cashDrawer,
      requestedBy: operatorWebId,
      operatorSession: session,
      createdAt: '2026-07-19T09:30:00.000Z',
      reason: 'cash sale',
      registerId: 'front-register',
      pulseMs: 120,
    });
    const jobTurtle = await serializeNativePosDeviceJobToTurtle(job, {
      subjectIri: 'https://pods.example/.well-known/databox-ipms/pos/jobs/open-drawer.ttl#job',
    });

    expect(descriptorTurtle).toContain('ipms:NativePosDeviceDescriptor');
    expect(descriptorTurtle).toContain('cash-drawer.open');
    expect(parseNativePosDeviceDescriptorRdf(descriptorTurtle, {
      subjectIri: 'https://pods.example/.well-known/databox-ipms/pos/devices/drawer-1.ttl#device',
    })).toEqual(cashDrawer);

    expect(jobTurtle).toContain('ipms:NativePosDeviceJob');
    expect(jobTurtle).toContain('cash-drawer.open');
    expect(parseNativePosDeviceJobRdf(jobTurtle, {
      subjectIri: 'https://pods.example/.well-known/databox-ipms/pos/jobs/open-drawer.ttl#job',
    })).toEqual(job);
  });

  it('keeps native runtime details non-portable and rejects inline secrets.', (): void => {
    expect(toNativePosRuntimeWorkDescriptor({
      deviceId: 'front-register.drawer-1',
      engineId: 'rust-pos-edge',
      implementation: 'rust-native-edge',
      version: '0.1.0',
      secretRefs: [ 'solid-secret://pos/drawer-1/client-cert' ],
      runtimeHints: {
        devicePath: 'COM4',
      },
    })).toEqual({
      kind: 'native-pos-runtime-descriptor',
      deviceId: 'front-register.drawer-1',
      portability: 'non-portable',
      engineId: 'rust-pos-edge',
      implementation: 'rust-native-edge',
      secretRefCount: 1,
      runtimeHintKeys: [ 'devicePath' ],
    });

    expect(validateNativePosRuntimeDescriptor({
      deviceId: 'front-register.drawer-1',
      engineId: 'rust-pos-edge',
      implementation: 'os-service',
      secretRefs: [ 'vault://databox/pos-drawer-cert' ],
    }).implementation).toBe('os-service');

    expect((): unknown => validateNativePosRuntimeDescriptor({
      deviceId: 'front-register.drawer-1',
      engineId: 'rust-pos-edge',
      implementation: 'browser-webusb',
      secretRefs: [],
    } as unknown as Parameters<typeof validateNativePosRuntimeDescriptor>[0])).toThrow('implementation must be one of');

    expect((): unknown => validateNativePosRuntimeDescriptor({
      deviceId: 'front-register.drawer-1',
      engineId: 'rust-pos-edge',
      implementation: 'rust-native-edge',
      secretRefs: [],
      runtimeHints: {
        privateKey: '-----BEGIN PRIVATE KEY-----',
      },
    })).toThrow('must not inline secrets');
  });
});
