import { recordResolution } from '../../../../../../src/databox/cms/modules/governance/Resolution';
import type { ResolutionInput } from '../../../../../../src/databox/cms/modules/governance/Resolution';

function baseInput(overrides: Partial<ResolutionInput> = {}): ResolutionInput {
  return {
    id: 'https://example.org/resolutions/1',
    title: 'Adopt annual budget',
    decision: 'The board resolves to adopt the proposed annual budget.',
    votesFor: 5,
    votesAgainst: 2,
    abstain: 1,
    quorum: 5,
    date: '2026-07-01',
    ...overrides,
  };
}

describe('recordResolution', (): void => {
  it('carries a resolution when quorum is met and votes for exceed votes against.', (): void => {
    const result = recordResolution(baseInput());

    expect(result.quorumMet).toBe(true);
    expect(result.carried).toBe(true);
    expect(result.record['@id']).toBe('https://example.org/resolutions/1');
    expect(result.record['@type']).toBe('Action');
    expect(result.record['@context']).toBe('https://schema.org/');
    expect(result.record.name).toBe('Adopt annual budget');
    expect(result.record.description).toBe('The board resolves to adopt the proposed annual budget.');
    expect(result.record.startTime).toBe('2026-07-01');
    expect(result.record.actionStatus).toBe('CompletedActionStatus');
    expect(result.record.result).toEqual({
      for: 5,
      against: 2,
      abstain: 1,
      carried: true,
      quorumMet: true,
    });
  });

  it('normalizes whitespace in text fields.', (): void => {
    const result = recordResolution(baseInput({
      title: '  Approve capital spend  ',
      decision: '  Approve the repair budget.  ',
    }));

    expect(result.record.name).toBe('Approve capital spend');
    expect(result.record.description).toBe('Approve the repair budget.');
  });

  it('does not carry a resolution when votes against are at least votes for.', (): void => {
    const result = recordResolution(baseInput({ votesFor: 2, votesAgainst: 2, abstain: 1, quorum: 3 }));

    expect(result.quorumMet).toBe(true);
    expect(result.carried).toBe(false);
  });

  it('does not carry a resolution when quorum is not met, even if votes for exceed votes against.', (): void => {
    const result = recordResolution(baseInput({ votesFor: 2, votesAgainst: 1, abstain: 0, quorum: 10 }));

    expect(result.quorumMet).toBe(false);
    expect(result.carried).toBe(false);
  });

  it('throws when id is not an absolute URI.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ id: 'not-a-uri' }));
    }).toThrow('A resolution id must be an absolute URI.');
  });

  it('throws when title is empty.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ title: '   ' }));
    }).toThrow('A resolution title must not be empty.');
  });

  it('throws when decision is empty.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ decision: '' }));
    }).toThrow('A resolution decision must not be empty.');
  });

  it('throws when votesFor is not a non-negative integer.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ votesFor: -1 }));
    }).toThrow('A resolution votesFor must be a non-negative integer.');
    expect((): void => {
      recordResolution(baseInput({ votesFor: 1.5 }));
    }).toThrow('A resolution votesFor must be a non-negative integer.');
  });

  it('throws when votesAgainst is not a non-negative integer.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ votesAgainst: -1 }));
    }).toThrow('A resolution votesAgainst must be a non-negative integer.');
  });

  it('throws when abstain is not a non-negative integer.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ abstain: -1 }));
    }).toThrow('A resolution abstain must be a non-negative integer.');
  });

  it('throws when quorum is not a positive integer.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ quorum: 0 }));
    }).toThrow('A resolution quorum must be a positive integer.');
    expect((): void => {
      recordResolution(baseInput({ quorum: 1.5 }));
    }).toThrow('A resolution quorum must be a positive integer.');
  });

  it('throws when date is invalid.', (): void => {
    expect((): void => {
      recordResolution(baseInput({ date: 'not-a-date' }));
    }).toThrow('A resolution date must be a valid date.');
  });
});
