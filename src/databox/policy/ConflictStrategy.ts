import { isTermSupported } from '../odrl/TermSupport';
import { SOURCE_RANK_ORDER } from './PolicyBundle';

/**
 * The ONE deterministic Databox conflict strategy (component C12; ADR-0013). It resolves a set of
 * already-constraint-matched candidate rules to exactly one of `permitted` / `prohibited` / `fail-closed`,
 * by applying the ADR-0013 ordered stages; the first decisive stage wins and every fail-closed carries a
 * specific reason for the audit ledger.
 *
 * 1. **External non-relaxable invariants** (tenant isolation, cross-program, assurance) — code-level gates
 *    OUTSIDE the policy corpus; if any denies, the result is `prohibited` and evaluation stops. A policy
 *    cannot relax these (ADR-0013 §1).
 * 2. **WebCivics source ordering** — `mandatoryBaseline` > `guardianPolicy` > `userPreference`; the most
 *    authoritative rank present decides. A rule with an unknown rank is an ambiguous rank → fail closed.
 * 3. **ODRL conflict operand**, only for a genuine same-rank permission↔prohibition conflict — an
 *    unsupported declared strategy fails closed; a supported/absent one resolves to the MORE PROTECTIVE
 *    result (`prohibited`), never a permit-overrides bypass (that strategy is intentionally unsupported).
 * 4. **Fail-closed default** — no applicable rule, or any residual the stages did not decide, denies.
 *
 * Two-plane separation (ADR-0013 §two-plane) holds structurally: this function only ever returns
 * `permitted` (carrying the permission's duties) or a DENY (`prohibited`/`fail-closed`); a permission can
 * never broaden reachability because the composed authorizer (C4, DBX-14) consumes this as a narrow-only
 * conjunct.
 */

/** The composed use-decision (mirrors the C4 `OdrlPreconditionDecision.outcome`). */
export type PolicyOutcome = 'permitted' | 'prohibited' | 'fail-closed';

/**
 * The external non-relaxable invariants (ADR-0013 §1). These are decided by code-level gates (C4/C5/C3),
 * NOT by the policy corpus, and are passed in as already-decided facts. Any true value denies.
 */
export interface NonRelaxableInvariants {
  /** A program-specific policy attempted to reach across the tenant boundary. */
  readonly tenantIsolationViolated?: boolean;
  /** The action would reach across the Databox/program boundary. */
  readonly crossProgram?: boolean;
  /** Authentication assurance is insufficient for the action. */
  readonly assuranceDenied?: boolean;
}

/** A candidate rule that already matched the target+action and whose constraints all held. */
export interface CandidateRule {
  /** Whether this rule permits or prohibits. */
  readonly ruleType: 'permission' | 'prohibition';
  /** The WebCivics source-rank IRI (ADR-0013 stage 2). */
  readonly source: string;
  /** The duty action IRIs this permission activates (empty for a prohibition). */
  readonly duties: readonly string[];
  /** The declared ODRL conflict-strategy IRI, honoured only within a single rank (ADR-0013 §3). */
  readonly conflictStrategy?: string;
}

/** The input to {@link resolveConflict}. */
export interface ConflictInput {
  /** The external invariant facts (stage 1). */
  readonly invariants: NonRelaxableInvariants;
  /** The constraint-matched candidate rules (stages 2–3). */
  readonly candidates: readonly CandidateRule[];
}

/** The deterministic resolution: an outcome, a reason code, and the activated duties (only when permitted). */
export interface ConflictResolution {
  readonly outcome: PolicyOutcome;
  readonly reason: string;
  readonly activatedDuties: readonly string[];
}

function deny(outcome: 'prohibited' | 'fail-closed', reason: string): ConflictResolution {
  return { outcome, reason, activatedDuties: []};
}

/** Stage 1: the external non-relaxable invariants; the first that denies wins (ADR-0013 §1). */
function checkInvariants(invariants: NonRelaxableInvariants): ConflictResolution | undefined {
  if (invariants.tenantIsolationViolated === true) {
    return deny('prohibited', 'external-invariant:tenant-isolation');
  }
  if (invariants.crossProgram === true) {
    return deny('prohibited', 'external-invariant:cross-program');
  }
  if (invariants.assuranceDenied === true) {
    return deny('prohibited', 'external-invariant:assurance');
  }
  return undefined;
}

/** Resolve a genuine same-rank permission↔prohibition conflict (ADR-0013 §3). */
function resolveSameRankConflict(rulesAtTop: readonly CandidateRule[]): ConflictResolution {
  // An unsupported declared conflict strategy where a real conflict exists → fail closed (ADR-0013 §3→§5).
  for (const rule of rulesAtTop) {
    if (rule.conflictStrategy !== undefined && !isTermSupported('conflictStrategy', rule.conflictStrategy)) {
      return deny('fail-closed', 'unsupported-policy');
    }
  }
  // Supported or absent strategy: the MORE PROTECTIVE result wins — a prohibition is more protective than a
  // permission for a use decision. permit-overrides is intentionally unsupported, so it never reaches here.
  return deny('prohibited', 'more-protective-wins');
}

/**
 * Resolve a set of candidate rules to one deterministic outcome (ADR-0013). Total: it always returns a
 * result and never throws. `permitted` carries the union of the top-rank permissions' duties.
 */
export function resolveConflict(input: ConflictInput): ConflictResolution {
  const invariantDenial = checkInvariants(input.invariants);
  if (invariantDenial !== undefined) {
    return invariantDenial;
  }
  if (input.candidates.length === 0) {
    return deny('fail-closed', 'no-applicable-rule');
  }
  // Every candidate must carry a known source rank; an unknown rank is ambiguous → fail closed.
  for (const candidate of input.candidates) {
    if (SOURCE_RANK_ORDER[candidate.source] === undefined) {
      return deny('fail-closed', 'ambiguous-rank');
    }
  }
  const topRank = Math.min(...input.candidates.map((candidate): number => SOURCE_RANK_ORDER[candidate.source]));
  const rulesAtTop = input.candidates.filter(
    (candidate): boolean => SOURCE_RANK_ORDER[candidate.source] === topRank,
  );
  const hasProhibition = rulesAtTop.some((rule): boolean => rule.ruleType === 'prohibition');
  const hasPermission = rulesAtTop.some((rule): boolean => rule.ruleType === 'permission');
  if (hasProhibition && hasPermission) {
    return resolveSameRankConflict(rulesAtTop);
  }
  if (hasProhibition) {
    // A prohibition at the most authoritative rank wins (prohibition-beats-broad-permission, ADR-0013 §1/§2).
    return deny('prohibited', 'source-ordering');
  }
  // HIGH-1: only permit when a VALID permission is present. A candidate whose ruleType is neither
  // 'permission' nor 'prohibition' leaves both flags false; without this guard the function would fall
  // through to a `permitted` with NO valid permission (fail OPEN). Require hasPermission, else fail closed.
  if (!hasPermission) {
    return deny('fail-closed', 'no-applicable-rule');
  }
  // Only permissions at the top rank: permitted, carrying the union of their duties (deduped, order-stable).
  const duties: string[] = [];
  for (const rule of rulesAtTop) {
    for (const duty of rule.duties) {
      if (!duties.includes(duty)) {
        duties.push(duty);
      }
    }
  }
  return { outcome: 'permitted', reason: 'permitted', activatedDuties: duties };
}
