import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { AvailabilityInput } from './Availability';
import { freeSlots } from './Availability';
import type { ReservationInput } from './Reservation';
import { buildReservation } from './Reservation';

export function registerBookingsRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/bookings/availability', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertAvailabilityInput(input);
      writeJson(response, 200, freeSlots(input));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid availability request.' });
    }
  });
  router.register(
    'POST',
    '/bookings/reservation/build',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        assertReservationInput(input);
        writeJson(response, 200, buildReservation(input), 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid reservation build request.',
        });
      }
    },
  );
}

function assertAvailabilityInput(value: unknown): asserts value is AvailabilityInput {
  if (!isRecord(value)) {
    throw new TypeError('An availability request must be a JSON object.');
  }
  if (typeof value.windowStart !== 'number' ||
    typeof value.windowEnd !== 'number' ||
    typeof value.slotMinutes !== 'number') {
    throw new TypeError('An availability request needs windowStart, windowEnd, and slotMinutes numbers.');
  }
  if (!Array.isArray(value.bookings)) {
    throw new TypeError('An availability request needs a bookings array.');
  }
  for (const booking of value.bookings) {
    if (!isRecord(booking) || typeof booking.start !== 'number' || typeof booking.end !== 'number') {
      throw new TypeError('Bookings need start and end numbers.');
    }
  }
}

function assertReservationInput(value: unknown): asserts value is ReservationInput {
  if (!isRecord(value)) {
    throw new TypeError('A reservation build request must be a JSON object.');
  }
  if (typeof value.id !== 'string' || typeof value.reservationFor !== 'string' ||
    typeof value.holder !== 'string' || typeof value.startTime !== 'string') {
    throw new TypeError('A reservation build request needs id, reservationFor, holder, and startTime strings.');
  }
  if (value.endTime !== undefined && typeof value.endTime !== 'string') {
    throw new TypeError('A reservation endTime must be a string if provided.');
  }
}
