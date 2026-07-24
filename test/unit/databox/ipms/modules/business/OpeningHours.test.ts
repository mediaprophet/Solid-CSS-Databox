import type { DayHours, OpeningHoursInput } from '../../../../../../src/databox/ipms/modules/business/OpeningHours';
import { buildOpeningHours, isOpen } from '../../../../../../src/databox/ipms/modules/business/OpeningHours';

describe('buildOpeningHours', (): void => {
  it('builds a valid opening hours specification.', (): void => {
    const input: OpeningHoursInput = {
      id: 'https://example.org/store#hours',
      hours: [
        { day: 'Mo', opens: '09:00', closes: '17:00' },
        { day: 'Tu', opens: '09:00', closes: '17:00' },
      ],
    };

    const result = buildOpeningHours(input);

    expect(result['@context']).toBe('https://schema.org/');
    expect(result['@id']).toBe('https://example.org/store#hours');
    expect(result['@type']).toBe('Place');
    expect(result.openingHoursSpecification).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Mo', opens: '09:00', closes: '17:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Tu', opens: '09:00', closes: '17:00' },
    ]);
  });

  it('normalizes whitespace around day and time values.', (): void => {
    const result = buildOpeningHours({
      id: 'https://example.org/store#hours',
      hours: [
        { day: ' Mo ', opens: ' 09:00 ', closes: ' 17:00 ' },
      ],
    });

    expect(result.openingHoursSpecification).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Mo', opens: '09:00', closes: '17:00' },
    ]);
  });

  it('throws a BadRequestHttpError when id is not an absolute URI.', (): void => {
    const input: OpeningHoursInput = {
      id: 'not-a-uri',
      hours: [
        { day: 'Mo', opens: '09:00', closes: '17:00' },
      ],
    };

    expect((): Record<string, unknown> => buildOpeningHours(input)).toThrow('id must be an absolute URI.');
  });

  it('throws a BadRequestHttpError when hours is empty.', (): void => {
    const input: OpeningHoursInput = {
      id: 'https://example.org/store#hours',
      hours: [],
    };

    expect((): Record<string, unknown> => buildOpeningHours(input)).toThrow('hours must not be empty.');
  });

  it('rejects invalid days and times.', (): void => {
    expect((): Record<string, unknown> => buildOpeningHours({
      id: 'https://example.org/store#hours',
      hours: [
        { day: 'Monday', opens: '09:00', closes: '17:00' },
      ],
    })).toThrow('day must be one of');
    expect((): Record<string, unknown> => buildOpeningHours({
      id: 'https://example.org/store#hours',
      hours: [
        { day: 'Mo', opens: '9:00', closes: '17:00' },
      ],
    })).toThrow('opens must be a valid HH:mm time.');
  });

  it('rejects hours where opening is not before closing.', (): void => {
    expect((): Record<string, unknown> => buildOpeningHours({
      id: 'https://example.org/store#hours',
      hours: [
        { day: 'Mo', opens: '17:00', closes: '09:00' },
      ],
    })).toThrow('opens must be before closes.');
  });
});

describe('isOpen', (): void => {
  const hours: DayHours[] = [
    { day: 'Mo', opens: '09:00', closes: '17:00' },
  ];

  it('returns true when the time is within the hours for that day.', (): void => {
    expect(isOpen(hours, 'Mo', '12:00')).toBe(true);
  });

  it('returns false when the time is before opening.', (): void => {
    expect(isOpen(hours, 'Mo', '08:59')).toBe(false);
  });

  it('returns false when the time is at or after closing.', (): void => {
    expect(isOpen(hours, 'Mo', '17:00')).toBe(false);
  });

  it('returns false for a day that has no matching hours.', (): void => {
    expect(isOpen(hours, 'Tu', '12:00')).toBe(false);
  });

  it('rejects invalid query inputs.', (): void => {
    expect((): boolean => isOpen(hours, 'Monday', '12:00')).toThrow('day must be one of');
    expect((): boolean => isOpen(hours, 'Mo', 'noon')).toThrow('time must be a valid HH:mm time.');
  });
});
