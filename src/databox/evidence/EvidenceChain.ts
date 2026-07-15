import { canonicalDigest } from '../proof/Canonicalization';
import type { AuditEvidenceRecord, OutboxRecord } from './AuditEvidence';

/**
 * The hash-chain primitive of the append-only evidence ledger (component C13; ADR-0019 §Evidence ledger;
 * exchange-and-evidence.md §Audit). Every ledger entry binds the PRIOR entry's digest (`prevDigest`) into
 * its own content digest (`entryDigest`), so the sequence of entries forms a tamper- and reorder-evident
 * chain: modifying any entry changes its `entryDigest`, and reordering breaks the `prevDigest` linkage
 * (T-27 — tamper/reorder the ledger is DETECTABLE).
 *
 * The digest is computed by CANONICALIZING a STRUCTURED object (DBX-16 {@link canonicalDigest}), never by
 * string-concatenating attacker-controlled fields (WebID, purpose, reason): a hostile value is just a JSON
 * string member, escaped by canonicalization, so it cannot inject a chain link or a CRLF break (T-55 —
 * audit/log injection). No entry is ever mutated in place; the chain is append-only.
 */

/**
 * The genesis `prevDigest` — a fixed sentinel the first entry in every tenant chain binds instead of a
 * real predecessor. A well-known constant so a verifier can recompute the genesis entry deterministically.
 */
export const GENESIS_PREV_DIGEST =
  'urn:sha256:0000000000000000000000000000000000000000000000000000000000000000';

/**
 * The fields of a {@link LedgerEntry} that its `entryDigest` is computed over (everything except the
 * digest itself). Kept as a distinct type so {@link computeEntryDigest} can be called both when appending
 * (no digest yet) and when re-verifying (recomputing an existing entry's digest).
 */
export interface EntryDigestInput {
  /** Zero-based position of this entry in its tenant chain (monotonic, gap-free). */
  readonly sequence: number;
  /** Opaque tenant identifier the entry belongs to (program-local; never a cross-program key). */
  readonly tenantId: string;
  /** ISO-8601 time the entry was durably committed. */
  readonly recordedAt: string;
  /** Digest of the previous entry (or {@link GENESIS_PREV_DIGEST} for the first), binding the chain. */
  readonly prevDigest: string;
  /** The bound evidence record (actor/decision/digests/policy/receipt — never protected payload). */
  readonly record: AuditEvidenceRecord;
  /** The outbox record appended atomically in the same §7.0 commit, when present. */
  readonly outbox?: OutboxRecord;
}

/**
 * A single committed entry in the append-only, hash-chained evidence ledger. Every field is `readonly` and
 * the object is frozen at append time, so an entry is never mutated after commit (append-only).
 */
export interface LedgerEntry extends EntryDigestInput {
  /** `urn:sha256:<hex>` content digest binding this entry (including {@link prevDigest}) into the chain. */
  readonly entryDigest: string;
}

/**
 * Compute the content digest of an entry over its canonical structured form (DBX-16 {@link canonicalDigest}).
 * Because `prevDigest` is one of the digested members, the result binds this entry to its predecessor: the
 * chain is broken by any later edit or reorder. The input is never mutated.
 */
export function computeEntryDigest(input: EntryDigestInput): string {
  return canonicalDigest({
    sequence: input.sequence,
    tenantId: input.tenantId,
    recordedAt: input.recordedAt,
    prevDigest: input.prevDigest,
    record: input.record,
    // `undefined` members are omitted by canonicalization, so an entry with no outbox digests identically
    // whether the key is present-and-undefined or absent — the digest stays reproducible for any verifier.
    outbox: input.outbox,
  });
}

/** The outcome of verifying a chain: valid, or the first index and reason a break was detected. */
export interface ChainVerification {
  /** `true` iff every entry's linkage, sequence and recomputed digest are intact. */
  readonly valid: boolean;
  /** Number of entries inspected before the result was determined. */
  readonly checked: number;
  /** Index of the first broken entry (present only when {@link valid} is `false`). */
  readonly brokenAt?: number;
  /** Machine reason code for the break (present only when {@link valid} is `false`). */
  readonly reason?: 'sequence-out-of-order' | 'prev-digest-mismatch' | 'entry-digest-mismatch';
}

/**
 * Verify a tenant chain end to end: each entry must sit at its declared `sequence`, bind the previous
 * entry's `entryDigest` (or the genesis sentinel for the first), and recompute to the stored `entryDigest`.
 * A tampered entry fails the digest check; a reordered chain fails the sequence or `prevDigest` check.
 * Returns the first break rather than throwing, so callers can surface a precise audit-integrity fault.
 */
export function verifyChain(entries: readonly LedgerEntry[]): ChainVerification {
  for (const [ index, entry ] of entries.entries()) {
    if (entry.sequence !== index) {
      return { valid: false, checked: index, brokenAt: index, reason: 'sequence-out-of-order' };
    }
    const expectedPrev = index === 0 ? GENESIS_PREV_DIGEST : entries[index - 1].entryDigest;
    if (entry.prevDigest !== expectedPrev) {
      return { valid: false, checked: index, brokenAt: index, reason: 'prev-digest-mismatch' };
    }
    if (computeEntryDigest(entry) !== entry.entryDigest) {
      return { valid: false, checked: index, brokenAt: index, reason: 'entry-digest-mismatch' };
    }
  }
  return { valid: true, checked: entries.length };
}
