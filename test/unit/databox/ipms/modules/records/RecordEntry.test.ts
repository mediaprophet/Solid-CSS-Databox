import { buildRecordEntry } from '../../../../../../src/databox/ipms/modules/records/RecordEntry';

const base = {
  id: 'https://example.org/records/entry-2',
  subject: 'https://example.org/vehicles/van-1',
  recordedAt: '2026-07-19T09:00:00Z',
  payload: { odometer: 42000 },
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildRecordEntry', (): void => {
  it('builds a minimal schema.org Action with no isBasedOn chain.', (): void => {
    const entry = buildRecordEntry(base);
    expect(entry['@context']).toBe('https://schema.org/');
    expect(entry['@type']).toBe('Action');
    expect(entry['@id']).toBe('https://example.org/records/entry-2');
    expect(record(entry.object)['@id']).toBe('https://example.org/vehicles/van-1');
    expect(entry.startTime).toBe('2026-07-19T09:00:00Z');
    expect(entry.result).toEqual({ odometer: 42000 });
    expect(entry.isBasedOn).toBeUndefined();
  });

  it('chains to the prior entry via isBasedOn when previous is given.', (): void => {
    const entry = buildRecordEntry({
      ...base,
      previous: 'https://example.org/records/entry-1',
    });
    expect(record(entry.isBasedOn)['@id']).toBe('https://example.org/records/entry-1');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildRecordEntry({ ...base, id: 'not-a-uri' }))
      .toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI subject.', (): void => {
    expect((): unknown => buildRecordEntry({ ...base, subject: 'not-a-uri' }))
      .toThrow('subject must be an absolute URI');
  });

  it('rejects an empty recordedAt.', (): void => {
    expect((): unknown => buildRecordEntry({ ...base, recordedAt: '  ' }))
      .toThrow('recordedAt timestamp');
  });
});
