/**
 * Append-only evidence events (ADR-0018 §2/§3; ADR-0019).
 *
 * The append-only store (component C6, DBX-04) produces a machine-linkable evidence event whenever a
 * governed supersession or tombstone occurs. These events are the storage-layer inputs the evidence
 * ledger (C13, DBX-19) records and that receipts (C19, DBX-18) bind to. They carry only structural,
 * non-payload facts (paths, class, legal-basis reference, time) so an event never leaks record content.
 */
export type AppendOnlyEvidenceKind = 'supersession' | 'tombstone';

/**
 * Common shape of every append-only evidence event.
 */
export interface AppendOnlyEvidence {
  /** Discriminant: which governed operation produced this event. */
  readonly kind: AppendOnlyEvidenceKind;
  /** Path of the accepted resource the event concerns. */
  readonly target: string;
  /** ISO-8601 time the event was recorded. */
  readonly recordedAt: string;
}

/**
 * Emitted when a correction appends a new record that supersedes a prior accepted record (ADR-0018 §2).
 * The prior bytes remain retrievable and unchanged; this event records the supersession link.
 */
export interface SupersessionEvidence extends AppendOnlyEvidence {
  readonly kind: 'supersession';
  /** The prior accepted record that is superseded. */
  readonly supersedes: string;
  /** The newly appended record that supersedes {@link supersedes}. */
  readonly supersededBy: string;
}

/**
 * Emitted when a lawful deletion tombstones an accepted record (ADR-0018 §3). No bytes are destroyed;
 * this event records that the resource existed, its class, the legal basis and the time.
 */
export interface TombstoneEvidence extends AppendOnlyEvidence {
  readonly kind: 'tombstone';
  /** Record class of the tombstoned resource (structural only; no payload content). */
  readonly recordClass: string;
  /** Reference to the legal basis authorising the deletion. */
  readonly legalBasis: string;
}

/**
 * Sink the store notifies when an append-only evidence event is produced. The evidence ledger
 * (DBX-19) implements this so supersession/tombstone events are committed to the append-only ledger
 * (ADR-0019). When no sink is configured, events are only returned to the caller.
 */
export interface AppendOnlyEvidenceSink {
  record: (evidence: AppendOnlyEvidence) => Promise<void>;
}
