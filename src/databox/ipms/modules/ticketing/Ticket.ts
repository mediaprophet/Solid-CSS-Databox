import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface TicketInput {
  readonly id: string;
  readonly event: string;
  readonly holder: string;
  readonly seat?: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A ticket ${field} must be an absolute URI.`);
  }
}

/**
 * Build a ticket/reservation as schema.org JSON-LD (see `databox/solid-ipms-plan.md`, §10 events/ticketing).
 * Pure and deterministic.
 */
export function buildTicket(input: TicketInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const event = requireUri(input.event, 'event');
  const holder = requireUri(input.holder, 'holder');

  const ticket: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'EventReservation',
    [LD_ID]: id,
    reservationFor: { [LD_ID]: event },
    underName: { [LD_ID]: holder },
  };
  if (input.seat !== undefined) {
    ticket.ticketedSeat = { [LD_TYPE]: 'Seat', seatNumber: input.seat };
  }
  return ticket;
}
