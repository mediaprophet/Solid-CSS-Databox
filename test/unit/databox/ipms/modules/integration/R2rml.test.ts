import { mapRow } from '../../../../../../src/databox/ipms/modules/integration/R2rml';

const mapping = {
  subjectTemplate: 'https://acme.example/person/{id}',
  columns: [
    { column: 'name', predicate: 'https://schema.org/name' },
    { column: 'email', predicate: 'https://schema.org/email' },
  ],
};

describe('mapRow', (): void => {
  it('fills the subject template and maps present columns to triples.', (): void => {
    const triples = mapRow(mapping, { id: '7', name: 'Alice' });
    expect(triples).toEqual([
      { subject: 'https://acme.example/person/7', predicate: 'https://schema.org/name', object: 'Alice' },
    ]);
  });

  it('percent-encodes template values and skips columns absent from the row.', (): void => {
    const triples = mapRow(mapping, { id: 'a b', name: 'Bob', email: 'bob@x.example' });
    expect(triples[0].subject).toBe('https://acme.example/person/a%20b');
    expect(triples).toHaveLength(2);
  });

  it('rejects an empty subject template.', (): void => {
    expect((): unknown => mapRow({ subjectTemplate: '', columns: []}, {})).toThrow('subject template');
  });

  it('rejects a row missing a template placeholder.', (): void => {
    expect((): unknown => mapRow(mapping, { name: 'Alice' })).toThrow('missing template column "id"');
  });
});
