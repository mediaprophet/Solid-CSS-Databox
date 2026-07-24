import type { NativePosDeviceDescriptor, NativePosOperatorSession } from
  '../../../../../../src/databox/ipms/modules/pos/NativePosDeviceContract';
import {
  bindingFromDeviceDescriptor,
  CASH_REGISTER_MODULE_MANIFEST,
  closeCashRegisterSession,
  openCashRegisterSession,
  validateAuditReceiptDescriptor,
  validateOfflineQueue,
  validateOfflineQueueEntry,
} from '../../../../../../src/databox/ipms/modules/pos/CashRegister';

const operatorWebId = 'https://staff.example/alice#me';
const managerWebId = 'https://staff.example/manager#me';
const cashierRole = 'https://pods.example/.databox/ipms/roles/cashier';
const deviceWebId = 'https://devices.example/pos/drawer-1#device';
const digest = `urn:sha256:${'a'.repeat(64)}`;
const secondDigest = `urn:sha256:${'b'.repeat(64)}`;

const operatorSession: NativePosOperatorSession = {
  sessionId: 'operator-session-1',
  webId: operatorWebId,
  roleIri: cashierRole,
  startedAt: '2026-07-19T08:55:00.000Z',
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
  },
  capabilities: [ 'cash-drawer.open' ],
  roleConstraints: {
    allowedRoleIris: [ cashierRole ],
    allowedAgentWebIds: [ operatorWebId ],
    sessionMode: 'solid-oidc-bound',
    requireActiveSession: true,
  },
  execution: {
    tier: 'native-edge',
    browserHardwareAccess: false,
    transportSecurity: 'mutual-tls-direct',
  },
};

describe('cash register module manifest', (): void => {
  it('declares portable register, queue, native job, and audit receipt surfaces.', (): void => {
    expect(CASH_REGISTER_MODULE_MANIFEST.id).toBe('pos.cash-register');
    expect(CASH_REGISTER_MODULE_MANIFEST.capabilities).toEqual(expect.arrayContaining([
      'pos:cash-register-open',
      'pos:cash-register-close',
      'pos:cash-drawer-job',
      'pos:offline-queue',
      'pos:audit-receipt',
    ]));
    expect(CASH_REGISTER_MODULE_MANIFEST.routes).toEqual([
      'POST /.databox/ipms/pos/register/sessions',
      'GET /.databox/ipms/pos/register/sessions',
    ]);
  });
});

describe('openCashRegisterSession', (): void => {
  it('opens a portable register session and queues a WebID-bound native drawer job.', (): void => {
    const result = openCashRegisterSession({
      sessionId: 'register-session-1',
      registerId: 'front-register',
      registerName: 'Front Register',
      registerLocation: 'Front counter',
      operatorSession,
      openedAt: '2026-07-19T09:00:00.000Z',
      currency: 'aud',
      openingFloat: 150,
      cashDrawer,
      openDrawerJobId: 'drawer-open-1',
      offlineQueue: {
        queueId: 'https://pods.example/.databox/ipms/pos/offline/front-register',
        storage: 'solid-container',
        storageLocation: 'https://pods.example/.databox/ipms/pos/offline/',
        replayPolicy: 'fifo-idempotent',
        maxRetentionSeconds: 86_400,
        entries: [
          {
            entryId: 'offline-entry-1',
            operation: 'order.create',
            targetResource: 'https://pods.example/orders/1',
            payloadDigest: digest,
            idempotencyKey: 'shop-1/front-register/order/1',
            createdAt: '2026-07-19T09:01:00.000Z',
            status: 'queued',
          },
        ],
      },
      auditReceipt: {
        receiptId: 'https://pods.example/.databox/ipms/pos/audit/register-open-1',
        kind: 'register-open',
        issuedAt: '2026-07-19T09:00:01.000Z',
        issuerWebId: operatorWebId,
        subjectResource: 'urn:solid-server:databox:ipms:pos:cash-register-session:register-session-1',
        payloadDigest: secondDigest,
        relatedJobIds: [ 'drawer-open-1' ],
      },
    });

    expect(result.session).toMatchObject({
      sessionId: 'register-session-1',
      registerId: 'front-register',
      state: 'open',
      currency: 'AUD',
      openingFloat: 150,
      expectedCash: 150,
    });
    expect(result.session.offlineQueue?.pendingCount).toBe(1);
    expect(result.session.deviceBindings).toEqual([ bindingFromDeviceDescriptor(cashDrawer) ]);
    expect(result.queuedJobs).toHaveLength(1);
    expect(result.queuedJobs[0]).toMatchObject({
      id: 'drawer-open-1',
      command: 'cash-drawer.open',
      deviceId: 'front-register.drawer-1',
      deviceWebId,
      requestedBy: operatorWebId,
      status: 'queued',
    });
    expect(result.record['@type']).toBe('SaleEvent');
    expect(result.record.instrument).toEqual([
      expect.objectContaining({
        identifier: 'front-register.drawer-1',
        sameAs: deviceWebId,
      }),
    ]);
  });

  it('rejects expired operator sessions and mismatched device capabilities.', (): void => {
    expect((): unknown => openCashRegisterSession({
      sessionId: 'register-session-1',
      registerId: 'front-register',
      registerName: 'Front Register',
      operatorSession: {
        ...operatorSession,
        expiresAt: '2026-07-19T08:59:59.000Z',
      },
      openedAt: '2026-07-19T09:00:00.000Z',
      currency: 'AUD',
      openingFloat: 150,
    })).toThrow('operator session must be active');

    expect((): unknown => openCashRegisterSession({
      sessionId: 'register-session-1',
      registerId: 'front-register',
      registerName: 'Front Register',
      operatorSession,
      openedAt: '2026-07-19T09:00:00.000Z',
      currency: 'AUD',
      openingFloat: 150,
      deviceBindings: [
        {
          deviceId: 'printer-1',
          kind: 'receipt-printer',
          deviceWebId: 'https://devices.example/pos/printer-1#device',
          capabilities: [ 'cash-drawer.open' ],
        },
      ],
    })).toThrow('receipt-printer binding cannot advertise cash-drawer.open');
  });
});

describe('closeCashRegisterSession', (): void => {
  it('closes an open session, computes expected cash and keeps an audit receipt descriptor.', (): void => {
    const opened = openCashRegisterSession({
      sessionId: 'register-session-1',
      registerId: 'front-register',
      registerName: 'Front Register',
      operatorSession,
      openedAt: '2026-07-19T09:00:00.000Z',
      currency: 'AUD',
      openingFloat: 150,
      cashDrawer,
    });

    const closed = closeCashRegisterSession({
      session: opened.session,
      closedAt: '2026-07-19T17:00:00.000Z',
      closedBy: managerWebId,
      closeReason: 'end-of-shift',
      cashSalesTotal: 250.25,
      cashRefundsTotal: 10,
      paidInTotal: 5,
      paidOutTotal: 20,
      countedCash: 375,
      auditReceipt: {
        receiptId: 'https://pods.example/.databox/ipms/pos/audit/register-close-1',
        kind: 'register-close',
        issuedAt: '2026-07-19T17:00:01.000Z',
        issuerWebId: managerWebId,
        subjectResource: 'urn:solid-server:databox:ipms:pos:cash-register-session:register-session-1',
        payloadDigest: digest,
        evidenceResources: [ 'https://pods.example/.databox/ipms/pos/evidence/count-1' ],
        digitalReceiptUrl: 'https://pods.example/receipts/register-close-1',
      },
    });

    expect(closed.session).toMatchObject({
      state: 'closed',
      expectedCash: 375.25,
      countedCash: 375,
      variance: -0.25,
      closedBy: managerWebId,
      closeReason: 'end-of-shift',
    });
    expect(closed.session.auditReceipts).toHaveLength(1);
    expect(closed.queuedJobs).toEqual([]);
    expect(closed.record.eventStatus).toBe('https://schema.org/EventCompleted');
  });

  it('rejects invalid close ordering and duplicate closes.', (): void => {
    const opened = openCashRegisterSession({
      sessionId: 'register-session-1',
      registerId: 'front-register',
      registerName: 'Front Register',
      operatorSession,
      openedAt: '2026-07-19T09:00:00.000Z',
      currency: 'AUD',
      openingFloat: 150,
    });

    expect((): unknown => closeCashRegisterSession({
      session: opened.session,
      closedAt: '2026-07-19T08:59:00.000Z',
      closedBy: managerWebId,
      closeReason: 'end-of-shift',
      cashSalesTotal: 0,
      countedCash: 150,
    })).toThrow('closedAt must not be before openedAt');

    const closed = closeCashRegisterSession({
      session: opened.session,
      closedAt: '2026-07-19T17:00:00.000Z',
      closedBy: managerWebId,
      closeReason: 'end-of-shift',
      cashSalesTotal: 0,
      countedCash: 150,
    });
    expect((): unknown => closeCashRegisterSession({
      session: closed.session,
      closedAt: '2026-07-19T17:30:00.000Z',
      closedBy: managerWebId,
      closeReason: 'manager-close',
      cashSalesTotal: 0,
      countedCash: 150,
    })).toThrow('only be closed from the open state');
  });
});

describe('offline queue and audit receipt descriptors', (): void => {
  it('validates encrypted local queues without requiring a live hardware implementation.', (): void => {
    expect(validateOfflineQueue({
      queueId: 'https://pods.example/.databox/ipms/pos/offline/front-register',
      storage: 'encrypted-local-spool',
      storageLocation: 'pos-spool-front-register',
      replayPolicy: 'operator-review-required',
      maxRetentionSeconds: 3_600,
      entries: [
        {
          entryId: 'entry-1',
          operation: 'printer.print',
          targetResource: 'https://pods.example/receipts/1',
          payloadDigest: digest,
          idempotencyKey: 'shop-1/front-register/receipt/1',
          createdAt: '2026-07-19T09:10:00.000Z',
          status: 'failed',
          retryCount: 2,
          lastError: 'printer offline',
        },
        {
          entryId: 'entry-2',
          operation: 'receipt.issue',
          targetResource: 'https://pods.example/receipts/2',
          payloadDigest: secondDigest,
          idempotencyKey: 'shop-1/front-register/receipt/2',
          createdAt: '2026-07-19T09:11:00.000Z',
          status: 'synced',
        },
      ],
    }).pendingCount).toBe(1);
  });

  it('rejects non-digest payloads, inline secrets, and card-like data.', (): void => {
    expect((): unknown => validateOfflineQueueEntry({
      entryId: 'entry-1',
      operation: 'payment.handoff',
      targetResource: 'https://pods.example/payments/1',
      payloadDigest: 'raw-json-body',
      idempotencyKey: 'payment-1',
      createdAt: '2026-07-19T09:10:00.000Z',
      status: 'queued',
    })).toThrow('payloadDigest must be a lowercase urn:sha256 digest');

    expect((): unknown => validateOfflineQueueEntry({
      entryId: 'entry-1',
      operation: 'payment.handoff',
      targetResource: 'https://pods.example/payments/1',
      payloadDigest: digest,
      idempotencyKey: 'cardNumber=4111111111111111',
      createdAt: '2026-07-19T09:10:00.000Z',
      status: 'queued',
    })).toThrow('must not inline secrets');
  });

  it('validates audit receipt descriptors as portable offline-verifiable references.', (): void => {
    expect(validateAuditReceiptDescriptor({
      receiptId: 'https://pods.example/.databox/ipms/pos/audit/drawer-open-1',
      kind: 'drawer-open',
      issuedAt: '2026-07-19T09:00:01.000Z',
      issuerWebId: operatorWebId,
      subjectResource: 'urn:solid-server:databox:ipms:pos:cash-register-session:register-session-1',
      payloadDigest: digest,
      relatedJobIds: [ 'drawer-open-1' ],
      evidenceResources: [ 'https://pods.example/evidence/drawer-open-1' ],
      printableReceiptUrl: 'https://pods.example/receipts/drawer-open-1.pdf',
    })).toMatchObject({
      kind: 'drawer-open',
      payloadDigest: digest,
      relatedJobIds: [ 'drawer-open-1' ],
    });

    expect((): unknown => validateAuditReceiptDescriptor({
      receiptId: 'https://pods.example/.databox/ipms/pos/audit/drawer-open-1',
      kind: 'drawer-open',
      issuedAt: '2026-07-19T09:00:01.000Z',
      issuerWebId: 'http://staff.example/alice#me',
      subjectResource: 'urn:solid-server:databox:ipms:pos:cash-register-session:register-session-1',
      payloadDigest: digest,
    })).toThrow('issuerWebId must be an HTTPS URI');
  });
});
