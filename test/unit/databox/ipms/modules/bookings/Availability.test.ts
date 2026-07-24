import type { AvailabilityInput, Slot } from '../../../../../../src/databox/ipms/modules/bookings/Availability';
import { freeSlots } from '../../../../../../src/databox/ipms/modules/bookings/Availability';

describe('freeSlots', (): void => {
  it('returns free slots and excludes slots overlapping a booking, dropping a trailing partial slot.', (): void => {
    const input: AvailabilityInput = {
      windowStart: 0,
      windowEnd: 100,
      slotMinutes: 30,
      bookings: [
        { start: 40, end: 50 },
      ],
    };

    expect(freeSlots(input)).toEqual([
      { start: 0, end: 30 },
      { start: 60, end: 90 },
    ]);
  });

  it('throws a BadRequestHttpError when windowEnd is not greater than windowStart.', (): void => {
    const input: AvailabilityInput = {
      windowStart: 100,
      windowEnd: 100,
      slotMinutes: 30,
      bookings: [],
    };

    expect((): Slot[] => freeSlots(input)).toThrow('windowEnd must be greater than windowStart.');
  });

  it('throws a BadRequestHttpError when slotMinutes is not greater than 0.', (): void => {
    const input: AvailabilityInput = {
      windowStart: 0,
      windowEnd: 100,
      slotMinutes: 0,
      bookings: [],
    };

    expect((): Slot[] => freeSlots(input)).toThrow('slotMinutes must be greater than 0.');
  });
});
