import type { BoundActor, EvidenceDecision, EvidenceRecordState } from './AuditEvidence';
import { assertNonEmpty } from './AuditEvidence';
import type { LedgerEntry } from './EvidenceChain';

/**
 * The consumer-visible audit projection (component C13; ADR-0019 §Evidence ledger — "expose a minimised
 * consumer-visible audit projection ... while protecting staff identifiers and operational security";
 * exchange-and-evidence.md §Audit). The full ledger record is NOT what a consumer sees: this projection is
 * minimised to the consumer's OWN events — decisions on their box — and deliberately OMITS staff/operational
 * data (the institutional principal, the issuer/client, assurance internals, the outbox, notification and
 * pre/post digests) and never includes another tenant's or another subject's events (T-34 — an operator
 * must not reconstruct a cross-subject graph through the audit view; isolation-and-privacy.md).
 */

/** A single minimised entry in the consumer audit view. */
export interface ConsumerAuditEntry {
  /** ISO-8601 time the decision was committed. */
  readonly recordedAt: string;
  /** The operation the decision concerned. */
  readonly operation: string;
  /** The decision (allow/deny/partial) — a denial is shown WITHOUT any protected content. */
  readonly decision: EvidenceDecision;
  /** The structured reason code (never free-text content). */
  readonly reasonCode: string;
  /** The digest/opaque reference of the target (never a raw path or payload). */
  readonly targetDigest: string;
  /** The lifecycle state of the concerned record (current/superseded/disputed). */
  readonly state: EvidenceRecordState;
  /** The governing policy version (a label the consumer can cite). */
  readonly policyVersion: string;
  /** The resulting ODRL state of the evaluated rule, when one was evaluated. */
  readonly odrlState?: string;
}

/** The minimised audit view returned to a consumer for their own box. */
export interface ConsumerAuditView {
  /** The subject (the consumer) the view is scoped to. */
  readonly subject: string;
  /** The consumer's own events, minimised. */
  readonly entries: readonly ConsumerAuditEntry[];
}

/**
 * Whether `subject` owns the box a record concerns — i.e. the record is the consumer's OWN event. True when
 * the subject is the acting agent (actor/WebID) or the represented entity. A subject that appears ONLY as
 * the institutional principal (staff) does NOT own the box and the event is excluded from their view.
 */
function ownsBox(actor: BoundActor, subject: string): boolean {
  return actor.actor === subject || actor.webId === subject || actor.representedEntity === subject;
}

function toConsumerEntry(entry: LedgerEntry): ConsumerAuditEntry {
  const { record } = entry;
  return {
    recordedAt: entry.recordedAt,
    operation: record.operation,
    decision: record.decision,
    reasonCode: record.reasonCode,
    targetDigest: record.targetDigest,
    state: record.recordState ?? 'current',
    policyVersion: record.policy.policyVersion,
    odrlState: record.policy.odrlState,
  };
}

/**
 * Project a tenant's ledger entries into the minimised consumer view for `subject`. Keeps only the events
 * the subject owns (their box) and maps each to a {@link ConsumerAuditEntry} that carries no staff
 * identifier, no issuer/client, no assurance internals, no outbox and no pre/post digests. A denial is
 * retained (the consumer can see access to their box was refused) but never with protected content. Fails
 * closed on a blank subject.
 */
export function projectForConsumer(entries: readonly LedgerEntry[], subject: string): ConsumerAuditView {
  assertNonEmpty(subject, 'subject');
  const own = entries.filter((entry): boolean => ownsBox(entry.record.actor, subject));
  return { subject, entries: own.map(toConsumerEntry) };
}
