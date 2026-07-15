import type { OdrlPreconditionDecision } from '../authorization/DataboxAuthorizationInput';
import type { EvaluationResult } from './PolicyEvaluator';

/**
 * Entry module for the Databox ODRL evaluator + obligation engine (component C12, DBX-20). It re-exports
 * every sibling of `src/databox/policy/` so ONE barrel line —
 * `export * from './policy/PolicyEngine'` (to be added to `src/databox/index.ts` by whoever DI-wires C12;
 * see `databox/handoffs/DBX-20.md` §barrel) — transitively re-exports the whole plane, mirroring the
 * DBX-11/DBX-14/DBX-18/DBX-19 one-entry-file-re-exports-siblings pattern. This module does NOT edit the
 * central barrel (forbidden by the DBX-20 constraints).
 */

export * from './PolicyBundle';
export * from './BundleAdmission';
export * from './PolicyRegistry';
export * from './ConstraintEvaluation';
export * from './ComplexityGuard';
export * from './ConflictStrategy';
export * from './PolicyEvaluator';
export * from './DutyStateMachine';
export * from './DutyEngine';
export * from './DutyHandlers';

/**
 * Map a deterministic {@link EvaluationResult} to the C4 {@link OdrlPreconditionDecision} the composed
 * authorizer (DBX-14) consumes as a NARROW-ONLY conjunct. The mapping is total and lossless on the outcome:
 * a `permitted` never broadens reachability; a `prohibited`/`fail-closed` subtracts (ADR-0013 §two-plane).
 */
export function toPreconditionDecision(result: EvaluationResult): OdrlPreconditionDecision {
  return { outcome: result.outcome };
}
