import type { SourceEvent } from '../../../../src/databox/bridge/BridgeTypes';
import { InMemorySourceOutbox } from '../../../../src/databox/bridge/SourceOutbox';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';

function event(overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    organisation: 'org-a',
    program: 'prog-a',
    sourceSystem: 'sys-1',
    eventType: 'receipt',
    sourceEventId: 'evt-1',
    customerIdNamespace: 'ns',
    customerId: 'cust-1',
    recordClass: 'rc-receipt',
    legalBasis: 'lb-contract',
    purpose: 'p-account',
    payload: { a: 1 },
    ...overrides,
  };
}

describe('An InMemorySourceOutbox', (): void => {
  it('commits a business event + outbox row atomically and drains it in scope.', (): void => {
    const outbox = new InMemorySourceOutbox({ clock: (): string => '2026-07-15T00:00:00.000Z' });
    const committed = outbox.commit(event());
    expect(committed.businessRecordId).toMatch(/^src-[0-9a-f]{24}$/u);
    expect(committed.committedAt).toBe('2026-07-15T00:00:00.000Z');

    const pending = outbox.drain({ organisation: 'org-a', program: 'prog-a' });
    expect(pending).toHaveLength(1);
    expect(pending[0].event.sourceEventId).toBe('evt-1');
  });

  it('is idempotent on the namespaced source-event tuple (a re-commit returns the original).', (): void => {
    const outbox = new InMemorySourceOutbox();
    const first = outbox.commit(event());
    const second = outbox.commit(event({ payload: { changed: true }}));
    expect(second).toBe(first);
    expect(outbox.drain({ organisation: 'org-a', program: 'prog-a' })).toHaveLength(1);
  });

  it('drains only the requested tenant scope.', (): void => {
    const outbox = new InMemorySourceOutbox();
    outbox.commit(event());
    outbox.commit(event({ organisation: 'org-b', program: 'prog-b', sourceEventId: 'evt-2' }));
    const pending = outbox.drain({ organisation: 'org-a', program: 'prog-a' });
    expect(pending.map((record): string => record.event.sourceEventId)).toStrictEqual([ 'evt-1' ]);
  });

  it('excludes a reconciled row from the drain but keeps a failed row pending.', (): void => {
    const outbox = new InMemorySourceOutbox();
    outbox.commit(event());
    outbox.commit(event({ sourceEventId: 'evt-2' }));

    outbox.markReconciled('evt-1', { sourceEventId: 'evt-1', status: 'reconciled', at: 'now' });
    outbox.markReconciled('evt-2', { sourceEventId: 'evt-2', status: 'failed', reason: 'boom', at: 'now' });

    const pending = outbox.drain({ organisation: 'org-a', program: 'prog-a' });
    expect(pending.map((record): string => record.event.sourceEventId)).toStrictEqual([ 'evt-2' ]);
    expect(outbox.reconciliation('evt-1')?.status).toBe('reconciled');
    expect(outbox.reconciliation('missing')).toBeUndefined();
  });

  it('fails closed when reconciling an unknown source event.', (): void => {
    const outbox = new InMemorySourceOutbox();
    expect((): void => outbox.markReconciled('nope', { sourceEventId: 'nope', status: 'failed', at: 'now' }))
      .toThrow(BadRequestHttpError);
  });

  it('fails closed on a source event missing a required field.', (): void => {
    const outbox = new InMemorySourceOutbox();
    expect((): unknown => outbox.commit(event({ sourceEventId: '' }))).toThrow(BadRequestHttpError);
  });

  it('uses a real clock by default.', (): void => {
    const outbox = new InMemorySourceOutbox();
    const committed = outbox.commit(event());
    expect(Number.isNaN(Date.parse(committed.committedAt))).toBe(false);
  });
});
