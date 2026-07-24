import { buildEvent } from '../../../../../../src/databox/ipms/modules/events/Event';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildEvent', (): void => {
  it('builds a minimal schema.org Event.', (): void => {
    const event = buildEvent({
      id: 'https://example.org/events/1',
      name: 'Community Meetup',
      startDate: '2026-08-01T18:00:00Z',
    });
    expect(event['@context']).toBe('https://schema.org/');
    expect(event['@type']).toBe('Event');
    expect(event['@id']).toBe('https://example.org/events/1');
    expect(event.name).toBe('Community Meetup');
    expect(event.startDate).toBe('2026-08-01T18:00:00Z');
    expect(event.endDate).toBeUndefined();
    expect(event.location).toBeUndefined();
    expect(event.organizer).toBeUndefined();
  });

  it('includes endDate, location, and organizer when supplied.', (): void => {
    const event = buildEvent({
      id: 'https://example.org/events/1',
      name: 'Community Meetup',
      startDate: '2026-08-01T18:00:00Z',
      endDate: '2026-08-01T20:00:00Z',
      location: 'Town Hall',
      organizer: 'Acme Co',
    });
    expect(event.endDate).toBe('2026-08-01T20:00:00Z');

    const location = record(event.location);
    expect(location['@type']).toBe('Place');
    expect(location.name).toBe('Town Hall');

    const organizer = record(event.organizer);
    expect(organizer['@type']).toBe('Organization');
    expect(organizer.name).toBe('Acme Co');
  });

  it('rejects a non-URI id, empty name, or empty start date.', (): void => {
    expect((): unknown => buildEvent({
      id: 'not-a-uri',
      name: 'Community Meetup',
      startDate: '2026-08-01T18:00:00Z',
    })).toThrow('absolute URI');

    expect((): unknown => buildEvent({
      id: 'https://example.org/events/1',
      name: ' ',
      startDate: '2026-08-01T18:00:00Z',
    })).toThrow('name');

    expect((): unknown => buildEvent({
      id: 'https://example.org/events/1',
      name: 'Community Meetup',
      startDate: ' ',
    })).toThrow('start date');
  });
});
