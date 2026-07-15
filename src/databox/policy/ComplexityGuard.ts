import type { CompiledPolicyBundle } from './PolicyBundle';

/**
 * Bounded-complexity guard for the policy path (component C12; DBX-03 T-57 — "Crafted policy/credential
 * forces pathologically expensive ODRL conflict resolution ... on the auth path"). A crafted bundle MUST
 * NOT be able to force unbounded evaluation work: the number of rules, the constraints per rule and the
 * duties per rule are each capped, and a bundle exceeding any cap fails closed BEFORE evaluation begins
 * (ADR-0012/0013 fail-closed). The caps are a per-deployment tuning input (T-57 §Notes); the defaults are
 * generous for real policies yet finite.
 */

/** The evaluation-complexity caps. Exceeding any one fails closed (T-57). */
export interface ComplexityBudget {
  /** Maximum number of rules a bundle may carry. */
  readonly maxRules: number;
  /** Maximum number of constraints any single rule may carry. */
  readonly maxConstraintsPerRule: number;
  /** Maximum number of duties any single permission may carry. */
  readonly maxDutiesPerRule: number;
}

/** Generous-but-finite default caps (T-57 — tuning per deployment). */
export const DEFAULT_COMPLEXITY_BUDGET: ComplexityBudget = {
  maxRules: 256,
  maxConstraintsPerRule: 64,
  maxDutiesPerRule: 64,
};

/** Why a complexity check resolved (audit reason code); `within-budget` when nothing was exceeded. */
export type ComplexityReason =
  | 'within-budget' |
  'too-many-rules' |
  'too-many-constraints' |
  'too-many-duties';

/**
 * Return the first cap a bundle exceeds, or `within-budget`. Total and side-effect-free: it only counts,
 * it never evaluates, so the guard itself cannot be the expensive path.
 */
export function checkComplexity(
  bundle: CompiledPolicyBundle,
  budget: ComplexityBudget = DEFAULT_COMPLEXITY_BUDGET,
): ComplexityReason {
  if (bundle.rules.length > budget.maxRules) {
    return 'too-many-rules';
  }
  for (const rule of bundle.rules) {
    if ((rule.constraints ?? []).length > budget.maxConstraintsPerRule) {
      return 'too-many-constraints';
    }
    if ((rule.duties ?? []).length > budget.maxDutiesPerRule) {
      return 'too-many-duties';
    }
  }
  return 'within-budget';
}

/** Convenience boolean form of {@link checkComplexity}. */
export function exceedsComplexity(bundle: CompiledPolicyBundle, budget?: ComplexityBudget): boolean {
  return checkComplexity(bundle, budget) !== 'within-budget';
}
