import type { DataboxRequestContext } from '../context/DataboxRequestContext';
import type { PolicyEvaluation } from '../evidence/AuditEvidence';
import type { AssuranceDimension } from '../profile/InstitutionProfile';

/**
 * Value types for the governed review queue + disposition workflow (component C17, DBX-04 §49/IF-12/IF-13;
 * ADR-0016 §integration plane, ADR-0017 §consumer submissions, ADR-0018 §append-only, ADR-0023 §record
 * awareness/correction, ADR-0012 §duties). Pure types — no runtime — so the review contract is stated once
 * and cannot drift between the queue, the disposition model, the append-only store and the orchestrator.
 *
 * Two invariants are structural here:
 * - **Submitter identity + payload digest are preserved end to end.** A {@link CommittedSubmissionEvent}
 *   carries the verified {@link SubmitterIdentity} and the exact-bytes `payloadDigest`; the same two fields
 *   are copied verbatim onto every {@link DispositionEnvelope}, so a disposition can never silently detach
 *   from who submitted what (T-45 §submitter identity + payload digest preserved).
 * - **No payload ever enters these records.** Every reference is opaque or a `urn:sha256` digest — never a
 *   raw path or record content (isolation-and-privacy.md; the evidence ledger enforces the same).
 */

/** The kinds of consumer submission a governed review queue handles (ADR-0017; a correction/claim/pref). */
export const SUBMISSION_KINDS = [ 'correction', 'warranty-claim', 'preference' ] as const;
export type SubmissionKind = typeof SUBMISSION_KINDS[number];

/**
 * The reasoned disposition outcomes a reviewer/governed process may record (ADR-0023 §Correction). A
 * disposition NEVER writes the source of record in place: a `corrected`/`partially-corrected` outcome names
 * a SUPERSEDING record reference (a new appended record), `statement-associated` a conspicuously-linked
 * statement, `no-change` reasons + an appeal route, `more-information-required` an explicit deadline effect,
 * and `redirected` a governed redirect target.
 */
export const DISPOSITION_OUTCOME_KINDS = [
  'corrected',
  'statement-associated',
  'partially-corrected',
  'no-change',
  'more-information-required',
  'redirected',
] as const;
export type DispositionOutcomeKind = typeof DISPOSITION_OUTCOME_KINDS[number];

/** The outcomes that produce a SUPERSEDING source record (routed to a governed case, never an in-place write). */
export const SUPERSEDING_OUTCOMES: readonly DispositionOutcomeKind[] = [ 'corrected', 'partially-corrected' ];

/** The authoritative lifecycle state of a review case (C17). */
export const REVIEW_CASE_STATES = [ 'pending', 'claimed', 'disposed' ] as const;
export type ReviewCaseState = typeof REVIEW_CASE_STATES[number];

/**
 * The verified submitter identity preserved through the whole workflow (ADR-0004 typed identity, T-45). Only
 * opaque/pairwise references and an opaque assurance grade — never a raw payload or another program's fact.
 */
export interface SubmitterIdentity {
  /** The opaque/pairwise reference to the submitting party (never a raw path/payload). */
  readonly submitterRef: string;
  /** The acting party, when distinct from {@link submitterRef} (ADR-0004 actor≠represented-entity). */
  readonly actorRef?: string;
  /** The verified issuer that asserted the submitter's claims, retained for audit. */
  readonly issuer?: string;
  /** The opaque assurance grade the submitter presented (ADR-0010; never re-interpreted numerically). */
  readonly assuranceGrade?: string;
}

/**
 * A COMMITTED submission event the review queue consumes (ADR-0017: the queue consumes the committed
 * submission event, NOT a notification — notifications only SIGNAL the event). It carries the durable C13
 * commit facts, the preserved submitter identity and the exact-bytes payload digest.
 */
export interface CommittedSubmissionEvent {
  /** Opaque tenant identifier the submission belongs to (program-local). */
  readonly tenantId: string;
  /** The C13 ledger-assigned committed event id (the durable commit this review hangs off). */
  readonly eventId: string;
  /** Opaque reference to the committed submission resource in the program box (never a payload). */
  readonly submissionRef: string;
  /** The submission kind (correction/warranty-claim/preference). */
  readonly submissionKind: SubmissionKind;
  /** The submission class id (already validated as declared in the profile by the gateway). */
  readonly submissionClass: string;
  /** The opaque relationship the submission belongs to. */
  readonly relationshipId: string;
  /** The `urn:sha256` digest of the EXACT submitted bytes (preserved end to end). */
  readonly payloadDigest: string;
  /** ISO-8601 instant the submission durably committed. */
  readonly committedAt: string;
  /** The preserved verified submitter identity (T-45). */
  readonly submitter: SubmitterIdentity;
  /** The governing policy binding recorded on every evidence transition (ADR-0014/0019). */
  readonly policy: PolicyEvaluation;
  /** Opaque reference to the source-of-record item the correction targets, when known (ADR-0023). */
  readonly targetRecordRef?: string;
}

/** The immutable public view of a governed review case (C17). */
export interface ReviewCase {
  /** The stable case identifier. */
  readonly caseId: string;
  /** The committed submission under review (preserves submitter + payload digest). */
  readonly event: CommittedSubmissionEvent;
  /** The authoritative case state. */
  readonly state: ReviewCaseState;
  /** ISO-8601 instant the case was staged into the queue. */
  readonly stagedAt: string;
  /** ISO-8601 due instant — the response clock (ADR-0023 §calculated due time). */
  readonly dueAt: string;
  /** The assigned reviewer, once claimed. */
  readonly reviewerId?: string;
  /** ISO-8601 instant the case was claimed/assigned. */
  readonly claimedAt?: string;
  /** The appended disposition id, once disposed. */
  readonly dispositionId?: string;
}

/** A per-dimension assurance minimum a reviewer MUST meet to claim/dispose (ADR-0010; fail closed). */
export type ReviewerAssuranceRequirement = Readonly<Partial<Record<AssuranceDimension, number>>>;

/**
 * A staff reviewer / governed process. The assurance used for the gate is read ONLY from the verified
 * {@link DataboxRequestContext} (never a caller-asserted number) so an under-assured reviewer cannot be
 * spoofed into disposing (T-45 fail closed).
 */
export interface Reviewer {
  /** The reviewer/governed-process identifier (bound as the acting party in evidence). */
  readonly reviewerId: string;
  /** The verified request context whose assurance dimensions gate the claim/disposition. */
  readonly context: DataboxRequestContext;
}

/**
 * The reasoned decision a reviewer/governed process records for a claimed case (ADR-0023). Which reference
 * fields are required depends on {@link outcomeKind} (validated in the disposition model).
 */
export interface DispositionDecision {
  /** The case being disposed. */
  readonly caseId: string;
  /** The reasoned outcome. */
  readonly outcomeKind: DispositionOutcomeKind;
  /** A structured reason code (never free-text protected content). */
  readonly reasonCode: string;
  /** The superseding record reference (`corrected`/`partially-corrected`) — a NEW appended record. */
  readonly supersedingRecordRef?: string;
  /** The conspicuously-linked statement reference (`statement-associated`). */
  readonly associatedStatementRef?: string;
  /** The governed redirect target (`redirected`). */
  readonly redirectTarget?: string;
  /** The appeal route offered on a substantive `no-change` (ADR-0023 §appeal ≠ step-up). */
  readonly appealRoute?: string;
  /** The explicit effect on the response deadline (`more-information-required`). */
  readonly deadlineEffect?: string;
}

/** The link set binding a disposition to the submission it concerns (append-only, never in-place). */
export interface DispositionLinks {
  /** The opaque submission the disposition is appended against (always present). */
  readonly submissionRef: string;
  /** The superseding source record this disposition points to, when any. */
  readonly supersedes?: string;
  /** The conspicuously-associated statement, when any. */
  readonly associatedWith?: string;
  /** The governed redirect target, when any. */
  readonly redirectsTo?: string;
}

/**
 * The canonical, signable disposition envelope (IF-13). It copies the preserved {@link SubmitterIdentity}
 * and `payloadDigest` verbatim from the case's committed event, so the signed artefact binds who submitted
 * what to the reasoned outcome — nothing about the submission can be swapped after acceptance (T-45).
 */
export interface DispositionEnvelope {
  /** The stable disposition identifier. */
  readonly dispositionId: string;
  /** The case this disposition settles. */
  readonly caseId: string;
  /** The opaque submission the disposition is linked to. */
  readonly submissionRef: string;
  /** The preserved submitter identity (verbatim from the committed event). */
  readonly submitter: SubmitterIdentity;
  /** The preserved exact-bytes payload digest (verbatim from the committed event). */
  readonly payloadDigest: string;
  /** The reasoned outcome. */
  readonly outcomeKind: DispositionOutcomeKind;
  /** The structured reason code. */
  readonly reasonCode: string;
  /** The disposing reviewer/governed-process id. */
  readonly reviewerId: string;
  /** ISO-8601 instant the disposition was decided. */
  readonly decidedAt: string;
  /** The append-only link set binding the disposition to the submission. */
  readonly links: DispositionLinks;
  /** The governing policy binding (verbatim from the committed event). */
  readonly policy: PolicyEvaluation;
  /** The appeal route, when a `no-change` outcome carries one. */
  readonly appealRoute?: string;
  /** The explicit deadline effect, when a `more-information-required` outcome carries one. */
  readonly deadlineEffect?: string;
}

/** A signed, appended disposition (IF-13): the envelope, its ES256 JWS and its canonical digest. */
export interface SignedDisposition {
  /** The canonical disposition envelope. */
  readonly envelope: DispositionEnvelope;
  /** The compact ES256 JWS over the envelope (the governed/reviewer signature). */
  readonly jws: string;
  /** The `urn:sha256` canonical digest of the envelope (bound as fulfilment evidence). */
  readonly envelopeDigest: string;
}
