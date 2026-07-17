import * as PolicyPlane from '../../../../src/databox/policy/PolicyEngine';
import type { EvaluationResult } from '../../../../src/databox/policy/PolicyEvaluator';
import { admitBundle } from '../../../../src/databox/policy/BundleAdmission';
import { checkComplexity } from '../../../../src/databox/policy/ComplexityGuard';
import { resolveConflict } from '../../../../src/databox/policy/ConflictStrategy';
import { evaluateConstraint } from '../../../../src/databox/policy/ConstraintEvaluation';
import { DutyEngine } from '../../../../src/databox/policy/DutyEngine';
import { issueReceiptHandler } from '../../../../src/databox/policy/DutyHandlers';
import { isFulfilled } from '../../../../src/databox/policy/DutyStateMachine';
import { computeBundleDigest, EVALUATOR_VERSION } from '../../../../src/databox/policy/PolicyBundle';
import { toPreconditionDecision } from '../../../../src/databox/policy/PolicyEngine';
import { PolicyEvaluator } from '../../../../src/databox/policy/PolicyEvaluator';
import { PolicyRegistry } from '../../../../src/databox/policy/PolicyRegistry';

describe('PolicyEngine entry module', (): void => {
  it('maps an evaluation result to the C4 OdrlPreconditionDecision (narrow-only conjunct).', (): void => {
    const permitted: EvaluationResult = { outcome: 'permitted', reason: 'permitted', activatedDuties: []};
    const denied: EvaluationResult = { outcome: 'fail-closed', reason: 'unsupported-term', activatedDuties: []};
    expect(toPreconditionDecision(permitted)).toStrictEqual({ outcome: 'permitted' });
    expect(toPreconditionDecision(denied)).toStrictEqual({ outcome: 'fail-closed' });
  });

  it('re-exports the whole policy plane through the single entry module (barrel coverage).', (): void => {
    expect(PolicyPlane.admitBundle).toBe(admitBundle);
    expect(PolicyPlane.PolicyRegistry).toBe(PolicyRegistry);
    expect(PolicyPlane.PolicyEvaluator).toBe(PolicyEvaluator);
    expect(PolicyPlane.DutyEngine).toBe(DutyEngine);
    expect(PolicyPlane.resolveConflict).toBe(resolveConflict);
    expect(PolicyPlane.computeBundleDigest).toBe(computeBundleDigest);
    expect(PolicyPlane.checkComplexity).toBe(checkComplexity);
    expect(PolicyPlane.evaluateConstraint).toBe(evaluateConstraint);
    expect(PolicyPlane.isFulfilled).toBe(isFulfilled);
    expect(PolicyPlane.issueReceiptHandler).toBe(issueReceiptHandler);
    expect(PolicyPlane.EVALUATOR_VERSION).toBe(EVALUATOR_VERSION);
    expect(PolicyPlane.EVALUATOR_VERSION).toBe('dbx-eval/1');
  });
});
