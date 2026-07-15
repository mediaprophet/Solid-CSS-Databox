import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../../../src/util/errors/ConflictHttpError';
import { NotFoundHttpError } from '../../../../src/util/errors/NotFoundHttpError';
import { NotImplementedHttpError } from '../../../../src/util/errors/NotImplementedHttpError';
import type { CommittedEvent } from '../../../../src/databox/feed/CursorFeed';
import {
  AuthorizedCursorFeed,
  NotImplementedCursorFeed,
  RetentionBoundedCursorFeed,
} from '../../../../src/databox/feed/CursorFeed';

const TENANT = 't1';

function input(n: number): { eventId: string; resourceRef: string; activity: string } {
  return { eventId: `evt-${n}`, resourceRef: `opaque:res-${n}`, activity: 'Create' };
}

describe('RetentionBoundedCursorFeed', (): void => {
  it('rejects a non-positive retention window.', (): void => {
    expect((): unknown => new RetentionBoundedCursorFeed(0)).toThrow(BadRequestHttpError);
    expect((): unknown => new RetentionBoundedCursorFeed(1.5)).toThrow(BadRequestHttpError);
  });

  it('fails closed on a blank tenant or blank projection fields.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    expect((): unknown => feed.record('', input(1))).toThrow(BadRequestHttpError);
    expect((): unknown => feed.record(TENANT, { eventId: '', resourceRef: 'opaque:r', activity: 'Create' }))
      .toThrow(BadRequestHttpError);
    expect((): unknown => feed.record(TENANT, { eventId: 'e', resourceRef: '', activity: 'Create' }))
      .toThrow(BadRequestHttpError);
    expect((): unknown => feed.record(TENANT, { eventId: 'e', resourceRef: 'opaque:r', activity: '' }))
      .toThrow(BadRequestHttpError);
    await expect(feed.pull('')).rejects.toThrow(BadRequestHttpError);
  });

  it('empty tenant: a blank cursor yields an empty page; a real cursor fails closed.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    await expect(feed.pull(TENANT)).resolves.toEqual({ events: [], nextCursor: '' });
    await expect(feed.pull(TENANT, '')).resolves.toEqual({ events: [], nextCursor: '' });
    await expect(feed.pull(TENANT, 'c000000000000000')).rejects.toThrow(BadRequestHttpError);
  });

  it('records ordered events and starts a fresh consumer at the retention head.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    const first = feed.record(TENANT, input(1));
    feed.record(TENANT, input(2));
    const page = await feed.pull(TENANT);
    expect(page.events.map((e): string => e.eventId)).toStrictEqual([ 'evt-1', 'evt-2' ]);
    expect(page.events[0].cursor).toBe(first.cursor);
    expect(page.nextCursor).toBe(page.events[1].cursor);
  });

  it('recovers exactly the events after a presented cursor, and nothing when caught up.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    feed.record(TENANT, input(1));
    feed.record(TENANT, input(2));
    const firstPull = await feed.pull(TENANT);
    // Caught up: presenting the head cursor yields an empty page whose nextCursor is unchanged.
    const caughtUp = await feed.pull(TENANT, firstPull.nextCursor);
    expect(caughtUp.events).toHaveLength(0);
    expect(caughtUp.nextCursor).toBe(firstPull.nextCursor);
    // A new event after disconnect is recovered exactly once.
    feed.record(TENANT, input(3));
    const recovered = await feed.pull(TENANT, firstPull.nextCursor);
    expect(recovered.events.map((e): string => e.eventId)).toStrictEqual([ 'evt-3' ]);
    // Re-pulling with the SAME old cursor still returns evt-3 exactly once (idempotent recovery).
    const again = await feed.pull(TENANT, firstPull.nextCursor);
    expect(again.events.map((e): string => e.eventId)).toStrictEqual([ 'evt-3' ]);
  });

  it('a disconnected consumer recovers EVERY missed event exactly once.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    feed.record(TENANT, input(1));
    const start = await feed.pull(TENANT);
    let cursor = start.nextCursor;
    // Consumer disconnects; five events accrue while it is away.
    for (let n = 2; n <= 6; n++) {
      feed.record(TENANT, input(n));
    }
    // Recover in two pages, threading the cursor — every missed event, once, in order.
    const seen: CommittedEvent[] = [];
    let guard = 0;
    for (;;) {
      const page = await feed.pull(TENANT, cursor);
      if (page.events.length === 0) {
        break;
      }
      seen.push(...page.events);
      cursor = page.nextCursor;
      guard += 1;
      expect(guard).toBeLessThan(10);
    }
    expect(seen.map((e): string => e.eventId)).toStrictEqual([ 'evt-2', 'evt-3', 'evt-4', 'evt-5', 'evt-6' ]);
  });

  it('dedups re-recorded events by eventId (at-least-once collapses to exactly-once).', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    const a = feed.record(TENANT, input(1));
    const again = feed.record(TENANT, { eventId: 'evt-1', resourceRef: 'opaque:other', activity: 'Update' });
    expect(again).toBe(a);
    const page = await feed.pull(TENANT);
    expect(page.events).toHaveLength(1);
    expect(page.events[0].resourceRef).toBe('opaque:res-1');
  });

  it('scopes ordering per tenant.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    feed.record('a', input(1));
    feed.record('b', input(2));
    expect((await feed.pull('a')).events.map((e): string => e.eventId)).toStrictEqual([ 'evt-1' ]);
    expect((await feed.pull('b')).events.map((e): string => e.eventId)).toStrictEqual([ 'evt-2' ]);
  });

  it('fails closed (ConflictHttpError) when a cursor has fallen below the retained floor.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed(2);
    feed.record(TENANT, input(1));
    const start = await feed.pull(TENANT);
    const oldCursor = start.nextCursor;
    // Three more events (window 2) evict evt-1 AND evt-2; the events strictly after the old cursor are no
    // longer all retained -> a real recovery gap below the retained floor.
    feed.record(TENANT, input(2));
    feed.record(TENANT, input(3));
    feed.record(TENANT, input(4));
    await expect(feed.pull(TENANT, oldCursor)).rejects.toThrow(ConflictHttpError);
  });

  it('at the boundary: a cursor exactly at the retained floor recovers without a gap.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed(2);
    feed.record(TENANT, input(1));
    const afterFirst = await feed.pull(TENANT);
    feed.record(TENANT, input(2));
    // Window is 2 so evt-1 + evt-2 are both retained; the cursor after evt-1 is exactly floor-1.
    const page = await feed.pull(TENANT, afterFirst.nextCursor);
    expect(page.events.map((e): string => e.eventId)).toStrictEqual([ 'evt-2' ]);
  });

  it('fails closed on a malformed cursor and on a cursor ahead of the head.', async(): Promise<void> => {
    const feed = new RetentionBoundedCursorFeed();
    feed.record(TENANT, input(1));
    await expect(feed.pull(TENANT, 'not-a-cursor')).rejects.toThrow(BadRequestHttpError);
    await expect(feed.pull(TENANT, 'c000000000000009')).rejects.toThrow('ahead of the feed head');
  });
});

describe('AuthorizedCursorFeed', (): void => {
  it('requires a non-empty connection tenant.', (): void => {
    expect((): unknown => new AuthorizedCursorFeed(new RetentionBoundedCursorFeed(), '')).toThrow(BadRequestHttpError);
  });

  it('delegates a pull for its own tenant.', async(): Promise<void> => {
    const inner = new RetentionBoundedCursorFeed();
    inner.record(TENANT, input(1));
    const feed = new AuthorizedCursorFeed(inner, TENANT);
    expect((await feed.pull(TENANT)).events).toHaveLength(1);
  });

  it('hides existence: a cross-connection pull is a 404, not a 403.', async(): Promise<void> => {
    const inner = new RetentionBoundedCursorFeed();
    inner.record('other', input(1));
    const feed = new AuthorizedCursorFeed(inner, TENANT);
    await expect(feed.pull('other')).rejects.toThrow(NotFoundHttpError);
  });
});

describe('NotImplementedCursorFeed', (): void => {
  it('still refuses to return an (empty) page that would mask a gap.', async(): Promise<void> => {
    await expect(new NotImplementedCursorFeed().pull('t')).rejects.toThrow(NotImplementedHttpError);
  });
});
