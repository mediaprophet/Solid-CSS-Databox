import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export type BillingInterval = 'weekly' | 'monthly' | 'yearly';

function parseIsoDate(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`Invalid date: ${iso}.`);
  }
  return date;
}

/**
 * Advance `date` (in place, UTC) by `months` calendar months, clamping the day of month to the last
 * day of the target month when the original day does not exist there. This matches standard recurring
 * billing semantics (e.g. a subscription billed on the 31st bills Feb 28 / Apr 30, not rolling over
 * into the following month) rather than the native `Date.setUTCMonth` overflow behaviour.
 */
function addMonths(date: Date, months: number): void {
  const day = date.getUTCDate();
  // Move to the 1st first so adding months can never overflow into the next month.
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  // Day 0 of the following month resolves to the last day of the (now current) target month.
  const daysInTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, daysInTargetMonth));
}

/**
 * Compute the next billing date for a subscription, given the last billed date and its interval
 * (plan §10.5). Pure and deterministic: all dates are UTC and passed in as parameters.
 */
export function nextBillingDate(lastBilledIso: string, interval: BillingInterval): string {
  const date = parseIsoDate(lastBilledIso);
  switch (interval) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'monthly':
      addMonths(date, 1);
      break;
    case 'yearly':
      addMonths(date, 12);
      break;
    default:
      throw new BadRequestHttpError(`Invalid billing interval: ${interval as string}.`);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Determine whether a subscription is due for billing as of a given date (plan §10.5).
 */
export function isDue(lastBilledIso: string, interval: BillingInterval, asOfIso: string): boolean {
  const next = nextBillingDate(lastBilledIso, interval);
  parseIsoDate(asOfIso);
  return next <= asOfIso;
}
