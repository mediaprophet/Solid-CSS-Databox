import * as PolicyPlane from '../../../../src/databox/policy/PolicyEngine';
import type { EvaluationResult } from '../../../../src/databox/policy/PolicyEvaluator';
import { toPreconditionDecision } from '../../../../src/databox/policy/PolicyEngine';

describe('PolicyEngine entry module', (): void => {
  it('maps an evaluation result to the C4 OdrlPreconditionDecision (narrow-only conjunct).', (): void => {
    const permitted: EvaluationResult = { outcome: 'permitted', reason: 'permitted', activatedDuties: []};
    const denied: EvaluationResult = { outcome: 'fail-closed', reason: 'unsupported-term', activatedDuties: []};
    expect(toPreconditionDecision(permitted)).toStrictEqual({ outcome: 'permitted' });
    expect(toPreconditionDecision(denied)).toStrictEqual({ outcome: 'fail-closed' });
  });

  it('re-exports the whole policy plane through the single entry module (barrel coverage).', (): void => {
    expect(PolicyPlane.admitBundle).toBeDefined();
    expect(PolicyPlane.PolicyRegistry).toBeDefined();
    expect(PolicyPlane.PolicyEvaluator).toBeDefined();
    expect(PolicyPlane.DutyEngine).toBeDefined();
    expect(PolicyPlane.resolveConflict).toBeDefined();
    expect(PolicyPlane.computeBundleDigest).toBeDefined();
    expect(PolicyPlane.checkComplexity).toBeDefined();
    expect(PolicyPlane.evaluateConstraint).toBeDefined();
    expect(PolicyPlane.isFulfilled).toBeDefined();
    expect(PolicyPlane.issueReceiptHandler).toBeDefined();
    expect(PolicyPlane.EVALUATOR_VERSION).toBe('dbx-eval/1');
  });
});
