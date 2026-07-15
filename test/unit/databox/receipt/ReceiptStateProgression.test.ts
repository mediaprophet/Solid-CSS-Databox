import type { ReceiptStateEvent } from '../../../../src/databox/receipt/ReceiptStateProgression';
import { ReceiptStateJournal } from '../../../../src/databox/receipt/ReceiptStateProgression';
import type { ReceiptState } from '../../../../src/databox/receipt/ReceiptTypes';

const T0 = '2026-07-14T00:00:00.000Z';
const T1 = '2026-07-14T01:00:00.000Z';
const T2 = '2026-07-14T02:00:00.000Z';

describe('ReceiptStateJournal', (): void => {
  it('starts empty.', (): void => {
    const journal = new ReceiptStateJournal();
    expect(journal.currentState()).toBeUndefined();
    expect(journal.history()).toStrictEqual([]);
  });

  it('records a monotonic append-only progression, each transition an evidence event.', (): void => {
    const journal = new ReceiptStateJournal();
    journal.append('accepted', T0, 'evt-1');
    journal.append('notified', T1);
    journal.append('retrieved', T2, 'evt-3');
    expect(journal.currentState()).toBe('retrieved');
    expect(journal.history()).toStrictEqual<ReceiptStateEvent[]>([
      { state: 'accepted', at: T0, evidence: 'evt-1' },
      { state: 'notified', at: T1 },
      { state: 'retrieved', at: T2, evidence: 'evt-3' },
    ]);
  });

  it('may skip forward states (progression need not be contiguous).', (): void => {
    const journal = new ReceiptStateJournal();
    journal.append('accepted', T0);
    journal.append('disposed', T1);
    expect(journal.currentState()).toBe('disposed');
  });

  it('rejects an unknown state.', (): void => {
    const journal = new ReceiptStateJournal();
    expect((): ReceiptStateEvent => journal.append('bogus' as ReceiptState, T0)).toThrow('Unknown receipt state');
  });

  it('rejects a non-string transition instant.', (): void => {
    const journal = new ReceiptStateJournal();
    expect((): ReceiptStateEvent => journal.append('accepted', 5 as unknown as string)).toThrow('parseable ISO-8601');
  });

  it('rejects an unparseable transition instant.', (): void => {
    const journal = new ReceiptStateJournal();
    expect((): ReceiptStateEvent => journal.append('accepted', 'not-a-date')).toThrow('parseable ISO-8601');
  });

  it('requires the progression to begin with accepted.', (): void => {
    const journal = new ReceiptStateJournal();
    expect((): ReceiptStateEvent => journal.append('notified', T0)).toThrow('begin with the accepted state');
  });

  it('rejects a repeated state (a transition is evidence, not an overwrite).', (): void => {
    const journal = new ReceiptStateJournal();
    journal.append('accepted', T0);
    expect((): ReceiptStateEvent => journal.append('accepted', T1)).toThrow('cannot regress or repeat');
  });

  it('rejects a regressing transition.', (): void => {
    const journal = new ReceiptStateJournal();
    journal.append('accepted', T0);
    journal.append('retrieved', T1);
    expect((): ReceiptStateEvent => journal.append('notified', T2)).toThrow('not a forward transition');
  });

  it('returns a defensive copy of history that cannot mutate recorded evidence.', (): void => {
    const journal = new ReceiptStateJournal();
    journal.append('accepted', T0);
    const copy = journal.history() as ReceiptStateEvent[];
    copy.push({ state: 'disposed', at: T1 });
    expect(journal.history()).toHaveLength(1);
  });
});
