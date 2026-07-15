import { checkTermSupport } from '../odrl/TermSupport';
import { exceedsComplexity } from './ComplexityGuard';
import type { ComplexityBudget } from './ComplexityGuard';
import type { CandidateRule, NonRelaxableInvariants, PolicyOutcome } from './ConflictStrategy';
import { resolveConflict } from './ConflictStrategy';
import type { OperandValues } from './ConstraintEvaluation';
import { evaluateConstraints } from './ConstraintEvaluation';
import type { CompiledPolicyBundle, PolicyRule } from './PolicyBundle';
import { isBundleSubstituted } from './PolicyBundle';
import type { PolicyRegistry } from './PolicyRegistry';

/**
 * The deterministic ODRL evaluator (component C12, IF-04; ADR-0012/0013/0014/0015). For a (target class,
 * action, time) it: selects the governing immutable version by effective-time (ADR-0014); re-binds the
 * compiled-policy digest so a SUBSTITUTED bundle is detected (T-25); bounds evaluation complexity (T-57);
 * rejects any UNSUPPORTED term (fail closed); matches permission/prohibition rules and their constraints;
 * and applies the ONE deterministic conflict strategy (ADR-0013). Every non-permit is a fail-closed/deny
 * with a specific audit reason. It NEVER interprets law (ADR-0015) — it applies the attested bundle.
 *
 * The result is a value the composed authorizer (C4, DBX-14) consumes as a NARROW-ONLY conjunct: a
 * `permitted` never broadens reachability; only `prohibited`/`fail-closed` subtract.
 */

/** The evaluation request: what use is being checked, when, and the verified operand facts. */
export interface EvaluationRequest {
  /** The asset class the action targets (matched against each rule's `target`). */
  readonly assetClass: string;
  /** The action IRI being evaluated. */
  readonly action: string;
  /**
   * MED-2 — the TRUSTED server decision time (ISO-8601) used to select the governing version by
   * effective-time (ADR-0014). This MUST be a server-side clock value, NEVER a client-supplied / request-
   * echoed timestamp: immutable versions are selected by effective-interval containment, so a caller who
   * could set this could pick an earlier, more-permissive attested version without touching any digest
   * (temporal version-substitution). It is named `serverDecisionTime` to make that contract explicit; C4
   * MUST populate it from a trusted clock.
   */
  readonly serverDecisionTime: string;
  /** The verified operand values keyed by left-operand IRI (from the C3 context, never headers). */
  readonly operandValues?: OperandValues;
  /**
   * MED-4 (residual) — the external non-relaxable invariant facts (ADR-0013 §1). These MUST be populated by
   * the C4/C5/C3 code-level gates from VERIFIED facts, NEVER from request-echoed values; a spoofed value
   * here could relax a stage-1 invariant. The trusted-source contract is a recorded review gate (handoff §7).
   */
  readonly invariants?: NonRelaxableInvariants;
}

/** The deterministic evaluation outcome, with the version binding for evidence (ADR-0019). */
export interface EvaluationResult {
  /** `permitted` allows; `prohibited`/`fail-closed` deny (ADR-0013). */
  readonly outcome: PolicyOutcome;
  /** The specific audit reason (never protected content, ADR-0013 §Privacy). */
  readonly reason: string;
  /** The duties activated by a permission (empty otherwise); consumed by the obligation engine. */
  readonly activatedDuties: readonly string[];
  /** The governing policy version label, when a version was selected. */
  readonly policyVersion?: string;
  /** The governing compiled-policy digest, when a version was selected (review #18 binding). */
  readonly policyDigest?: string;
}

/**
 * The term categories checked for support on a matching candidate rule (unsupported ⇒ fail closed). The
 * rule's ACTION is not re-checked here: a rule only reaches this function when its action equals the
 * request action, which {@link PolicyEvaluator.evaluateRules} has already validated as supported.
 */
function unsupportedTerm(rule: PolicyRule): boolean {
  if (!checkTermSupport('sourceRank', rule.source).supported) {
    return true;
  }
  for (const constraint of rule.constraints ?? []) {
    if (!checkTermSupport('leftOperand', constraint.leftOperand).supported ||
      !checkTermSupport('operator', constraint.operator).supported) {
      return true;
    }
  }
  for (const duty of rule.duties ?? []) {
    if (!checkTermSupport('duty', duty).supported) {
      return true;
    }
  }
  return false;
}

export class PolicyEvaluator {
  private readonly registry: PolicyRegistry;
  private readonly budget?: ComplexityBudget;

  /**
   * @param registry - The immutable policy registry (C12) the governing version is resolved from.
   * @param budget - The T-57 complexity caps; omitted uses {@link DEFAULT_COMPLEXITY_BUDGET}.
   */
  public constructor(registry: PolicyRegistry, budget?: ComplexityBudget) {
    this.registry = registry;
    this.budget = budget;
  }

  /**
   * Evaluate one (assetClass, action, time). Total: it always returns an {@link EvaluationResult} and never
   * throws for a policy-domain condition — every failure is a fail-closed/deny with a reason.
   */
  public evaluate(request: EvaluationRequest): EvaluationResult {
    const resolution = this.registry.resolve(request.assetClass, request.serverDecisionTime);
    if (!resolution.ok) {
      return { outcome: 'fail-closed', reason: resolution.reason, activatedDuties: []};
    }
    const bundle = resolution.bundle;
    const binding = { policyVersion: bundle.policyVersion, policyDigest: bundle.compiledPolicyDigest };

    // T-25: bind evaluation to the pinned digest — a substituted/tampered bundle is denied and audit-visible.
    if (isBundleSubstituted(bundle)) {
      return { outcome: 'fail-closed', reason: 'policy-substitution', activatedDuties: [], ...binding };
    }
    // T-57: a crafted bundle cannot force unbounded work — cap and fail closed before evaluating.
    if (exceedsComplexity(bundle, this.budget)) {
      return { outcome: 'fail-closed', reason: 'complexity-exceeded', activatedDuties: [], ...binding };
    }
    return this.evaluateRules(bundle, request, binding);
  }

  /** Match rules, evaluate constraints and compose — split out so {@link evaluate} stays flat. */
  private evaluateRules(
    bundle: CompiledPolicyBundle,
    request: EvaluationRequest,
    binding: { readonly policyVersion: string; readonly policyDigest: string },
  ): EvaluationResult {
    if (!checkTermSupport('action', request.action).supported) {
      return { outcome: 'fail-closed', reason: 'unsupported-term', activatedDuties: [], ...binding };
    }
    const operandValues = request.operandValues ?? {};
    const candidates: CandidateRule[] = [];
    for (const rule of bundle.rules) {
      if (rule.target !== request.assetClass || rule.action !== request.action) {
        continue;
      }
      // HIGH-1: a matching rule whose ruleType is neither 'permission' nor 'prohibition' (a typo/garbage on
      // a signed bundle) fails closed HERE rather than reaching the resolver as an inert candidate.
      if (rule.ruleType !== 'permission' && rule.ruleType !== 'prohibition') {
        return { outcome: 'fail-closed', reason: 'unsupported-rule-type', activatedDuties: [], ...binding };
      }
      if (unsupportedTerm(rule)) {
        return { outcome: 'fail-closed', reason: 'unsupported-term', activatedDuties: [], ...binding };
      }
      const constraintResult = evaluateConstraints(rule.constraints ?? [], operandValues);
      if (constraintResult === 'indeterminate') {
        // An operand this build cannot evaluate makes the rule ambiguous → fail closed (ADR-0013 §5).
        return { outcome: 'fail-closed', reason: 'ambiguous-constraint', activatedDuties: [], ...binding };
      }
      if (constraintResult === 'satisfied') {
        candidates.push({
          ruleType: rule.ruleType,
          source: rule.source,
          duties: [ ...rule.duties ?? [] ],
          ...rule.conflictStrategy === undefined ? {} : { conflictStrategy: rule.conflictStrategy },
        });
      }
    }
    const resolved = resolveConflict({ invariants: request.invariants ?? {}, candidates });
    return {
      outcome: resolved.outcome,
      reason: resolved.reason,
      activatedDuties: resolved.activatedDuties,
      ...binding,
    };
  }
}
