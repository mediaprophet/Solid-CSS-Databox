import { buildTicket } from '../../../../../../src/databox/ipms/modules/ticketing/Ticket';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildTicket', (): void => {
  it('builds a minimal schema.org EventReservation.', (): void => {
    const ticket = buildTicket({
      id: 'https://example.org/tickets/1',
      event: 'https://example.org/events/1',
      holder: 'https://example.org/profile/card#me',
    });
    expect(ticket['@context']).toBe('https://schema.org/');
    expect(ticket['@type']).toBe('EventReservation');
    expect(ticket['@id']).toBe('https://example.org/tickets/1');

    const reservationFor = record(ticket.reservationFor);
    expect(reservationFor['@id']).toBe('https://example.org/events/1');

    const underName = record(ticket.underName);
    expect(underName['@id']).toBe('https://example.org/profile/card#me');

    expect(ticket.ticketedSeat).toBeUndefined();
  });

  it('includes a ticketedSeat when a seat is supplied.', (): void => {
    const ticket = buildTicket({
      id: 'https://example.org/tickets/1',
      event: 'https://example.org/events/1',
      holder: 'https://example.org/profile/card#me',
      seat: 'A12',
    });

    const seat = record(ticket.ticketedSeat);
    expect(seat['@type']).toBe('Seat');
    expect(seat.seatNumber).toBe('A12');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildTicket({
      id: 'not-a-uri',
      event: 'https://example.org/events/1',
      holder: 'https://example.org/profile/card#me',
    })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI event.', (): void => {
    expect((): unknown => buildTicket({
      id: 'https://example.org/tickets/1',
      event: 'not-a-uri',
      holder: 'https://example.org/profile/card#me',
    })).toThrow('event must be an absolute URI');
  });

  it('rejects a non-URI holder.', (): void => {
    expect((): unknown => buildTicket({
      id: 'https://example.org/tickets/1',
      event: 'https://example.org/events/1',
      holder: 'not-a-uri',
    })).toThrow('holder must be an absolute URI');
  });
});
