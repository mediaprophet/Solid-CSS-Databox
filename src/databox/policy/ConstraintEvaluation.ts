import { ODRL_NAMESPACE } from '../odrl/terms';
import type { PolicyConstraint } from './PolicyBundle';

/**
 * Deterministic, side-effect-free evaluation of a single ODRL constraint against the request's operand
 * values (component C12; ADR-0013). A constraint resolves to exactly one of three states:
 *
 * - `satisfied` — the operand value is present and the comparison holds;
 * - `unsatisfied` — the operand value is present and the comparison does not hold;
 * - `indeterminate` — the operand value is absent, OR the operator is not one this evaluator build
 *   computes. An `indeterminate` constraint makes its rule AMBIGUOUS, and the evaluator fails closed
 *   (ADR-0013 §5 "ambiguous ... fails closed"). This is deliberate: a supported-by-profile operator this
 *   build cannot yet evaluate denies rather than guesses.
 *
 * The evaluator's term-support gate ({@link ../odrl/TermSupport}) separately rejects operators the PROFILE
 * does not support; this module additionally bounds what is actually computable, never silently permitting.
 */

/** The outcome of evaluating one constraint. */
export type ConstraintResult = 'satisfied' | 'unsatisfied' | 'indeterminate';

/** Request operand values keyed by the constraint left-operand IRI (verified context facts, never headers). */
export type OperandValues = Readonly<Record<string, string>>;

const OPERATOR = {
  eq: `${ODRL_NAMESPACE}eq`,
  neq: `${ODRL_NAMESPACE}neq`,
  isA: `${ODRL_NAMESPACE}isA`,
  isAnyOf: `${ODRL_NAMESPACE}isAnyOf`,
  isNoneOf: `${ODRL_NAMESPACE}isNoneOf`,
} as const;

/** The right operand of `isAnyOf`/`isNoneOf` is a space-separated set of literals. */
function rightSet(rightOperand: string): readonly string[] {
  return rightOperand.split(' ').filter((token): boolean => token.length > 0);
}

/**
 * Evaluate `constraint` against `values`. A missing left-operand value or an operator this build does not
 * compute is `indeterminate` (fail-closed at the evaluator). `isA` is treated as class-membership equality
 * over the synthetic operand values (the runtime performs no ontology reasoning, ADR-0015).
 */
export function evaluateConstraint(constraint: PolicyConstraint, values: OperandValues): ConstraintResult {
  const actual = values[constraint.leftOperand];
  if (actual === undefined) {
    return 'indeterminate';
  }
  switch (constraint.operator) {
    case OPERATOR.eq:
    case OPERATOR.isA:
      return actual === constraint.rightOperand ? 'satisfied' : 'unsatisfied';
    case OPERATOR.neq:
      return actual === constraint.rightOperand ? 'unsatisfied' : 'satisfied';
    case OPERATOR.isAnyOf:
      return rightSet(constraint.rightOperand).includes(actual) ? 'satisfied' : 'unsatisfied';
    case OPERATOR.isNoneOf:
      return rightSet(constraint.rightOperand).includes(actual) ? 'unsatisfied' : 'satisfied';
    default:
      return 'indeterminate';
  }
}

/**
 * Combine every constraint of a rule into a single result: `satisfied` only if ALL are satisfied;
 * `indeterminate` if ANY is indeterminate (ambiguity dominates → fail closed); otherwise `unsatisfied`.
 * A rule with no constraints is trivially `satisfied`.
 */
export function evaluateConstraints(
  constraints: readonly PolicyConstraint[],
  values: OperandValues,
): ConstraintResult {
  let allSatisfied = true;
  for (const constraint of constraints) {
    const result = evaluateConstraint(constraint, values);
    if (result === 'indeterminate') {
      return 'indeterminate';
    }
    if (result === 'unsatisfied') {
      allSatisfied = false;
    }
  }
  return allSatisfied ? 'satisfied' : 'unsatisfied';
}
