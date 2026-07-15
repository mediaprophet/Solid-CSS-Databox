import type { DepositRequest } from '../../../../src/databox/gateway/GatewayTypes';
import type { GatewayContext, GatewayOutcome } from '../../../../src/databox/gateway/DepositSubmissionGateway';
import { DepositSubmissionGateway } from '../../../../src/databox/gateway/DepositSubmissionGateway';
import { BinaryEvidenceQuarantine, FailClosedScanner } from '../../../../src/databox/gateway/BinaryEvidenceQuarantine';
import { IdempotencyRegistry } from '../../../../src/databox/gateway/IdempotencyRegistry';
import type { SourceEvent } from '../../../../src/databox/bridge/DataboxBridge';
import type { DurableCommit } from '../../../../src/databox/receipt/DurableCommit';
import { ForbiddenHttpError } from '../../../../src/util/errors/ForbiddenHttpError';
import {
  AGENCY_IDENTITY,
  agencyKey,
  generateEs256KeyPair,
  loadAgencyProfile,
  loadRetailProfile,
  makeBridge,
  makePlane,
  provision,
  RETAIL_IDENTITY,
  retailKey,
} from './BridgeTestHarness';

const SECRET = 'CUSTOMER-SECRET-42';

function receiptEvent(overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    organisation: 'org-retailco',
    program: 'prog-retailco-loyalty',
    sourceSystem: 'sor-pos',
    eventType: 'receipt',
    sourceEventId: 'evt-0001',
    customerIdNamespace: 'loyalty',
    customerId: SECRET,
    recordClass: 'rc-receipt',
    legalBasis: 'lb-contract',
    purpose: 'p-account',
    payload: {
      receiptId: 'rcpt-syn-1',
      totalInclTax: 42.85,
      lineItems: [{ productRef: 'sku-syn-kettle', warrantyRef: 'warr-syn-1', allergens: [ 'none' ]}],
    },
    ...overrides,
  };
}

function recallEvent(): SourceEvent {
  return receiptEvent({
    eventType: 'recall',
    sourceEventId: 'evt-0003',
    recordClass: 'rc-recall',
    legalBasis: 'lb-legal-obligation',
    purpose: 'p-safety',
    supersedes: { sourceEventId: 'evt-0001', resource: 'https://databox.example/boxes/x/records/rc-receipt/rec-old' },
    payload: { recallId: 'recall-syn-1', productRef: 'sku-syn-kettle', remedy: 'refund-or-replace' },
  });
}

function serviceNoticeEvent(): SourceEvent {
  return {
    organisation: 'org-agencyco',
    program: 'prog-agencyco-services',
    sourceSystem: 'sor-catalog',
    eventType: 'service-notice',
    sourceEventId: 'evt-a-0001',
    customerIdNamespace: 'agency',
    customerId: 'CLIENT-SECRET-99',
    recordClass: 'rc-service-notice',
    legalBasis: 'lb-legal-obligation',
    purpose: 'p-safety',
    payload: { noticeId: 'notice-syn-1', subject: 'Synthetic service notice' },
  };
}

describe('A DataboxBridge', (): void => {
  describe('depositing RetailCo records', (): void => {
    it('resolves, deposits through the gateway and retains a signed receipt.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      await provision(plane, profile, retailKey(SECRET));
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      outbox.commit(receiptEvent());

      const reports = await bridge.drain();

      expect(reports).toHaveLength(1);
      const report = reports[0];
      expect(report.status).toBe('reconciled');
      if (report.status !== 'reconciled') {
        throw new Error('expected reconciled');
      }
      expect(report.reconciliation.receiptId).toBe(report.receipt.receiptId);
      expect(report.reconciliation.idempotencyKey).toBeDefined();
      expect(report.receipt.credential.credentialSubject.receipt.sender).toBe(RETAIL_IDENTITY.issuer);
      expect(report.receipt.credential.credentialSubject.receipt.operation).toBe('deposit');
      expect(bridge.retainedReceipt('evt-0001')).toBe(report.receipt);
      expect(outbox.reconciliation('evt-0001')?.status).toBe('reconciled');
    });

    it('handles multiple record classes including a recall in the same box.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      await provision(plane, profile, retailKey(SECRET));
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      outbox.commit(receiptEvent());
      outbox.commit(recallEvent());

      const reports = await bridge.drain();

      expect(reports.map((report): string => report.status)).toStrictEqual([ 'reconciled', 'reconciled' ]);
      // The two records land in the SAME opaque box (same relationship) but under different class containers.
      expect(bridge.retainedReceipt('evt-0001')).toBeDefined();
      expect(bridge.retainedReceipt('evt-0003')).toBeDefined();
    });
  });

  describe('idempotency (T-24)', (): void => {
    it('creates no duplicate logical receipt when a source event is replayed.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      await provision(plane, profile, retailKey(SECRET));
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      outbox.commit(receiptEvent());

      const first = await bridge.drain();
      // Re-commit the SAME source-event tuple (a source retry) — one committed row, no second business event.
      outbox.commit(receiptEvent());
      const second = await bridge.drain();

      const original = first[0];
      if (original.status !== 'reconciled') {
        throw new Error('expected reconciled');
      }
      // The row is already reconciled, so the drain finds nothing new.
      expect(second).toHaveLength(0);
      // A direct re-deposit hits the gateway duplicate path and returns the ORIGINAL receipt (no second one).
      const replay = await bridge.deposit(receiptEvent());
      if (replay.status !== 'reconciled') {
        throw new Error('expected reconciled');
      }
      expect(replay.receipt.receiptId).toBe(original.receipt.receiptId);
    });
  });

  describe('privacy (invariant 2)', (): void => {
    it('keeps the raw customerID out of the record, its URI and the receipt.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      await provision(plane, profile, retailKey(SECRET));

      // A spy gateway captures the exact deposited body while still validating for real.
      class SpyGateway extends DepositSubmissionGateway {
        public lastBody?: Buffer;
        public lastTarget?: string;
        public async validateDeposit(request: DepositRequest, context: GatewayContext): Promise<GatewayOutcome> {
          this.lastBody = request.body;
          this.lastTarget = request.target;
          return super.validateDeposit(request, context);
        }
      }
      const gateway = new SpyGateway(new IdempotencyRegistry(), new BinaryEvidenceQuarantine(new FailClosedScanner()));
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
        gateway,
      });
      outbox.commit(receiptEvent());
      const [ report ] = await bridge.drain();
      if (report.status !== 'reconciled') {
        throw new Error('expected reconciled');
      }

      expect(gateway.lastBody?.toString('utf8')).not.toContain(SECRET);
      expect(gateway.lastTarget).not.toContain(SECRET);
      expect(report.reconciliation.acceptedResource).not.toContain(SECRET);
      expect(report.receipt.jws).not.toContain(SECRET);
      expect(JSON.stringify(report.receipt.credential)).not.toContain(SECRET);
    });
  });

  describe('cross-program isolation (T-02)', (): void => {
    it('refuses to deposit an event belonging to another program.', async(): Promise<void> => {
      const plane = makePlane();
      const { bridge } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile: loadRetailProfile(),
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      await expect(bridge.deposit(serviceNoticeEvent())).rejects.toThrow(ForbiddenHttpError);
    });
  });

  describe('failure is observable and recoverable', (): void => {
    it('quarantines an unresolvable mapping and resumes once provisioned.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      outbox.commit(receiptEvent());

      const first = await bridge.drain();
      expect(first[0].status).toBe('unresolved');
      expect(first[0].reconciliation.reason).toBe('mapping-unresolved');

      // Provision the mapping, then re-drain: the pending row resumes and reconciles.
      await provision(plane, profile, retailKey(SECRET));
      const second = await bridge.drain();
      expect(second[0].status).toBe('reconciled');
    });

    it('records a durable-commit failure and resumes to one receipt on re-drain.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      await provision(plane, profile, retailKey(SECRET));
      let calls = 0;
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
        clock: (): string => '2026-07-15T01:00:00.000Z',
        durableCommit: (input): DurableCommit => {
          calls += 1;
          if (calls === 1) {
            throw new Error('durable store unavailable');
          }
          return {
            eventId: input.eventId,
            committedAt: input.committedAt,
            payloadDigest: input.payloadDigest,
            confirmed: true,
          };
        },
      });
      outbox.commit(receiptEvent());

      const first = await bridge.drain();
      expect(first[0].status).toBe('failed');
      expect(first[0].reconciliation.reason).toBe('deposit-failed');
      expect(bridge.retainedReceipt('evt-0001')).toBeUndefined();

      const second = await bridge.drain();
      expect(second[0].status).toBe('reconciled');
      expect(bridge.retainedReceipt('evt-0001')).toBeDefined();
    });

    it('fails closed on an unknown record class.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      await provision(plane, profile, retailKey(SECRET));
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      outbox.commit(receiptEvent({ recordClass: 'rc-nonexistent', sourceEventId: 'evt-x' }));
      const [ report ] = await bridge.drain();
      expect(report.status).toBe('failed');
      expect(report.reconciliation.reason).toBe('unknown-record-class');
    });

    it('records a gateway rejection (wrong purpose) as an observable failure.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadRetailProfile();
      await provision(plane, profile, retailKey(SECRET));
      const { bridge, outbox } = makeBridge({
        identity: RETAIL_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      outbox.commit(receiptEvent({ purpose: 'p-warranty', sourceEventId: 'evt-wp' }));
      const [ report ] = await bridge.drain();
      expect(report.status).toBe('failed');
      expect(report.reconciliation.reason).toContain('purpose-not-permitted');
    });
  });

  describe('AgencyCo bridge (second synthetic source)', (): void => {
    it('deposits a synthetic service notice through its own program bridge.', async(): Promise<void> => {
      const plane = makePlane();
      const profile = loadAgencyProfile();
      await provision(plane, profile, agencyKey('CLIENT-SECRET-99'));
      const { bridge, outbox } = makeBridge({
        identity: AGENCY_IDENTITY,
        profile,
        registry: plane.registry,
        keys: generateEs256KeyPair(),
      });
      outbox.commit(serviceNoticeEvent());
      const [ report ] = await bridge.drain();
      expect(report.status).toBe('reconciled');
    });
  });
});
