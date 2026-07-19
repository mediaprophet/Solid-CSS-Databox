import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface ReservationInput {
  readonly id: string;
  readonly reservationFor: string;
  readonly holder: string;
  readonly startTime: string;
  readonly endTime?: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A reservation ${field} must be an absolute URI.`);
  }
}

/**
 * Build a reservation confirmation as schema.org JSON-LD (see `databox/solid-cms-plan.md`, §12.3 bookings).
 * Pure and deterministic — all dates are supplied by the caller.
 */
export function buildReservation(input: ReservationInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const reservationFor = requireUri(input.reservationFor, 'reservationFor');
  const holder = requireUri(input.holder, 'holder');
  if (input.startTime.trim().length === 0) {
    throw new BadRequestHttpError('A reservation needs a start time.');
  }

  const reservation: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Reservation',
    [LD_ID]: id,
    reservationFor: { [LD_ID]: reservationFor },
    underName: { [LD_ID]: holder },
    startTime: input.startTime,
  };
  if (input.endTime !== undefined) {
    reservation.endTime = input.endTime;
  }
  return reservation;
}
