import { canonicalDigest } from '../proof/Canonicalization';
import { DBX_SOURCE_RANKS } from '../odrl/terms';

/**
 * Value types + pinned constants for the compiled, signed, human-attested policy bundle the evaluator
 * consumes (component C12, IF-19; ADR-0015 §Stable compiled-policy input interface, ADR-0014 §effective
 * interval, ADR-0013 §source ordering, ADR-0012 §duties). No runtime logic lives here beyond the pinned
 * digest computation, so the bundle shape is stated exactly once and cannot drift between the admission
 * gate ({@link ./BundleAdmission}), the registry ({@link ./PolicyRegistry}) and the evaluator
 * ({@link ./PolicyEvaluator}).
 *
 * The runtime NEVER interprets law (ADR-0015): the `attestation`, `jurisdiction`, `effectiveInterval` and
 * `updateEffect` are consumed as already-decided results of an authorized human attestation, copied
 * verbatim. A bundle without an `attested` attestation, or whose bound `compiledPolicyDigest` does not equal
 * its recomputed content digest, is inadmissible and fails closed (T-25 policy substitution).
 */

/** The evaluator version this build implements; a bundle bound to a different version is inadmissible. */
export const EVALUATOR_VERSION = 'dbx-eval/1';

/**
 * WebCivics source-rank precedence (ADR-0013 stage 2), keyed by the `dbx:` source-rank IRI. A LOWER number
 * is MORE authoritative (`mandatoryBaseline` outranks `guardianPolicy` outranks `userPreference`). A rule
 * whose source IRI is absent from this map is an ambiguous rank and fails closed (ADR-0013 §5).
 */
export const SOURCE_RANK_ORDER: Readonly<Record<string, number>> = {
  [DBX_SOURCE_RANKS.mandatoryBaseline]: 0,
  [DBX_SOURCE_RANKS.guardianPolicy]: 1,
  [DBX_SOURCE_RANKS.userPreference]: 2,
};

/** A single ODRL constraint (`leftOperand operator rightOperand`), all as absolute IRIs/literals. */
export interface PolicyConstraint {
  /** The constraint left operand IRI (a reused `odrl:` or custom `dbx:` operand). */
  readonly leftOperand: string;
  /** The comparison operator IRI (a reused `odrl:` operator). */
  readonly operator: string;
  /** The right operand literal/value the request context is compared against. */
  readonly rightOperand: string;
}

/**
 * A single ODRL permission/prohibition rule of a compiled bundle. A permission MAY carry precondition/
 * post-action duties (ADR-0012); a prohibition subtracts from the permitted-use set (ADR-0013 §two-plane).
 */
export interface PolicyRule {
  /** Whether this rule permits or prohibits the action. */
  readonly ruleType: 'permission' | 'prohibition';
  /** The asset class (or resource) the rule targets; matched against the evaluation request. */
  readonly target: string;
  /** The action IRI the rule governs (a reused `odrl:` or custom `dbx:` action). */
  readonly action: string;
  /** The WebCivics source-rank IRI (ADR-0013 stage 2). */
  readonly source: string;
  /** The constraints that must all be satisfied for the rule to apply (ADR-0013). */
  readonly constraints?: readonly PolicyConstraint[];
  /** The duty action IRIs activated by this permission (ADR-0012). */
  readonly duties?: readonly string[];
  /** The declared ODRL conflict-strategy IRI, honoured only within a single source rank (ADR-0013 §3). */
  readonly conflictStrategy?: string;
}

/**
 * The human-attestation record (ADR-0015 §Machine outputs are PROPOSED until attested). The runtime reads
 * ONLY `status` for admission and copies the rest verbatim into evidence; it never interprets the scope or
 * method as law. `status: 'proposed'` (or an absent attestation) is inadmissible and fails closed.
 */
export interface PolicyAttestation {
  /** The accountable human attester identity. */
  readonly attester: string;
  /** How the machine proposal was produced (opaque; never interpreted). */
  readonly method: string;
  /** The recorded verification state of the attestation. */
  readonly verificationState: string;
  /** The recorded scope of the attestation (opaque; never interpreted). */
  readonly scope: string;
  /** Admission gate: only `attested` is admissible; `proposed` fails closed (ADR-0015). */
  readonly status: 'attested' | 'proposed';
  /** The stable attestation identifier bound into evidence (ADR-0019). */
  readonly attestationId: string;
}

/** The effective interval a version governs (ADR-0014); `effectiveUntil` absent means open-ended. */
export interface EffectiveInterval {
  /** Wall-clock/legal time (ISO-8601) from which the version governs; distinct from authoring time. */
  readonly effectiveFrom: string;
  /** Optional exclusive upper bound (ISO-8601); absent means the version governs indefinitely. */
  readonly effectiveUntil?: string;
}

/**
 * A compiled, signed, human-attested policy bundle (ADR-0015). The evaluator applies what this states and
 * fails closed on anything unsupported; it decides NO commencement/repeal/transition/jurisdiction. Every
 * bundle is machine-labelled `syntheticFixture` in this build so no output can assert legal compliance
 * (ADR-0015 §Technical work proceeds now on synthetic policies).
 */
export interface CompiledPolicyBundle {
  /** Machine-label: MUST be the literal `true` — a bundle not labelled synthetic is inadmissible here. */
  readonly syntheticFixture: true;
  /** Stable policy identifier. */
  readonly policyId: string;
  /** Policy version label (bound alongside the digest — a bare label is insufficient, review #18). */
  readonly policyVersion: string;
  /** The ODRL profile IRI the bundle conforms to (only the pinned profile is supported). */
  readonly profile: string;
  /** The issuer identity whose trusted key signs the bundle (resolved via the program trust store). */
  readonly issuer: string;
  /** The ISO-8601 instant the bundle was signed (used for key-history resolution). */
  readonly issuedAt: string;
  /** The asset classes this version governs (ADR-0014). */
  readonly affectedAssetClasses: readonly string[];
  /** The prospective-vs-retroactive update effect (ADR-0014); consumed, never decided by the runtime. */
  readonly updateEffect: 'Prospective' | 'AuthorizedRetroactive';
  /** The effective interval this version governs (ADR-0014). */
  readonly effectiveInterval: EffectiveInterval;
  /** The permission/prohibition rules (ADR-0013). */
  readonly rules: readonly PolicyRule[];
  /** The `urn:sha256` digest of the bundle content; MUST equal its recomputed digest (T-25). */
  readonly compiledPolicyDigest: string;
  /** The immutable corpus-manifest digest the policy was compiled from (ADR-0015). */
  readonly corpusManifestDigest: string;
  /** The profile digest bound alongside the profile IRI (review #18). */
  readonly profileDigest: string;
  /** The evaluator version the bundle is compiled for; MUST equal {@link EVALUATOR_VERSION}. */
  readonly evaluatorVersion: string;
  /** The human attestation; absent OR `proposed` ⇒ inadmissible (ADR-0015). */
  readonly attestation?: PolicyAttestation;
  /** The jurisdiction/applicability scope (opaque; never interpreted by the runtime, ADR-0015). */
  readonly jurisdiction?: string;
}

/**
 * Compute the pinned content digest of a bundle — the value `compiledPolicyDigest` MUST equal. It
 * canonicalizes a STRUCTURED projection of every load-bearing field (never string concatenation), so any
 * tampering with a rule, an interval or a binding changes the digest and is detected as substitution
 * (T-25). The bound `compiledPolicyDigest` and the `attestation` are DELIBERATELY excluded — the digest is
 * over the content the digest attests, not over itself.
 */
export function computeBundleDigest(bundle: CompiledPolicyBundle): string {
  return canonicalDigest({
    policyId: bundle.policyId,
    policyVersion: bundle.policyVersion,
    profile: bundle.profile,
    issuer: bundle.issuer,
    issuedAt: bundle.issuedAt,
    affectedAssetClasses: [ ...bundle.affectedAssetClasses ],
    updateEffect: bundle.updateEffect,
    effectiveInterval: {
      effectiveFrom: bundle.effectiveInterval.effectiveFrom,
      ...bundle.effectiveInterval.effectiveUntil === undefined ?
          {} :
          { effectiveUntil: bundle.effectiveInterval.effectiveUntil },
    },
    rules: bundle.rules.map((rule): Record<string, unknown> => ({
      ruleType: rule.ruleType,
      target: rule.target,
      action: rule.action,
      source: rule.source,
      constraints: (rule.constraints ?? []).map((constraint): Record<string, unknown> => ({
        leftOperand: constraint.leftOperand,
        operator: constraint.operator,
        rightOperand: constraint.rightOperand,
      })),
      duties: [ ...rule.duties ?? [] ],
      ...rule.conflictStrategy === undefined ? {} : { conflictStrategy: rule.conflictStrategy },
    })),
    corpusManifestDigest: bundle.corpusManifestDigest,
    profileDigest: bundle.profileDigest,
    evaluatorVersion: bundle.evaluatorVersion,
    ...bundle.jurisdiction === undefined ? {} : { jurisdiction: bundle.jurisdiction },
  });
}

/**
 * Whether a bundle has been substituted/tampered: its bound `compiledPolicyDigest` no longer equals its
 * recomputed content digest (T-25). Binding evaluation to this check makes policy substitution detectable.
 */
export function isBundleSubstituted(bundle: CompiledPolicyBundle): boolean {
  return computeBundleDigest(bundle) !== bundle.compiledPolicyDigest;
}
