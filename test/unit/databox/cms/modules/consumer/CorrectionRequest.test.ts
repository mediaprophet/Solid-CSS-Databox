import { buildCorrectionRequest } from '../../../../../../src/databox/cms/modules/consumer/CorrectionRequest';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildCorrectionRequest', (): void => {
  it('builds a schema.org Action for a correction request.', (): void => {
    const request = buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 14,
    });
    expect(request['@context']).toBe('https://schema.org/');
    expect(request['@type']).toBe('Action');
    expect(request['@id']).toBe('https://example.org/requests/1');

    const agent = record(request.agent);
    expect(agent['@id']).toBe('https://example.org/people/alice');

    const object = record(request.object);
    expect(object['@id']).toBe('https://example.org/orgs/acme');

    const about = record(request.about);
    expect(about['@id']).toBe('https://example.org/records/42');

    expect(request.name).toBe('CorrectionRequest');
    expect(request.actionStatus).toBe('PotentialActionStatus');
    expect(request.description).toBe(`field email: 'old@example.org' -> 'new@example.org'`);
    expect(request.startTime).toBe('2026-07-01');
    expect(request.dueDate).toBe('2026-07-15');
    expect(request.result).toEqual({
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      responseDueDate: '2026-07-15',
    });
  });

  it('normalizes whitespace in field and requestedValue.', (): void => {
    const request = buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: ' email ',
      currentValue: '',
      requestedValue: ' new@example.org ',
      submittedAt: '2026-07-01',
      dueDays: 14,
    });

    expect(request.description).toBe(`field email: '' -> 'new@example.org'`);
  });

  it('allows an empty currentValue.', (): void => {
    const request = buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: '',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 14,
    });
    expect(request.description).toBe(`field email: '' -> 'new@example.org'`);
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'not-a-uri',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 14,
    })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI dataSubject.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'not-a-uri',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 14,
    })).toThrow('dataSubject must be an absolute URI');
  });

  it('rejects a non-URI controller.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'not-a-uri',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 14,
    })).toThrow('controller must be an absolute URI');
  });

  it('rejects a non-URI targetRecord.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'not-a-uri',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 14,
    })).toThrow('targetRecord must be an absolute URI');
  });

  it('rejects an empty field.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: '   ',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 14,
    })).toThrow('field must be non-empty');
  });

  it('rejects an empty requestedValue.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: '   ',
      submittedAt: '2026-07-01',
      dueDays: 14,
    })).toThrow('requestedValue must be non-empty');
  });

  it('rejects a non-positive or non-integer dueDays.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 0,
    })).toThrow('dueDays must be a positive integer');
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: '2026-07-01',
      dueDays: 1.5,
    })).toThrow('dueDays must be a positive integer');
  });

  it('rejects an invalid submittedAt date.', (): void => {
    expect((): unknown => buildCorrectionRequest({
      id: 'https://example.org/requests/1',
      dataSubject: 'https://example.org/people/alice',
      controller: 'https://example.org/orgs/acme',
      targetRecord: 'https://example.org/records/42',
      field: 'email',
      currentValue: 'old@example.org',
      requestedValue: 'new@example.org',
      submittedAt: 'not-a-date',
      dueDays: 14,
    })).toThrow('submittedAt must be a valid date');
  });
});
