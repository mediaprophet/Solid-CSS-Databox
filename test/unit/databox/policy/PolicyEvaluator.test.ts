import {
  DBX_CONFLICT_STRATEGIES,
  DBX_DUTIES,
  DBX_LEFT_OPERANDS,
  DBX_SOURCE_RANKS,
  ODRL_NAMESPACE,
} from '../../../../src/databox/odrl/terms';
import type { AdmissionResult } from '../../../../src/databox/policy/BundleAdmission';
import type { CompiledPolicyBundle } from '../../../../src/databox/policy/PolicyBundle';
import { PolicyEvaluator } from '../../../../src/databox/policy/PolicyEvaluator';
import type { PolicyRegistry } from '../../../../src/databox/policy/PolicyRegistry';
import { PolicyRegistry as RealRegistry } from '../../../../src/databox/policy/PolicyRegistry';
import { ASSET_CLASS, buildBundle, EQ_OP, permissionRule, prohibitionRule, READ_ACTION } from './PolicyTestSupport';

const AT = '2026-08-01T00:00:00Z';
const PURPOSE = DBX_LEFT_OPERANDS.declaredPurpose;

function registryWith(bundle: CompiledPolicyBundle): RealRegistry {
  const registry = new RealRegistry();
  const admission: AdmissionResult = { admitted: true, reason: 'admitted', bundle };
  registry.register(admission);
  return registry;
}

function evaluate(
  bundle: CompiledPolicyBundle,
  values: Record<string, string> = {},
): ReturnType<PolicyEvaluator['evaluate']> {
  return new PolicyEvaluator(registryWith(bundle)).evaluate({
    assetClass: ASSET_CLASS,
    action: READ_ACTION,
    serverDecisionTime: AT,
    operandValues: values,
  });
}

describe('PolicyEvaluator.evaluate', (): void => {
  it('permits a matching permission and returns its activated duties + the version binding.', (): void => {
    const result = evaluate(buildBundle());
    expect(result.outcome).toBe('permitted');
    expect(result.activatedDuties).toStrictEqual([ DBX_DUTIES.issueReceipt, DBX_DUTIES.signalHolder ]);
    expect(result.policyVersion).toBe('v1');
    expect(result.policyDigest).toBe(buildBundle().compiledPolicyDigest);
  });

  it('prohibits when only a prohibition applies.', (): void => {
    const result = evaluate(buildBundle({ rules: [ prohibitionRule({ source: DBX_SOURCE_RANKS.mandatoryBaseline }) ]}));
    expect(result.outcome).toBe('prohibited');
    expect(result.reason).toBe('source-ordering');
  });

  it('fails closed when no governing version is registered for the time.', (): void => {
    const result = new PolicyEvaluator(new RealRegistry())
      .evaluate({ assetClass: ASSET_CLASS, action: READ_ACTION, serverDecisionTime: AT });
    expect(result).toStrictEqual({ outcome: 'fail-closed', reason: 'no-governing-version', activatedDuties: []});
  });

  it('fails closed and audit-visible on a SUBSTITUTED bundle (T-25).', (): void => {
    const tampered = { ...buildBundle(), policyVersion: 'tampered-after-seal' };
    const stub = { resolve: (): unknown => ({ ok: true, reason: 'resolved', bundle: tampered }) } as unknown as
    PolicyRegistry;
    const result = new PolicyEvaluator(stub)
      .evaluate({ assetClass: ASSET_CLASS, action: READ_ACTION, serverDecisionTime: AT });
    expect(result.outcome).toBe('fail-closed');
    expect(result.reason).toBe('policy-substitution');
    expect(result.policyVersion).toBe('tampered-after-seal');
  });

  it('fails closed when the bundle exceeds the complexity budget (T-57).', (): void => {
    const bundle = buildBundle({ rules: [ permissionRule({ duties: []}), permissionRule({ duties: []}) ]});
    const budget = { maxRules: 1, maxConstraintsPerRule: 1, maxDutiesPerRule: 1 };
    const result = new PolicyEvaluator(registryWith(bundle), budget)
      .evaluate({ assetClass: ASSET_CLASS, action: READ_ACTION, serverDecisionTime: AT });
    expect(result.reason).toBe('complexity-exceeded');
  });

  it('fails closed on an unsupported REQUESTED action.', (): void => {
    const result = new PolicyEvaluator(registryWith(buildBundle()))
      .evaluate({ assetClass: ASSET_CLASS, action: 'https://example/unknown-action', serverDecisionTime: AT });
    expect(result.reason).toBe('unsupported-term');
  });

  it('fails closed on a matching rule with an unsupported source rank, operand, operator or duty.', (): void => {
    const badSource = evaluate(buildBundle({ rules: [ permissionRule({ source: 'https://x/rank', duties: []}) ]}));
    expect(badSource.reason).toBe('unsupported-term');

    const badOperand = evaluate(buildBundle({ rules: [ permissionRule({
      duties: [],
      constraints: [{ leftOperand: 'https://x/operand', operator: EQ_OP, rightOperand: 'v' }],
    }) ]}), { [PURPOSE]: 'v' });
    expect(badOperand.reason).toBe('unsupported-term');

    const badOperator = evaluate(buildBundle({ rules: [ permissionRule({
      duties: [],
      constraints: [{ leftOperand: PURPOSE, operator: 'https://x/op', rightOperand: 'v' }],
    }) ]}), { [PURPOSE]: 'v' });
    expect(badOperator.reason).toBe('unsupported-term');

    const badDuty = evaluate(buildBundle({ rules: [ permissionRule({ duties: [ 'https://x/duty' ]}) ]}));
    expect(badDuty.reason).toBe('unsupported-term');
  });

  it('fails closed on an ambiguous (indeterminate) constraint (ADR-0013 §5).', (): void => {
    const bundle = buildBundle({ rules: [ permissionRule({
      duties: [],
      constraints: [{ leftOperand: PURPOSE, operator: `${ODRL_NAMESPACE}gt`, rightOperand: '5' }],
    }) ]});
    expect(evaluate(bundle, { [PURPOSE]: '9' }).reason).toBe('ambiguous-constraint');
  });

  it('applies a satisfied constraint (permit) and excludes an unsatisfied one (no-applicable-rule).', (): void => {
    const constrained = permissionRule({
      duties: [ DBX_DUTIES.issueReceipt ],
      constraints: [{ leftOperand: PURPOSE, operator: EQ_OP, rightOperand: 'personal-recordkeeping' }],
    });
    const bundle = buildBundle({ rules: [ constrained ]});
    expect(evaluate(bundle, { [PURPOSE]: 'personal-recordkeeping' }).outcome).toBe('permitted');
    expect(evaluate(bundle, { [PURPOSE]: 'marketing' }).reason).toBe('no-applicable-rule');
  });

  it('ignores rules for a different action/class (no false match).', (): void => {
    const other = permissionRule({ action: `${ODRL_NAMESPACE}distribute`, duties: []});
    expect(evaluate(buildBundle({ rules: [ other ]})).reason).toBe('no-applicable-rule');
  });

  it('HIGH-1: fails closed on a matching rule with an invalid ruleType (never permits garbage).', (): void => {
    const garbage = { ...permissionRule({ duties: []}), ruleType: 'permit' as unknown as 'permission' };
    expect(evaluate(buildBundle({ rules: [ garbage ]})).reason).toBe('unsupported-rule-type');
  });

  it('permits with the default operand values when the request omits operandValues.', (): void => {
    const result = new PolicyEvaluator(registryWith(buildBundle()))
      .evaluate({ assetClass: ASSET_CLASS, action: READ_ACTION, serverDecisionTime: AT });
    expect(result.outcome).toBe('permitted');
  });

  it('carries a rule-declared conflict strategy through into the candidate (permits with no conflict).', (): void => {
    const withStrategy = permissionRule({ duties: [], conflictStrategy: DBX_CONFLICT_STRATEGIES.moreProtectiveWins });
    expect(evaluate(buildBundle({ rules: [ withStrategy ]})).outcome).toBe('permitted');
  });

  it('MED-2: the TRUSTED serverDecisionTime — not client input — selects the governing version.', (): void => {
    const registry = new RealRegistry();
    registry.register({ admitted: true, reason: 'admitted', bundle: buildBundle({
      policyVersion: 'v1',
      effectiveInterval: { effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: '2026-07-01T00:00:00Z' },
    }) });
    registry.register({ admitted: true, reason: 'admitted', bundle: buildBundle({
      policyVersion: 'v2',
      effectiveInterval: { effectiveFrom: '2026-07-01T00:00:00Z' },
    }) });
    const evaluator = new PolicyEvaluator(registry);
    const base = { assetClass: ASSET_CLASS, action: READ_ACTION } as const;
    expect(evaluator.evaluate({ ...base, serverDecisionTime: '2026-03-01T00:00:00Z' }).policyVersion).toBe('v1');
    expect(evaluator.evaluate({ ...base, serverDecisionTime: '2026-09-01T00:00:00Z' }).policyVersion).toBe('v2');
  });
});
