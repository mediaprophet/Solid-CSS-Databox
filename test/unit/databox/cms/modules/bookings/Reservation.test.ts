import { buildReservation } from '../../../../../../src/databox/cms/modules/bookings/Reservation';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildReservation', (): void => {
  it('builds a minimal schema.org Reservation.', (): void => {
    const reservation = buildReservation({
      id: 'https://example.org/reservations/1',
      reservationFor: 'https://example.org/resources/table-1',
      holder: 'https://example.org/profile/card#me',
      startTime: '2026-08-01T18:00:00Z',
    });
    expect(reservation['@context']).toBe('https://schema.org/');
    expect(reservation['@type']).toBe('Reservation');
    expect(reservation['@id']).toBe('https://example.org/reservations/1');

    const reservationFor = record(reservation.reservationFor);
    expect(reservationFor['@id']).toBe('https://example.org/resources/table-1');

    const underName = record(reservation.underName);
    expect(underName['@id']).toBe('https://example.org/profile/card#me');

    expect(reservation.startTime).toBe('2026-08-01T18:00:00Z');
    expect(reservation.endTime).toBeUndefined();
  });

  it('includes endTime when supplied.', (): void => {
    const reservation = buildReservation({
      id: 'https://example.org/reservations/1',
      reservationFor: 'https://example.org/resources/table-1',
      holder: 'https://example.org/profile/card#me',
      startTime: '2026-08-01T18:00:00Z',
      endTime: '2026-08-01T20:00:00Z',
    });
    expect(reservation.endTime).toBe('2026-08-01T20:00:00Z');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildReservation({
      id: 'not-a-uri',
      reservationFor: 'https://example.org/resources/table-1',
      holder: 'https://example.org/profile/card#me',
      startTime: '2026-08-01T18:00:00Z',
    })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI reservationFor.', (): void => {
    expect((): unknown => buildReservation({
      id: 'https://example.org/reservations/1',
      reservationFor: 'not-a-uri',
      holder: 'https://example.org/profile/card#me',
      startTime: '2026-08-01T18:00:00Z',
    })).toThrow('reservationFor must be an absolute URI');
  });

  it('rejects a non-URI holder.', (): void => {
    expect((): unknown => buildReservation({
      id: 'https://example.org/reservations/1',
      reservationFor: 'https://example.org/resources/table-1',
      holder: 'not-a-uri',
      startTime: '2026-08-01T18:00:00Z',
    })).toThrow('holder must be an absolute URI');
  });

  it('rejects an empty start time.', (): void => {
    expect((): unknown => buildReservation({
      id: 'https://example.org/reservations/1',
      reservationFor: 'https://example.org/resources/table-1',
      holder: 'https://example.org/profile/card#me',
      startTime: ' ',
    })).toThrow('start time');
  });
});
