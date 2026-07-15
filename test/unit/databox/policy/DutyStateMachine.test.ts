import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import {
  assertTransition,
  canTransition,
  DUTY_STATES,
  isFulfilled,
} from '../../../../src/databox/policy/DutyStateMachine';

describe('DutyStateMachine (ADR-0012)', (): void => {
  it('enumerates the six-plus distinct states.', (): void => {
    expect(DUTY_STATES).toStrictEqual(
      [ 'queued', 'attempted', 'accepted', 'failed', 'remedied', 'acknowledged', 'superseded' ],
    );
  });

  it('treats ONLY accepted and acknowledged as fulfilled (queued/attempted/failed are NOT).', (): void => {
    expect(isFulfilled('accepted')).toBe(true);
    expect(isFulfilled('acknowledged')).toBe(true);
    expect(isFulfilled('queued')).toBe(false);
    expect(isFulfilled('attempted')).toBe(false);
    expect(isFulfilled('failed')).toBe(false);
    expect(isFulfilled('superseded')).toBe(false);
    expect(isFulfilled('remedied')).toBe(false);
  });

  it('permits exactly the ADR-0012 transitions.', (): void => {
    expect(canTransition('queued', 'attempted')).toBe(true);
    expect(canTransition('queued', 'superseded')).toBe(true);
    expect(canTransition('attempted', 'accepted')).toBe(true);
    expect(canTransition('attempted', 'failed')).toBe(true);
    expect(canTransition('accepted', 'acknowledged')).toBe(true);
    expect(canTransition('failed', 'attempted')).toBe(true);
    expect(canTransition('failed', 'remedied')).toBe(true);
  });

  it('forbids illegal transitions (queued cannot jump to accepted; terminals cannot leave).', (): void => {
    expect(canTransition('queued', 'accepted')).toBe(false);
    expect(canTransition('remedied', 'attempted')).toBe(false);
    expect(canTransition('acknowledged', 'accepted')).toBe(false);
    expect(canTransition('superseded', 'attempted')).toBe(false);
  });

  it('assertTransition throws fail-closed on an illegal transition and is silent on a legal one.', (): void => {
    expect((): void => assertTransition('queued', 'attempted')).not.toThrow();
    expect((): void => assertTransition('queued', 'accepted')).toThrow(BadRequestHttpError);
  });
});
