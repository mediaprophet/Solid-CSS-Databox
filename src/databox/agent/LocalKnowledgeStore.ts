import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { CommittedEvent } from '../feed/CursorFeed';
import type { RecordVerification } from '../proof/RecordProofValidator';
import type { ReceiptVerification } from '../receipt/AcceptanceReceiptVerifier';
import type { InertRecord } from './InertRecord';
import { copyPayload } from './InertRecord';

/**
 * The consumer agent's **local knowledge store** (dbx-04 §7.2; ADR-0011 notify-then-pull; ADR-0026 "retains
 * independent copies in their own pod"). It holds the consumer's own copy of every verified record and
 * receipt for ONE connection, so the customer keeps durable, independently-verifiable evidence that survives
 * the provider later deleting/altering/tombstoning the source (T-46). One store instance is scoped to one
 * connection — there is no cross-connection accessor, so records for program A can never surface under
 * program B (T-03 no cross-program correlation).
 *
 * A stored record is only ever admitted AFTER both proofs verify: the caller passes the already-verified
 * {@link RecordVerification} + {@link ReceiptVerification}. The store additionally keeps the exact `recordJws`
 * and `receiptJws` so {@link exportEvidence} can hand a third party a bundle that re-verifies with nothing but
 * a trusted key set — the receipt offline, the record against a status list (T-28/T-46).
 */

/** One stored, verified record: the inert copy plus the exact secured artefacts + verification results. */
export interface StoredRecord {
  readonly inert: InertRecord;
  readonly recordJws: string;
  readonly receiptJws: string;
  readonly recordVerification: RecordVerification;
  readonly receiptVerification: ReceiptVerification;
}

/** One stored, verified standalone receipt (e.g. from a submission). */
export interface StoredReceipt {
  readonly receiptJws: string;
  readonly verification: ReceiptVerification;
  /** An opaque provenance label (e.g. `submission-accepted`). */
  readonly provenance: string;
}

/** A portable evidence bundle for independent re-verification (record + receipt bytes + payload). */
export interface EvidenceBundleEntry {
  readonly recordJws: string;
  readonly receiptJws: string;
  readonly payload: Buffer | string;
}

/** The full export for a connection: record bundles + standalone receipts. */
export interface EvidenceBundle {
  readonly connectionId: string;
  readonly records: readonly EvidenceBundleEntry[];
  readonly receipts: readonly string[];
}

export class LocalKnowledgeStore {
  private readonly records = new Map<string, StoredRecord>();
  private readonly receipts: StoredReceipt[] = [];
  /** Recovered committed events, deduplicated by their originating `eventId` (exactly-once, ADR-0011). */
  private readonly recoveredEvents = new Map<string, CommittedEvent>();

  public constructor(public readonly connectionId: string) {
    if (typeof connectionId !== 'string' || connectionId.length === 0) {
      throw new BadRequestHttpError('A local knowledge store requires a non-empty connection id.');
    }
  }

  /**
   * Store an independent copy of a verified record. Keyed by the record digest so re-storing the identical
   * record is idempotent (a re-pull does not create a second copy). Returns the stored entry.
   */
  public storeRecord(entry: StoredRecord): StoredRecord {
    if (entry.inert.connectionId !== this.connectionId) {
      throw new BadRequestHttpError('Refusing to store a record from another connection (isolation, T-03).');
    }
    const existing = this.records.get(entry.inert.recordDigest);
    if (existing) {
      return existing;
    }
    this.records.set(entry.inert.recordDigest, entry);
    return entry;
  }

  /** Store a verified standalone receipt (e.g. a submission acknowledgement). */
  public storeReceipt(receipt: StoredReceipt): StoredReceipt {
    this.receipts.push(receipt);
    return receipt;
  }

  /**
   * Record a recovered committed event exactly once (deduplicated by `eventId`). Returns `true` when it was
   * newly recorded, `false` when it had already been recovered — so a re-run of recovery is a no-op.
   */
  public recordRecoveredEvent(event: CommittedEvent): boolean {
    if (this.recoveredEvents.has(event.eventId)) {
      return false;
    }
    this.recoveredEvents.set(event.eventId, event);
    return true;
  }

  /**
   * The verified records held for this connection, each handed out as a copy whose payload buffer is
   * duplicated (L1). A caller mutating the returned payload therefore cannot corrupt the RETAINED evidence so
   * it no longer matches its `payloadDigest` (T-46 integrity).
   */
  public listRecords(): readonly StoredRecord[] {
    return [ ...this.records.values() ].map((stored): StoredRecord => ({
      ...stored,
      inert: Object.freeze({ ...stored.inert, payload: copyPayload(stored.inert.payload) }),
    }));
  }

  /**
   * Migrate all retained records, receipts and recovered-event dedup entries from another store into this one
   * (M1). Used by connection rotation so a routine credential rotation NEVER destroys the consumer's durable,
   * independently-verifiable evidence or its recovery-dedup state (T-46). The predecessor's copies are moved
   * verbatim (their provenance/connection id are preserved as historical fact).
   */
  public migrateFrom(source: LocalKnowledgeStore): void {
    for (const [ digest, record ] of source.records) {
      this.records.set(digest, record);
    }
    for (const receipt of source.receipts) {
      this.receipts.push(receipt);
    }
    for (const [ eventId, event ] of source.recoveredEvents) {
      this.recoveredEvents.set(eventId, event);
    }
  }

  /** The verified standalone receipts held for this connection. */
  public listReceipts(): readonly StoredReceipt[] {
    return [ ...this.receipts ];
  }

  /** The recovered committed events held for this connection. */
  public listRecoveredEvents(): readonly CommittedEvent[] {
    return [ ...this.recoveredEvents.values() ];
  }

  /**
   * Export a portable evidence bundle that re-verifies independently of the provider: each entry carries the
   * exact `recordJws`, `receiptJws` and payload bytes, so a third party with only the trusted key set can
   * re-run {@link RecordProofValidator}/{@link AcceptanceReceiptVerifier} and confirm the evidence (T-46).
   */
  public exportEvidence(): EvidenceBundle {
    return {
      connectionId: this.connectionId,
      records: this.listRecords().map((stored): EvidenceBundleEntry => ({
        recordJws: stored.recordJws,
        receiptJws: stored.receiptJws,
        payload: stored.inert.payload,
      })),
      receipts: this.listReceipts().map((stored): string => stored.receiptJws),
    };
  }
}
