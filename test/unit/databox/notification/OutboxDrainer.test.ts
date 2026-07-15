import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { buildAuditRecord } from '../../../../src/databox/evidence/AuditEvidence';
import { HashChainedEvidenceLedger } from '../../../../src/databox/evidence/EvidenceLedgerStore';
import { RetentionBoundedCursorFeed } from '../../../../src/databox/feed/CursorFeed';
import type {
  DeliveryAttemptResult,
  OutboundNotificationChannel,
} from '../../../../src/databox/notification/OutboundNotificationChannel';
import type { OutboxDrainerOptions } from '../../../../src/databox/notification/OutboxDrainer';
import { LedgerOutboxSource, OutboxDrainer } from '../../../../src/databox/notification/OutboxDrainer';
import { DutyEngine } from '../../../../src/databox/policy/DutyEngine';
import { DBX_DUTIES } from '../../../../src/databox/odrl/terms';
import { CONTEXT, fixedClock, outbox, POLICY, recordingSleep } from './NotificationTestSupport';

/** A channel scripted with a queue of per-attempt outcomes (default: always accept). */
function scriptedChannel(outcomes: boolean[] = []): {
  channel: OutboundNotificationChannel;
  endpoints: string[];
} {
  const endpoints: string[] = [];
  let call = 0;
  const channel: OutboundNotificationChannel = {
    deliver: async(endpoint: string): Promise<DeliveryAttemptResult> => {
      endpoints.push(endpoint);
      const accepted = call < outcomes.length ? outcomes[call] : true;
      call += 1;
      return { accepted, status: accepted ? 200 : 503, reason: accepted ? 'channel-accepted' : 'channel-rejected' };
    },
  };
  return { channel, endpoints };
}

function drainer(overrides: Partial<OutboxDrainerOptions> = {}): OutboxDrainer {
  const { channel } = scriptedChannel();
  return new OutboxDrainer({
    source: { drain: (): [] => [], tenants: (): [] => []},
    channel,
    endpoints: [ 'https://consumer.example/hook' ],
    now: fixedClock(),
    ...overrides,
  });
}

/** A ledger seeded with one committed entry + outbox record per event number. */
async function seededLedger(count: number, tenantId = 't1'): Promise<HashChainedEvidenceLedger> {
  const ledger = new HashChainedEvidenceLedger(fixedClock());
  for (let n = 1; n <= count; n++) {
    const record = buildAuditRecord({
      kind: 'deposit-accepted',
      decision: 'allow',
      reasonCode: 'ok',
      operation: 'deposit',
      targetDigest: `opaque:res-${n}`,
      policy: POLICY,
    }, CONTEXT);
    await ledger.append({ tenantId, record, outbox: outbox(n, tenantId) });
  }
  return ledger;
}

describe('OutboxDrainer construction', (): void => {
  it('requires at least one endpoint.', (): void => {
    expect((): unknown => drainer({ endpoints: []})).toThrow(BadRequestHttpError);
  });
});

describe('LedgerOutboxSource', (): void => {
  it('drains only the committed outbox records, in commit order.', async(): Promise<void> => {
    const source = new LedgerOutboxSource(await seededLedger(3));
    expect(source.tenants()).toStrictEqual([ 't1' ]);
    expect(source.drain('t1').map((r): string => r.eventId)).toStrictEqual([ 'evt-1', 'evt-2', 'evt-3' ]);
  });

  it('skips entries with no outbox record.', async(): Promise<void> => {
    const ledger = new HashChainedEvidenceLedger(fixedClock());
    const record = buildAuditRecord({
      kind: 'access-denied',
      decision: 'deny',
      reasonCode: 'nope',
      operation: 'read',
      targetDigest: 'opaque:x',
      policy: POLICY,
    }, CONTEXT);
    await ledger.append({ tenantId: 't1', record });
    expect(new LedgerOutboxSource(ledger).drain('t1')).toHaveLength(0);
  });
});

describe('OutboxDrainer.deliver', (): void => {
  it('accepts on the first successful attempt (no backoff).', async(): Promise<void> => {
    const { channel } = scriptedChannel([ true ]);
    const sleep = recordingSleep();
    const worker = drainer({ channel, sleep: sleep.sleep });
    const evidence = await worker.deliver(outbox(1));
    expect(evidence.outcome).toBe('accepted');
    expect(evidence.attempts).toBe(1);
    expect(sleep.waits).toStrictEqual([]);
    expect(worker.evidence('t1', 'evt-1')).toBe(evidence);
  });

  it('retries with BOUNDED backoff and endpoint ROTATION, then accepts.', async(): Promise<void> => {
    const { channel, endpoints } = scriptedChannel([ false, false, true ]);
    const sleep = recordingSleep();
    const worker = drainer({
      channel,
      endpoints: [ 'https://a.example/h', 'https://b.example/h' ],
      backoffBaseMs: 100,
      backoffCeilingMs: 150,
      sleep: sleep.sleep,
    });
    const evidence = await worker.deliver(outbox(1));
    expect(evidence.outcome).toBe('accepted');
    expect(evidence.attempts).toBe(3);
    // Endpoint rotation across attempts (a, b, a).
    expect(endpoints).toStrictEqual([ 'https://a.example/h', 'https://b.example/h', 'https://a.example/h' ]);
    expect(evidence.endpointsTried).toStrictEqual(endpoints);
    // Backoff is exponential but CAPPED at the ceiling (100, then min(2*100, 150) = 150).
    expect(sleep.waits).toStrictEqual([ 100, 150 ]);
    expect(evidence.backoffMs).toStrictEqual([ 100, 150 ]);
  });

  it('fails after exhausting maxAttempts (bounded flood, T-40) and records failed.', async(): Promise<void> => {
    const { channel } = scriptedChannel([ false, false, false ]);
    const sleep = recordingSleep();
    const worker = drainer({ channel, maxAttempts: 3, sleep: sleep.sleep });
    const evidence = await worker.deliver(outbox(1));
    expect(evidence.outcome).toBe('failed');
    expect(evidence.attempts).toBe(3);
    // Backoff happens BETWEEN attempts only — two waits for three attempts.
    expect(sleep.waits).toHaveLength(2);
  });

  it('dedups: a settled event is never re-attempted (exactly-once side effect).', async(): Promise<void> => {
    const deliver = jest.fn(async(): Promise<DeliveryAttemptResult> =>
      ({ accepted: true, status: 200, reason: 'channel-accepted' }));
    const worker = drainer({ channel: { deliver }, sleep: recordingSleep().sleep });
    const first = await worker.deliver(outbox(1));
    const second = await worker.deliver(outbox(1));
    expect(second).toBe(first);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('M2: concurrent deliver() for the same event pushes + settles EXACTLY once.', async(): Promise<void> => {
    // A slow channel keeps the first delivery in flight so the second call overlaps it.
    const deliver = jest.fn(async(): Promise<DeliveryAttemptResult> => {
      await new Promise((resolve): void => {
        setTimeout(resolve, 5);
      });
      return { accepted: true, status: 200, reason: 'channel-accepted' };
    });
    const worker = drainer({ channel: { deliver }, sleep: recordingSleep().sleep });
    const [ a, b ] = await Promise.all([ worker.deliver(outbox(1)), worker.deliver(outbox(1)) ]);
    // One shared push, one shared settlement — no duplicate push, no racy evidence overwrite.
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(worker.evidence('t1', 'evt-1')).toBe(a);
  });

  it('returns undefined evidence for an event never delivered here.', (): void => {
    expect(drainer().evidence('t1', 'evt-nope')).toBeUndefined();
  });

  it('uses a real timer when no sleep is injected (default backoff path).', async(): Promise<void> => {
    const { channel } = scriptedChannel([ false, true ]);
    // No `sleep` override -> the default setTimeout-based sleep runs (base 1ms keeps it fast).
    // Omit both `sleep` and `now` so the default timer + default ISO clock both run.
    const worker = drainer({ channel, sleep: undefined, now: undefined, backoffBaseMs: 1 });
    const evidence = await worker.deliver(outbox(1));
    expect(evidence.outcome).toBe('accepted');
    expect(evidence.attempts).toBe(2);
    expect(evidence.at).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });
});

describe('OutboxDrainer.drainTenant', (): void => {
  it('projects every committed event into the cursor feed, then delivers each.', async(): Promise<void> => {
    const source = new LedgerOutboxSource(await seededLedger(3));
    const feed = new RetentionBoundedCursorFeed();
    const worker = drainer({ source, projection: feed, sleep: recordingSleep().sleep });
    const results = await worker.drainTenant('t1');
    expect(results.map((r): string => r.outcome)).toStrictEqual([ 'accepted', 'accepted', 'accepted' ]);
    const page = await feed.pull('t1');
    expect(page.events.map((e): string => e.eventId)).toStrictEqual([ 'evt-1', 'evt-2', 'evt-3' ]);
  });

  it('a crash-restart re-drain neither loses nor duplicates a logical event.', async(): Promise<void> => {
    const source = new LedgerOutboxSource(await seededLedger(2));
    const feed = new RetentionBoundedCursorFeed();
    // First worker delivers, then "crashes" (its in-memory settled map is lost).
    await drainer({ source, projection: feed, sleep: recordingSleep().sleep }).drainTenant('t1');
    // A fresh worker re-drains the SAME durable outbox after restart.
    await drainer({ source, projection: feed, sleep: recordingSleep().sleep }).drainTenant('t1');
    // The feed dedups on eventId: still exactly two logical events, recoverable exactly once.
    const page = await feed.pull('t1');
    expect(page.events.map((e): string => e.eventId)).toStrictEqual([ 'evt-1', 'evt-2' ]);
  });

  it('delivers even without a projection configured.', async(): Promise<void> => {
    const source = new LedgerOutboxSource(await seededLedger(1));
    const results = await drainer({ source, sleep: recordingSleep().sleep }).drainTenant('t1');
    expect(results).toHaveLength(1);
  });
});

function coupling(): { engine: DutyEngine; ledger: HashChainedEvidenceLedger } {
  const ledger = new HashChainedEvidenceLedger(fixedClock());
  return { ledger, engine: new DutyEngine(ledger, { tenantId: 't1', context: CONTEXT, policy: POLICY }) };
}

describe('OutboxDrainer signalHolder duty coupling (T-39)', (): void => {
  it('acceptance drives the duty queued -> attempted -> accepted (fulfilled).', async(): Promise<void> => {
    const { engine } = coupling();
    const worker = drainer({ channel: scriptedChannel([ true ]).channel, sleep: recordingSleep().sleep });
    await engine.activate({ dutyId: 'd1', action: DBX_DUTIES.signalHolder, targetDigest: 'opaque:res-1' });
    const result = await engine.run('d1', worker.signalHolderHandler(outbox(1)));
    expect(result.instance.state).toBe('accepted');
  });

  it('delivery FAILURE keeps the duty unfulfilled + the deposit accepted (T-39).', async(): Promise<void> => {
    const { engine, ledger } = coupling();
    // The accepted deposit was committed as its own ledger entry (with an outbox record) BEFORE any push.
    const depositRecord = buildAuditRecord({
      kind: 'deposit-accepted',
      decision: 'allow',
      reasonCode: 'ok',
      operation: 'deposit',
      targetDigest: 'opaque:res-1',
      policy: POLICY,
    }, CONTEXT);
    await ledger.append({ tenantId: 't1', record: depositRecord, outbox: outbox(1) });
    const acceptedBefore = ledger.entries('t1').filter((e): boolean => e.record.kind === 'deposit-accepted');

    const worker = drainer({
      channel: scriptedChannel([ false, false, false, false, false ]).channel,
      sleep: recordingSleep().sleep,
    });
    await engine.activate({ dutyId: 'd1', action: DBX_DUTIES.signalHolder, targetDigest: 'opaque:res-1' });
    const result = await engine.run('d1', worker.signalHolderHandler(outbox(1)));

    // Duty failed => NOT fulfilled; deposit remains accepted and durable (never rolled back).
    expect(result.instance.state).toBe('failed');
    expect(worker.evidence('t1', 'evt-1')?.outcome).toBe('failed');
    const acceptedAfter = ledger.entries('t1').filter((e): boolean => e.record.kind === 'deposit-accepted');
    expect(acceptedAfter).toStrictEqual(acceptedBefore);
    expect(ledger.verify('t1').valid).toBe(true);
  });
});
