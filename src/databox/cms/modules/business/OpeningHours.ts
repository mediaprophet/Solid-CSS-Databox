import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

const VALID_DAYS = new Set([ 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su' ]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export interface DayHours {
  readonly day: string;
  readonly opens: string;
  readonly closes: string;
}

export interface OpeningHoursInput {
  readonly id: string;
  readonly hours: readonly DayHours[];
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`${field} must be an absolute URI.`);
  }
}

function requireDay(day: string): string {
  const trimmed = day.trim();
  if (!VALID_DAYS.has(trimmed)) {
    throw new BadRequestHttpError('day must be one of Mo, Tu, We, Th, Fr, Sa, Su.');
  }
  return trimmed;
}

function requireTime(time: string, field: string): string {
  const trimmed = time.trim();
  if (!TIME_PATTERN.test(trimmed)) {
    throw new BadRequestHttpError(`${field} must be a valid HH:mm time.`);
  }
  return trimmed;
}

function normalizeHours(hours: readonly DayHours[]): readonly DayHours[] {
  if (hours.length === 0) {
    throw new BadRequestHttpError('hours must not be empty.');
  }

  return hours.map((entry): DayHours => {
    const day = requireDay(entry.day);
    const opens = requireTime(entry.opens, 'opens');
    const closes = requireTime(entry.closes, 'closes');
    if (opens >= closes) {
      throw new BadRequestHttpError('opens must be before closes.');
    }
    return { day, opens, closes };
  });
}

export function buildOpeningHours(input: OpeningHoursInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const hours = normalizeHours(input.hours);

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_ID]: id,
    [LD_TYPE]: 'Place',
    openingHoursSpecification: hours.map((entry): Record<string, unknown> => ({
      [LD_TYPE]: 'OpeningHoursSpecification',
      dayOfWeek: entry.day,
      opens: entry.opens,
      closes: entry.closes,
    })),
  };
}

export function isOpen(hours: readonly DayHours[], day: string, time: string): boolean {
  const requestedDay = requireDay(day);
  const requestedTime = requireTime(time, 'time');
  const normalizedHours = normalizeHours(hours);

  return normalizedHours.some((entry): boolean =>
    entry.day === requestedDay && entry.opens <= requestedTime && requestedTime < entry.closes);
}
