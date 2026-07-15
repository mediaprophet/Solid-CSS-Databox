import type { PolicyRule } from '../../../../src/databox/policy/PolicyBundle';
import {
  checkComplexity,
  DEFAULT_COMPLEXITY_BUDGET,
  exceedsComplexity,
} from '../../../../src/databox/policy/ComplexityGuard';
import { buildBundle, permissionRule } from './PolicyTestSupport';

const TINY = { maxRules: 2, maxConstraintsPerRule: 1, maxDutiesPerRule: 1 };

function rules(count: number, template: PolicyRule = permissionRule({ duties: []})): PolicyRule[] {
  return Array.from({ length: count }, (): PolicyRule => template);
}

describe('checkComplexity (T-57)', (): void => {
  it('is within budget for a normal bundle under the default caps.', (): void => {
    expect(checkComplexity(buildBundle())).toBe('within-budget');
    expect(exceedsComplexity(buildBundle())).toBe(false);
  });

  it('fails closed on too many rules.', (): void => {
    const bundle = buildBundle({ rules: rules(3) });
    expect(checkComplexity(bundle, TINY)).toBe('too-many-rules');
    expect(exceedsComplexity(bundle, TINY)).toBe(true);
  });

  it('fails closed on too many constraints in a single rule.', (): void => {
    const heavy = permissionRule({
      duties: [],
      constraints: [
        { leftOperand: 'a', operator: 'b', rightOperand: 'c' },
        { leftOperand: 'a', operator: 'b', rightOperand: 'c' },
      ],
    });
    expect(checkComplexity(buildBundle({ rules: [ heavy ]}), TINY)).toBe('too-many-constraints');
  });

  it('fails closed on too many duties in a single rule.', (): void => {
    const heavy = permissionRule({ duties: [ 'd1', 'd2' ]});
    expect(checkComplexity(buildBundle({ rules: [ heavy ]}), TINY)).toBe('too-many-duties');
  });

  it('exposes generous-but-finite default caps.', (): void => {
    expect(DEFAULT_COMPLEXITY_BUDGET.maxRules).toBeGreaterThan(0);
    expect(DEFAULT_COMPLEXITY_BUDGET.maxConstraintsPerRule).toBeGreaterThan(0);
    expect(DEFAULT_COMPLEXITY_BUDGET.maxDutiesPerRule).toBeGreaterThan(0);
  });
});
