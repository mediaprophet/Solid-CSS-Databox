import {
  DBX_ACTIONS,
  DBX_CONFLICT_STRATEGIES,
  DBX_DUTIES,
  DBX_DUTY_STATES,
  DBX_LEFT_OPERANDS,
  DBX_PROFILE_V1,
  DBX_RIGHT_OPERANDS,
  DBX_SOURCE_RANKS,
  DBX_UPDATE_EFFECTS,
  DEPRECATED_TERMS,
  REUSED_ODRL_ACTIONS,
  REUSED_ODRL_LEFT_OPERANDS,
  REUSED_ODRL_OPERATORS,
} from './terms';

/**
 * Deterministic, fail-closed term-support check for the Databox ODRL Profile (DBX-07).
 *
 * The evaluator (component C12, IF-04) and the policy admission gate (IF-19) MUST reject any policy
 * that uses a term this profile does not support (ADR-0013 fail-closed; ADR-0012 duty catalogue).
 * This module is the small, total, side-effect-free decision the RDF/SHACL layer mirrors: given a
 * term category and an IRI, it returns whether the term is supported and, if not, WHY — so the
 * denial reason can be written to the audit ledger. It never interprets legislation (ADR-0015).
 *
 * It fails closed by construction: any unrecognised category, any deprecated alias and any IRI not
 * explicitly enumerated resolves to `supported: false`. There is no default-permit path.
 */

/** The categories of ODRL/dbx term a policy can reference. */
export type TermCategory =
  | 'action' |
  'leftOperand' |
  'rightOperand' |
  'operator' |
  'duty' |
  'dutyState' |
  'conflictStrategy' |
  'sourceRank' |
  'updateEffect';

/** Why a term-support decision resolved the way it did (audit reason code). */
export type TermSupportReason =
  | 'supported' |
  'unsupported-term' |
  'unknown-category' |
  'deprecated-term';

/** The outcome of a {@link checkTermSupport} call. */
export interface TermSupportResult {
  /** True only if the term is explicitly enumerated in a known category and is not deprecated. */
  readonly supported: boolean;
  /** Machine-usable reason; `supported` iff {@link TermSupportResult.supported} is true. */
  readonly reason: TermSupportReason;
}

/** Frozen set of every supported IRI per category. Built once from the term constants. */
const SUPPORTED: Readonly<Record<TermCategory, ReadonlySet<string>>> = {
  action: new Set<string>([ ...REUSED_ODRL_ACTIONS, ...Object.values(DBX_ACTIONS), ...Object.values(DBX_DUTIES) ]),
  leftOperand: new Set<string>([ ...REUSED_ODRL_LEFT_OPERANDS, ...Object.values(DBX_LEFT_OPERANDS) ]),
  rightOperand: new Set<string>(Object.values(DBX_RIGHT_OPERANDS)),
  operator: new Set<string>(REUSED_ODRL_OPERATORS),
  duty: new Set<string>(Object.values(DBX_DUTIES)),
  dutyState: new Set<string>(Object.values(DBX_DUTY_STATES)),
  conflictStrategy: new Set<string>(Object.values(DBX_CONFLICT_STRATEGIES)),
  sourceRank: new Set<string>(Object.values(DBX_SOURCE_RANKS)),
  updateEffect: new Set<string>(Object.values(DBX_UPDATE_EFFECTS)),
};

/** Frozen set of deprecated, non-admissible IRIs (rejected regardless of category). */
const DEPRECATED: ReadonlySet<string> = new Set<string>(DEPRECATED_TERMS);

/**
 * Decide whether `iri` is a supported term in `category`. Fails closed: a deprecated alias, an
 * unknown category, or an IRI absent from the category's enumeration all return `supported: false`
 * with a specific reason for the audit ledger.
 */
export function checkTermSupport(category: string, iri: string): TermSupportResult {
  if (DEPRECATED.has(iri)) {
    return { supported: false, reason: 'deprecated-term' };
  }
  const set = SUPPORTED[category as TermCategory];
  if (!set) {
    return { supported: false, reason: 'unknown-category' };
  }
  if (set.has(iri)) {
    return { supported: true, reason: 'supported' };
  }
  return { supported: false, reason: 'unsupported-term' };
}

/** Convenience boolean form of {@link checkTermSupport}. */
export function isTermSupported(category: string, iri: string): boolean {
  return checkTermSupport(category, iri).supported;
}

/** True only for the exact profile IRI this build implements; any other profile fails closed. */
export function isProfileSupported(profileIri: string): boolean {
  return profileIri === DBX_PROFILE_V1;
}
