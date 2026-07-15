import { DBX_LEFT_OPERANDS, ODRL_NAMESPACE } from '../../../../src/databox/odrl/terms';
import type { PolicyConstraint } from '../../../../src/databox/policy/PolicyBundle';
import { evaluateConstraint, evaluateConstraints } from '../../../../src/databox/policy/ConstraintEvaluation';

const PURPOSE = DBX_LEFT_OPERANDS.declaredPurpose;
function OP(local: string): string {
  return `${ODRL_NAMESPACE}${local}`;
}

function constraint(operator: string, rightOperand: string): PolicyConstraint {
  return { leftOperand: PURPOSE, operator, rightOperand };
}

describe('evaluateConstraint', (): void => {
  it('is indeterminate when the operand value is absent (fail closed at the evaluator).', (): void => {
    expect(evaluateConstraint(constraint(OP('eq'), 'x'), {})).toBe('indeterminate');
  });

  it('evaluates eq / isA as equality.', (): void => {
    expect(evaluateConstraint(constraint(OP('eq'), 'x'), { [PURPOSE]: 'x' })).toBe('satisfied');
    expect(evaluateConstraint(constraint(OP('eq'), 'x'), { [PURPOSE]: 'y' })).toBe('unsatisfied');
    expect(evaluateConstraint(constraint(OP('isA'), 'x'), { [PURPOSE]: 'x' })).toBe('satisfied');
  });

  it('evaluates neq.', (): void => {
    expect(evaluateConstraint(constraint(OP('neq'), 'x'), { [PURPOSE]: 'y' })).toBe('satisfied');
    expect(evaluateConstraint(constraint(OP('neq'), 'x'), { [PURPOSE]: 'x' })).toBe('unsatisfied');
  });

  it('evaluates isAnyOf / isNoneOf over a space-separated set.', (): void => {
    expect(evaluateConstraint(constraint(OP('isAnyOf'), 'a b c'), { [PURPOSE]: 'b' })).toBe('satisfied');
    expect(evaluateConstraint(constraint(OP('isAnyOf'), 'a b c'), { [PURPOSE]: 'z' })).toBe('unsatisfied');
    expect(evaluateConstraint(constraint(OP('isNoneOf'), 'a b c'), { [PURPOSE]: 'z' })).toBe('satisfied');
    expect(evaluateConstraint(constraint(OP('isNoneOf'), 'a b c'), { [PURPOSE]: 'a' })).toBe('unsatisfied');
  });

  it('is indeterminate for an operator this build does not compute (fail closed).', (): void => {
    expect(evaluateConstraint(constraint(OP('gt'), '5'), { [PURPOSE]: '9' })).toBe('indeterminate');
  });
});

describe('evaluateConstraints', (): void => {
  it('is satisfied when there are no constraints.', (): void => {
    expect(evaluateConstraints([], {})).toBe('satisfied');
  });

  it('is satisfied only when ALL constraints are satisfied.', (): void => {
    const values = { [PURPOSE]: 'x' };
    expect(evaluateConstraints([ constraint(OP('eq'), 'x'), constraint(OP('neq'), 'y') ], values)).toBe('satisfied');
    expect(evaluateConstraints([ constraint(OP('eq'), 'x'), constraint(OP('eq'), 'y') ], values)).toBe('unsatisfied');
  });

  it('is indeterminate (ambiguity dominates) if ANY constraint is indeterminate.', (): void => {
    expect(evaluateConstraints([ constraint(OP('eq'), 'x'), constraint(OP('gt'), '5') ], { [PURPOSE]: 'x' }))
      .toBe('indeterminate');
  });
});
