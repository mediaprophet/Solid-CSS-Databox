import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

/**
 * A single existing booking, expressed as minutes-from-midnight.
 */
export interface Booking {
  readonly start: number;
  readonly end: number;
}

/**
 * Input used to compute the free slots within a window.
 */
export interface AvailabilityInput {
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly slotMinutes: number;
  readonly bookings: readonly Booking[];
}

/**
 * A free slot, expressed as minutes-from-midnight.
 */
export interface Slot {
  readonly start: number;
  readonly end: number;
}

function overlaps(slot: Slot, booking: Booking): boolean {
  return slot.start < booking.end && booking.start < slot.end;
}

function isFree(slot: Slot, bookings: readonly Booking[]): boolean {
  for (const booking of bookings) {
    if (overlaps(slot, booking)) {
      return false;
    }
  }
  return true;
}

/**
 * Computes the free, back-to-back slots of `slotMinutes` length within the given window,
 * excluding any slot that overlaps an existing booking.
 *
 * A trailing partial slot that would extend past `windowEnd` is dropped.
 */
export function freeSlots(input: AvailabilityInput): Slot[] {
  const { windowStart, windowEnd, slotMinutes, bookings } = input;
  if (windowEnd <= windowStart) {
    throw new BadRequestHttpError('windowEnd must be greater than windowStart.');
  }
  if (slotMinutes <= 0) {
    throw new BadRequestHttpError('slotMinutes must be greater than 0.');
  }

  const slots: Slot[] = [];
  let start = windowStart;
  while (start + slotMinutes <= windowEnd) {
    const slot: Slot = { start, end: start + slotMinutes };
    if (isFree(slot, bookings)) {
      slots.push(slot);
    }
    start += slotMinutes;
  }
  return slots;
}
