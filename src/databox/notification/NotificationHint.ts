import type { OutboxRecord } from '../evidence/AuditEvidence';

/**
 * The minimal notification hint (IF-08; ADR-0011 §4). A notification is a NON-authoritative HINT, never
 * the record of an event: HTTPS/pull is authoritative and the cursor feed is the recovery contract. The
 * payload therefore carries ONLY an opaque event id and an activity classification — NEVER receipt line
 * items, resource references, tenant identifiers, medical/dietary facts or any other protected content
 * (isolation-and-privacy.md; ADR-0012 §Privacy). This keeps a notification preview from disclosing what a
 * record is or which resource it concerns.
 */
export interface NotificationHint {
  /** Opaque committed-event id — the only correlation a consumer needs to then pull authoritatively. */
  readonly eventId: string;
  /** Opaque activity classification (e.g. `Create`); never record content. */
  readonly classification: string;
}

/**
 * Derive the minimal hint from a committed outbox record. Deliberately DROPS `resourceRef` and `tenantId`:
 * the wire payload must reveal nothing beyond the opaque event id + classification (ADR-0011 §4). The result
 * is frozen so a downstream emitter cannot widen it before serialisation.
 */
export function hintFromOutbox(record: OutboxRecord): NotificationHint {
  return Object.freeze({ eventId: record.eventId, classification: record.activity });
}

/** Serialise a hint to its minimal wire form. Only the two opaque fields are emitted — nothing else. */
export function serializeHint(hint: NotificationHint): string {
  return JSON.stringify({ eventId: hint.eventId, classification: hint.classification });
}
