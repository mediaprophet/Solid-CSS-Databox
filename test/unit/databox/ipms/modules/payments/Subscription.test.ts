import type { BillingInterval } from '../../../../../../src/databox/ipms/modules/payments/Subscription';
import { isDue, nextBillingDate } from '../../../../../../src/databox/ipms/modules/payments/Subscription';

describe('nextBillingDate', (): void => {
  it('adds 7 days for a weekly interval.', (): void => {
    expect(nextBillingDate('2026-07-01', 'weekly')).toBe('2026-07-08');
  });

  it('adds 1 calendar month for a monthly interval.', (): void => {
    expect(nextBillingDate('2026-07-01', 'monthly')).toBe('2026-08-01');
  });

  it('adds 1 year for a yearly interval.', (): void => {
    expect(nextBillingDate('2026-07-01', 'yearly')).toBe('2027-07-01');
  });

  it('clamps to the last day of the month when the billing day does not exist (monthly).', (): void => {
    // Jan 31 -> Feb 28 (not March 3): the following month must not be skipped.
    expect(nextBillingDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    // Aug 31 -> Sep 30 (September has 30 days).
    expect(nextBillingDate('2026-08-31', 'monthly')).toBe('2026-09-30');
    // Feb of a leap year is still reachable from Jan 31.
    expect(nextBillingDate('2028-01-31', 'monthly')).toBe('2028-02-29');
  });

  it('rolls the year over correctly for a monthly interval in December.', (): void => {
    expect(nextBillingDate('2026-12-31', 'monthly')).toBe('2027-01-31');
  });

  it('clamps a leap-day yearly renewal to Feb 28 in a common year.', (): void => {
    expect(nextBillingDate('2024-02-29', 'yearly')).toBe('2025-02-28');
  });

  it('rejects a date that fails to parse.', (): void => {
    expect((): unknown => nextBillingDate('not-a-date', 'weekly')).toThrow('Invalid date');
  });

  it('rejects an interval that is not weekly, monthly, or yearly.', (): void => {
    const invalid = 'daily' as unknown as BillingInterval;
    expect((): unknown => nextBillingDate('2026-07-01', invalid)).toThrow('Invalid billing interval');
  });
});

describe('isDue', (): void => {
  it('is true when the next billing date is on or before the as-of date.', (): void => {
    expect(isDue('2026-07-01', 'weekly', '2026-07-08')).toBe(true);
    expect(isDue('2026-07-01', 'weekly', '2026-07-09')).toBe(true);
  });

  it('is false when the next billing date is after the as-of date.', (): void => {
    expect(isDue('2026-07-01', 'weekly', '2026-07-07')).toBe(false);
  });
});
