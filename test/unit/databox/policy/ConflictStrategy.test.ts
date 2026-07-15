import { DBX_CONFLICT_STRATEGIES, DBX_SOURCE_RANKS } from '../../../../src/databox/odrl/terms';
import type { CandidateRule } from '../../../../src/databox/policy/ConflictStrategy';
import { resolveConflict } from '../../../../src/databox/policy/ConflictStrategy';

const MANDATORY = DBX_SOURCE_RANKS.mandatoryBaseline;
const PREFERENCE = DBX_SOURCE_RANKS.userPreference;

function permission(source: string, duties: string[] = [], conflictStrategy?: string): CandidateRule {
  return { ruleType: 'permission', source, duties, ...conflictStrategy === undefined ? {} : { conflictStrategy }};
}
function prohibition(source: string, conflictStrategy?: string): CandidateRule {
  return { ruleType: 'prohibition', source, duties: [], ...conflictStrategy === undefined ? {} : { conflictStrategy }};
}

describe('resolveConflict (ADR-0013)', (): void => {
  it('stage 1: an external tenant-isolation invariant denies before any policy.', (): void => {
    expect(resolveConflict({ invariants: { tenantIsolationViolated: true }, candidates: [ permission(MANDATORY) ]}))
      .toStrictEqual({ outcome: 'prohibited', reason: 'external-invariant:tenant-isolation', activatedDuties: []});
  });

  it('stage 1: cross-program and assurance invariants each deny.', (): void => {
    expect(resolveConflict({ invariants: { crossProgram: true }, candidates: []}).reason)
      .toBe('external-invariant:cross-program');
    expect(resolveConflict({ invariants: { assuranceDenied: true }, candidates: []}).reason)
      .toBe('external-invariant:assurance');
  });

  it('fails closed with no applicable rule.', (): void => {
    expect(resolveConflict({ invariants: {}, candidates: []}))
      .toStrictEqual({ outcome: 'fail-closed', reason: 'no-applicable-rule', activatedDuties: []});
  });

  it('fails closed on an unknown (ambiguous) source rank.', (): void => {
    expect(resolveConflict({ invariants: {}, candidates: [ permission('https://example/unknown-rank') ]}).reason)
      .toBe('ambiguous-rank');
  });

  it('permits when only permissions apply at the top rank, unioning their duties (deduped).', (): void => {
    const result = resolveConflict({
      invariants: {},
      candidates: [ permission(MANDATORY, [ 'd1', 'd2' ]), permission(MANDATORY, [ 'd2', 'd3' ]) ],
    });
    expect(result.outcome).toBe('permitted');
    expect(result.activatedDuties).toStrictEqual([ 'd1', 'd2', 'd3' ]);
  });

  it('prohibits when a prohibition sits at the most authoritative rank (source ordering).', (): void => {
    // Prohibition at mandatory baseline outranks a permission at user preference.
    expect(resolveConflict({ invariants: {}, candidates: [ prohibition(MANDATORY), permission(PREFERENCE, [ 'd1' ]) ]}))
      .toStrictEqual({ outcome: 'prohibited', reason: 'source-ordering', activatedDuties: []});
  });

  it('same-rank conflict resolves to the more protective result with a supported/absent strategy.', (): void => {
    expect(resolveConflict({ invariants: {}, candidates: [ permission(MANDATORY), prohibition(MANDATORY) ]}))
      .toStrictEqual({ outcome: 'prohibited', reason: 'more-protective-wins', activatedDuties: []});
    expect(resolveConflict({
      invariants: {},
      candidates: [ permission(MANDATORY), prohibition(MANDATORY, DBX_CONFLICT_STRATEGIES.prohibitOverrides) ],
    }).reason).toBe('more-protective-wins');
  });

  it('same-rank conflict with an UNSUPPORTED declared strategy fails closed (ambiguous conflict).', (): void => {
    expect(resolveConflict({
      invariants: {},
      candidates: [ permission(MANDATORY, [], 'https://example/permit-overrides'), prohibition(MANDATORY) ],
    })).toStrictEqual({ outcome: 'fail-closed', reason: 'unsupported-policy', activatedDuties: []});
  });

  it('HIGH-1: fails CLOSED (never permits) on a candidate whose ruleType is neither permit nor prohibit.', (): void => {
    const garbage = { ruleType: 'permit', source: MANDATORY, duties: []} as unknown as CandidateRule;
    expect(resolveConflict({ invariants: {}, candidates: [ garbage ]}))
      .toStrictEqual({ outcome: 'fail-closed', reason: 'no-applicable-rule', activatedDuties: []});
  });
});
