import { checkTermSupport, isProfileSupported } from '../odrl/TermSupport';

/**
 * Present applicable ODRL terms in an **understandable** form WITHOUT discarding the machine-readable
 * expression (ADR-0013/0017; dbx-04 §7.2 — the consumer sees plain-language terms before submitting). The
 * consumer agent must show a person what a policy permits, prohibits and requires, in words — while keeping
 * the exact machine-readable ODRL so the presentation is a *view*, never a lossy replacement.
 *
 * The presenter is deterministic and fail-closed on comprehension: every action / constraint operand is run
 * through the DBX-07 {@link checkTermSupport} decision, so a term this profile does not understand is
 * flagged (`supported: false`) rather than glossed over, and `fullyUnderstood` is only true when the profile
 * and every term are supported. It never interprets legislation and never mutates the policy.
 */

/** A single ODRL constraint (left operand / operator / right operand). Copied verbatim into the view. */
export interface OdrlConstraint {
  readonly leftOperand: string;
  readonly operator: string;
  readonly rightOperand: string;
}

/** One ODRL rule (a permission, prohibition or obligation/duty). */
export interface OdrlRule {
  readonly action: string;
  readonly constraints?: readonly OdrlConstraint[];
}

/** A minimal ODRL policy the presenter renders. The exact object is preserved on the result. */
export interface OdrlPolicy {
  readonly uid?: string;
  readonly profile: string;
  readonly permission?: readonly OdrlRule[];
  readonly prohibition?: readonly OdrlRule[];
  readonly obligation?: readonly OdrlRule[];
}

/** The kind of rule being presented. */
export type PresentedRuleType = 'permission' | 'prohibition' | 'duty';

/** A constraint rendered understandably while keeping its machine-readable form. */
export interface PresentedConstraint {
  readonly humanReadable: string;
  readonly supported: boolean;
  readonly machineReadable: OdrlConstraint;
}

/** A rule rendered understandably while keeping its machine-readable form. */
export interface PresentedRule {
  readonly ruleType: PresentedRuleType;
  readonly action: string;
  readonly actionSupported: boolean;
  readonly humanReadable: string;
  readonly constraints: readonly PresentedConstraint[];
  readonly machineReadable: OdrlRule;
}

/** The full understandable presentation, with the verbatim machine-readable policy preserved. */
export interface PresentedOdrlTerms {
  readonly profile: string;
  readonly profileSupported: boolean;
  readonly rules: readonly PresentedRule[];
  /** True only when the profile AND every action/constraint term are supported by this build. */
  readonly fullyUnderstood: boolean;
  /** The exact ODRL policy, never discarded — the presentation is a view over this. */
  readonly machineReadable: OdrlPolicy;
}

/** Friendly verbs for the small set of actions this reference agent knows how to phrase (IRI -> phrase). */
const ACTION_PHRASES = new Map<string, string>([
  [ 'http://www.w3.org/ns/odrl/2/read', 'read this record' ],
  [ 'http://www.w3.org/ns/odrl/2/use', 'use this record' ],
  [ 'http://www.w3.org/ns/odrl/2/distribute', 'share this record with others' ],
  [ 'https://w3id.org/solid-databox/ns#deposit', 'deposit records into your box' ],
  [ 'https://w3id.org/solid-databox/ns#submit', 'submit a preference or correction' ],
  [ 'https://w3id.org/solid-databox/ns#issueReceipt', 'issue you a receipt' ],
]);

/** The leading verb for a rule type ("permits you to…", "prohibits…", "requires…"). */
const RULE_TYPE_VERB: Readonly<Record<PresentedRuleType, string>> = {
  permission: 'permits',
  prohibition: 'prohibits',
  duty: 'requires',
};

/** Describe an action IRI in words, falling back to a generic phrase for an action we do not have copy for. */
function describeAction(action: string): string {
  return ACTION_PHRASES.get(action) ?? `perform the action <${action}>`;
}

/** Render one constraint understandably and record whether every operand is supported. */
function presentConstraint(constraint: OdrlConstraint): PresentedConstraint {
  const leftSupported = checkTermSupport('leftOperand', constraint.leftOperand).supported;
  const operatorSupported = checkTermSupport('operator', constraint.operator).supported;
  const rightSupported = checkTermSupport('rightOperand', constraint.rightOperand).supported;
  return {
    humanReadable: `where ${constraint.leftOperand} ${constraint.operator} ${constraint.rightOperand}`,
    supported: leftSupported && operatorSupported && rightSupported,
    machineReadable: constraint,
  };
}

/** Render one rule (with its constraints) understandably. */
function presentRule(ruleType: PresentedRuleType, rule: OdrlRule): PresentedRule {
  const actionSupported = checkTermSupport('action', rule.action).supported;
  const constraints = (rule.constraints ?? []).map(presentConstraint);
  const clause = constraints.length === 0 ? '' : ` ${constraints.map((c): string => c.humanReadable).join(' and ')}`;
  return {
    ruleType,
    action: rule.action,
    actionSupported,
    humanReadable: `This policy ${RULE_TYPE_VERB[ruleType]} you to ${describeAction(rule.action)}${clause}.`,
    constraints,
    machineReadable: rule,
  };
}

/**
 * Present an ODRL policy in an understandable form. The returned {@link PresentedOdrlTerms} carries both the
 * plain-language rendering and the verbatim policy; `fullyUnderstood` is false if the profile or any term is
 * unsupported, so the consumer is never shown a confident rendering of a policy the build cannot fully model.
 */
export function presentOdrlTerms(policy: OdrlPolicy): PresentedOdrlTerms {
  const profileSupported = isProfileSupported(policy.profile);
  const rules: PresentedRule[] = [
    ...(policy.permission ?? []).map((rule): PresentedRule => presentRule('permission', rule)),
    ...(policy.prohibition ?? []).map((rule): PresentedRule => presentRule('prohibition', rule)),
    ...(policy.obligation ?? []).map((rule): PresentedRule => presentRule('duty', rule)),
  ];
  const everyTermSupported = rules.every(
    (rule): boolean => rule.actionSupported && rule.constraints.every((c): boolean => c.supported),
  );
  return {
    profile: policy.profile,
    profileSupported,
    rules,
    fullyUnderstood: profileSupported && everyTermSupported,
    machineReadable: policy,
  };
}
