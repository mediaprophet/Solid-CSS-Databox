import type { DurableCommit } from '../../../../src/databox/receipt/DurableCommit';
import { assertDurableCommit, DurableCommitCoordinator } from '../../../../src/databox/receipt/DurableCommit';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { validCommit } from './ReceiptTestSupport';

/** Cast a malformed partial into DurableCommit for fail-closed tests. */
function bad(overrides: Record<string, unknown>): DurableCommit {
  return { ...validCommit(), ...overrides };
}

describe('assertDurableCommit', (): void => {
  it('returns a well-formed confirmed commit unchanged.', (): void => {
    const commit = validCommit();
    expect(assertDurableCommit(commit)).toBe(commit);
  });

  it('fails closed when no signal is present (undefined).', (): void => {
    expect((): DurableCommit => assertDurableCommit(undefined)).toThrow(BadRequestHttpError);
  });

  it('fails closed on a null signal.', (): void => {
    expect((): DurableCommit => assertDurableCommit(null as unknown as DurableCommit)).toThrow(BadRequestHttpError);
  });

  it('fails closed when the commit is not confirmed.', (): void => {
    expect((): DurableCommit => assertDurableCommit(bad({ confirmed: false }))).toThrow(
      'Durable commit is not confirmed',
    );
  });

  it('fails closed on a non-string event id.', (): void => {
    expect((): DurableCommit => assertDurableCommit(bad({ eventId: 123 }))).toThrow('missing a C13 event id');
  });

  it('fails closed on an empty event id.', (): void => {
    expect((): DurableCommit => assertDurableCommit(bad({ eventId: '' }))).toThrow('missing a C13 event id');
  });

  it('fails closed on a non-string committedAt.', (): void => {
    expect((): DurableCommit => assertDurableCommit(bad({ committedAt: 5 }))).toThrow('unparseable committedAt');
  });

  it('fails closed on an unparseable committedAt.', (): void => {
    expect((): DurableCommit => assertDurableCommit(bad({ committedAt: 'not-a-date' }))).toThrow(
      'unparseable committedAt',
    );
  });

  it('fails closed on a non-string payload digest.', (): void => {
    expect((): DurableCommit => assertDurableCommit(bad({ payloadDigest: 7 }))).toThrow('urn:sha256');
  });

  it('fails closed on a payload digest that is not a urn:sha256 URN.', (): void => {
    expect((): DurableCommit => assertDurableCommit(bad({ payloadDigest: 'nope' }))).toThrow('urn:sha256');
  });
});

describe('DurableCommitCoordinator', (): void => {
  it('has no signal for a transaction before it is committed (no-receipt-before-commit).', (): void => {
    const coordinator = new DurableCommitCoordinator();
    expect(coordinator.signalFor('urn:uuid:txn-1')).toBeUndefined();
  });

  it('records a durable commit and exposes it as the signal.', (): void => {
    const coordinator = new DurableCommitCoordinator();
    const commit = validCommit();
    expect(coordinator.confirm('urn:uuid:txn-1', commit)).toBe(commit);
    expect(coordinator.signalFor('urn:uuid:txn-1')).toBe(commit);
  });

  it('is idempotent: a repeated confirm returns the ORIGINAL commit.', (): void => {
    const coordinator = new DurableCommitCoordinator();
    const first = validCommit({ eventId: 'evt-first' });
    const second = validCommit({ eventId: 'evt-second' });
    expect(coordinator.confirm('urn:uuid:txn-1', first)).toBe(first);
    expect(coordinator.confirm('urn:uuid:txn-1', second)).toBe(first);
    expect(coordinator.signalFor('urn:uuid:txn-1')).toBe(first);
  });

  it('fails closed when confirming an unconfirmed commit.', (): void => {
    const coordinator = new DurableCommitCoordinator();
    const unconfirmed = { ...validCommit(), confirmed: false } as unknown as DurableCommit;
    expect((): DurableCommit => coordinator.confirm('t', unconfirmed)).toThrow(BadRequestHttpError);
  });

  it('fails closed on an empty transaction id.', (): void => {
    const coordinator = new DurableCommitCoordinator();
    expect((): DurableCommit => coordinator.confirm('', validCommit())).toThrow('non-empty transaction id');
  });

  it('fails closed on a non-string transaction id.', (): void => {
    const coordinator = new DurableCommitCoordinator();
    expect((): DurableCommit => coordinator.confirm(5 as unknown as string, validCommit())).toThrow(
      'non-empty transaction id',
    );
  });
});
