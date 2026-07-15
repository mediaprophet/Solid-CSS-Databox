import { buildScopedSubmission } from '../../../../src/databox/agent/ScopedSubmission';

describe('buildScopedSubmission', (): void => {
  const candidate = { diet: 'vegan', allergy: 'peanut', address: '1 Road', secret: 'x' };

  it('discloses ONLY the selected fields (data minimisation, T-51).', (): void => {
    const submission = buildScopedSubmission(candidate, [ 'diet', 'allergy' ], {
      recordClass: 'https://org.example/classes/loyalty',
      correctionOf: 'urn:uuid:record-1',
    });
    expect(submission.disclosedFields).toEqual([ 'diet', 'allergy' ]);
    expect(Object.keys(submission.fields)).toEqual([ 'diet', 'allergy' ]);
    expect(submission.fields).toEqual({ diet: 'vegan', allergy: 'peanut' });
    expect(submission.correctionOf).toBe('urn:uuid:record-1');
    expect((): unknown => (submission.fields as Record<string, unknown>).injected = 1)
      .toThrow('Cannot add property');
  });

  it('omits the correctionOf field when it is not a correction.', (): void => {
    const submission = buildScopedSubmission(candidate, [ 'diet' ], { recordClass: 'c' });
    expect(submission.correctionOf).toBeUndefined();
    expect(Object.keys(submission.fields)).toEqual([ 'diet' ]);
  });

  it('deduplicates a repeated selected field.', (): void => {
    const submission = buildScopedSubmission(candidate, [ 'diet', 'diet' ], { recordClass: 'c' });
    expect(submission.disclosedFields).toEqual([ 'diet' ]);
  });

  it('fails closed on an empty record class.', (): void => {
    expect((): unknown => buildScopedSubmission(candidate, [ 'diet' ], { recordClass: '' })).toThrow('recordClass');
  });

  it('fails closed on an empty selection (a submission must disclose something).', (): void => {
    expect((): unknown => buildScopedSubmission(candidate, [], { recordClass: 'c' })).toThrow('at least one');
  });

  it('fails closed on a non-string / empty selected field name.', (): void => {
    expect((): unknown => buildScopedSubmission(candidate, [ '' ], { recordClass: 'c' })).toThrow('non-empty string');
    expect((): unknown => buildScopedSubmission(candidate, [ 42 as unknown as string ], { recordClass: 'c' }))
      .toThrow('non-empty string');
  });

  it('fails closed when a selected field is absent from the candidate (no over-disclosure).', (): void => {
    expect((): unknown => buildScopedSubmission(candidate, [ 'missing' ], { recordClass: 'c' })).toThrow('not present');
  });

  it('deep-clones and deep-freezes nested selected values (L3).', (): void => {
    const nested = { city: 'X' };
    const list = [ 1, 2 ];
    const rich = { profile: nested, tags: list, name: 'n' };
    const submission = buildScopedSubmission(rich, [ 'profile', 'tags' ], { recordClass: 'c' });
    // Mutating the source objects does not alter the submission (cloned, not referenced).
    nested.city = 'Y';
    list.push(3);
    expect((submission.fields.profile as { city: string }).city).toBe('X');
    expect(submission.fields.tags).toEqual([ 1, 2 ]);
    // Nested values are frozen — the submission cannot be widened before transmission.
    expect((): unknown => (submission.fields.profile as { city: string }).city = 'Z').toThrow(TypeError);
    expect((): unknown => (submission.fields.tags as number[]).push(9)).toThrow(TypeError);
  });
});
