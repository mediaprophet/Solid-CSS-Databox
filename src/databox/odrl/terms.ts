/**
 * Databox ODRL Profile — term IRI constants and profile-version constants (DBX-07).
 *
 * This is the SINGLE TypeScript source of truth for the supported-term IRIs. It mirrors the
 * RDF vocabulary (`databox/vocab/dbx-ns.ttl`), the profile (`databox/vocab/odrl-profile-v1.jsonld`)
 * and the SHACL `sh:in` enumerations (`databox/vocab/shapes/dbx-policy-shapes.ttl`). The RDF
 * artifacts are the machine-loadable, non-coverage-gated resources; this file exists only so a
 * deterministic, fail-closed "is this term supported?" check ({@link ./TermSupport}) can run in
 * the evaluator (component C12, IF-04/IF-19; DBX-20) without dereferencing anything.
 *
 * No legal interpretation lives here (ADR-0015). Unknown terms fail closed (ADR-0013).
 */

/** Stable IRI base for the Databox namespace (`dbx:`). */
export const DBX_NAMESPACE = 'https://w3id.org/solid-databox/ns#';

/** ODRL Core/Common namespace whose terms are reused before defining custom ones. */
export const ODRL_NAMESPACE = 'http://www.w3.org/ns/odrl/2/';

/** Stable IRI of the versioned Databox ODRL Profile a conforming policy references. */
export const DBX_PROFILE_V1 = 'https://w3id.org/solid-databox/odrl-profile/v1';

/** Semantic version of the profile this build implements. */
export const DBX_PROFILE_VERSION = '1.0.0';

/** Build an absolute `dbx:` IRI from a local name. */
function dbx(local: string): string {
  return `${DBX_NAMESPACE}${local}`;
}
/** Build an absolute `odrl:` IRI from a local name. */
function odrl(local: string): string {
  return `${ODRL_NAMESPACE}${local}`;
}

/** Custom ODRL actions (ODRL Core actions are reused separately, see {@link REUSED_ODRL_ACTIONS}). */
export const DBX_ACTIONS = {
  deposit: dbx('deposit'),
  submit: dbx('submit'),
} as const;

/** Typed duty actions and their ADR-0012 fulfilment is documented in the vocabulary. */
export const DBX_DUTIES = {
  makeAvailable: dbx('makeAvailable'),
  signalHolder: dbx('signalHolder'),
  deliverToInbox: dbx('deliverToInbox'),
  acknowledge: dbx('acknowledge'),
  issueReceipt: dbx('issueReceipt'),
  stageForReview: dbx('stageForReview'),
  recordDisposition: dbx('recordDisposition'),
  makeRecordKnown: dbx('makeRecordKnown'),
  provideAccessRoute: dbx('provideAccessRoute'),
  acknowledgeCorrection: dbx('acknowledgeCorrection'),
  assessCorrection: dbx('assessCorrection'),
  correctOrAssociateStatement: dbx('correctOrAssociateStatement'),
  notifyPriorRecipient: dbx('notifyPriorRecipient'),
  provideReasons: dbx('provideReasons'),
  provideComplaintRoute: dbx('provideComplaintRoute'),
  retainEvidence: dbx('retainEvidence'),
  tombstone: dbx('tombstone'),
} as const;

/** Custom constraint left operands (ODRL `odrl:recipient`/`odrl:purpose` etc. are reused separately). */
export const DBX_LEFT_OPERANDS = {
  declaredPurpose: dbx('declaredPurpose'),
  minimumAssurance: dbx('minimumAssurance'),
  recordClass: dbx('recordClass'),
  retentionPeriod: dbx('retentionPeriod'),
} as const;

/** Custom right-operand value classes. */
export const DBX_RIGHT_OPERANDS = {
  otherProgram: dbx('otherProgram'),
  personalRecordkeeping: dbx('personalRecordkeeping'),
} as const;

/** Duty fulfilment states (ADR-0012). Only `Accepted` (and `Acknowledged`) are fulfilling. */
export const DBX_DUTY_STATES = {
  queued: dbx('Queued'),
  attempted: dbx('Attempted'),
  accepted: dbx('Accepted'),
  failed: dbx('Failed'),
  remedied: dbx('Remedied'),
  acknowledged: dbx('Acknowledged'),
  superseded: dbx('Superseded'),
} as const;

/** Supported ODRL conflict strategies (ADR-0013 stage 3). Permit-overrides is intentionally absent. */
export const DBX_CONFLICT_STRATEGIES = {
  prohibitOverrides: dbx('prohibitOverrides'),
  moreProtectiveWins: dbx('moreProtectiveWins'),
} as const;

/** WebCivics policy source ranks (ADR-0013 stage 2); lower `rank` is more authoritative. */
export const DBX_SOURCE_RANKS = {
  mandatoryBaseline: dbx('mandatoryBaseline'),
  guardianPolicy: dbx('guardianPolicy'),
  userPreference: dbx('userPreference'),
} as const;

/** Policy update effects (ADR-0014). */
export const DBX_UPDATE_EFFECTS = {
  prospective: dbx('Prospective'),
  authorizedRetroactive: dbx('AuthorizedRetroactive'),
} as const;

/** ODRL Core actions the profile reuses instead of minting `dbx:` equivalents. */
export const REUSED_ODRL_ACTIONS = [
  odrl('read'),
  odrl('use'),
  odrl('distribute'),
  odrl('reproduce'),
  odrl('delete'),
] as const;

/** ODRL Core left operands the profile reuses. */
export const REUSED_ODRL_LEFT_OPERANDS = [
  odrl('recipient'),
  odrl('purpose'),
  odrl('dateTime'),
  odrl('elapsedTime'),
] as const;

/** ODRL Core operators the profile supports (no custom operators are defined). */
export const REUSED_ODRL_OPERATORS = [
  odrl('eq'),
  odrl('neq'),
  odrl('gt'),
  odrl('gteq'),
  odrl('lt'),
  odrl('lteq'),
  odrl('isA'),
  odrl('isPartOf'),
  odrl('isAnyOf'),
  odrl('isAllOf'),
  odrl('isNoneOf'),
] as const;

/** Deprecated, NON-ADMISSIBLE aliases the compiler rejects with a diagnostic (ADR-0012). */
export const DEPRECATED_TERMS = [ dbx('notifyHolder') ] as const;
