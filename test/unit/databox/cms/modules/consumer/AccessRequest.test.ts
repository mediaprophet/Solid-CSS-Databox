import { buildAccessRequest } from '../../../../../../src/databox/cms/modules/consumer/AccessRequest';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildAccessRequest', (): void => {
  it('builds a schema.org Action for an access request.', (): void => {
    const request = buildAccessRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      scope: [ 'orders', 'profile' ],
      submittedAt: '2026-07-01',
      dueDays: 30,
    });
    expect(request['@context']).toBe('https://schema.org/');
    expect(request['@type']).toBe('Action');
    expect(request['@id']).toBe('https://example.org/requests/1');

    const agent = record(request.agent);
    expect(agent['@id']).toBe('https://example.org/people/alice');

    const object = record(request.object);
    expect(object['@id']).toBe('https://example.org/orgs/acme');

    expect(request.name).toBe('AccessRequest');
    expect(request.description).toBe('orders, profile');
    expect(request.startTime).toBe('2026-07-01');
    expect(request.dueDate).toBe('2026-07-31');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildAccessRequest({
      id: 'not-a-uri',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      scope: [ 'orders' ],
      submittedAt: '2026-07-01',
      dueDays: 30,
    })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI dataSubject.', (): void => {
    expect((): unknown => buildAccessRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'not-a-uri',
      controller: 'https://example.org/orgs/acme',
      scope: [ 'orders' ],
      submittedAt: '2026-07-01',
      dueDays: 30,
    })).toThrow('dataSubject must be an absolute URI');
  });

  it('rejects a non-URI controller.', (): void => {
    expect((): unknown => buildAccessRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'not-a-uri',
      scope: [ 'orders' ],
      submittedAt: '2026-07-01',
      dueDays: 30,
    })).toThrow('controller must be an absolute URI');
  });

  it('rejects an empty scope.', (): void => {
    expect((): unknown => buildAccessRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      scope: [],
      submittedAt: '2026-07-01',
      dueDays: 30,
    })).toThrow('non-empty scope');
  });

  it('rejects a non-positive dueDays.', (): void => {
    expect((): unknown => buildAccessRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      scope: [ 'orders' ],
      submittedAt: '2026-07-01',
      dueDays: 0,
    })).toThrow('dueDays must be greater than zero');
  });

  it('rejects an invalid submittedAt date.', (): void => {
    expect((): unknown => buildAccessRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      scope: [ 'orders' ],
      submittedAt: 'not-a-date',
      dueDays: 30,
    })).toThrow('submittedAt must be a valid date');
  });
});
