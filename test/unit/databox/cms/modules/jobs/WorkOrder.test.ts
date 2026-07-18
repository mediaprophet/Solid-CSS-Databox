import { advanceJob } from '../../../../../../src/databox/cms/modules/jobs/WorkOrder';

describe('advanceJob', (): void => {
  it('advances through the full happy chain from intake to ready.', (): void => {
    expect(advanceJob('intake', 'queue')).toBe('queued');
    expect(advanceJob('queued', 'start')).toBe('inProduction');
    expect(advanceJob('inProduction', 'finish')).toBe('finished');
    expect(advanceJob('finished', 'collect')).toBe('ready');
  });

  it('cancels a job that is in production.', (): void => {
    expect(advanceJob('inProduction', 'cancel')).toBe('cancelled');
  });

  it('throws on an unknown event for a given state.', (): void => {
    expect((): void => {
      advanceJob('intake', 'bogus');
    }).toThrow('No transition for state \'intake\' with event \'bogus\'');
  });

  it('throws when attempting a transition from a terminal state.', (): void => {
    expect((): void => {
      advanceJob('ready', 'queue');
    }).toThrow('No transition for state \'ready\' with event \'queue\'');
  });
});
