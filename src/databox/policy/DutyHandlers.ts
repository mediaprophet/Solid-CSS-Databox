import { canonicalDigest, digestOfBytes } from '../proof/Canonicalization';
import type { AcceptanceReceiptRequest, AcceptanceReceiptSigner } from '../receipt/AcceptanceReceiptSigner';
import type { TombstoneRegistry, TombstoneState } from '../storage/AppendOnlyTombstone';
import type { DutyHandler, HandlerOutcome } from './DutyEngine';

/**
 * Concrete duty handlers (component C12; ADR-0012 §Hackathon scope). Each REUSES an existing subsystem —
 * it never re-implements crypto, storage or evidence — and reports a {@link HandlerOutcome} the
 * {@link ./DutyEngine} turns into an audited state transition:
 *
 * - `dbx:issueReceipt` reuses the DBX-18 {@link AcceptanceReceiptSigner} (no receipt before durable commit,
 *   idempotent replay) → `accepted`, binding the receipt digest; a missing durable commit → `failed`.
 * - `dbx:signalHolder` is a QUEUED signal only — actual delivery is DBX-21 — so it reports `queued` and is
 *   therefore never fulfilled (ADR-0012 rule 1; T-50). The signal carries only an opaque event id (never
 *   record content, ADR-0012 §Privacy) — the handler here records no payload.
 * - `dbx:retainEvidence` records a retention entry → `accepted`.
 * - `dbx:tombstone` reuses the DBX-17 {@link TombstoneRegistry} (lawful deletion is a recorded tombstone,
 *   never a destructive rewrite) → `accepted`.
 * - `dbx:stageForReview` durably stages a submission into the governed review queue → `accepted`.
 */

/** A recorded retention obligation (structural only; no payload). */
export interface RetentionEntry {
  /** The target as a digest or `opaque:` reference. */
  readonly target: string;
  /** The retention period (an ISO-8601 duration or profile token). */
  readonly retentionPeriod: string;
  /** ISO-8601 time the retention was recorded. */
  readonly recordedAt: string;
}

/** A minimal durable retention registry (reference store; a durable store swaps in behind it). */
export class RetentionRegistry {
  private readonly entries = new Map<string, RetentionEntry>();

  public record(entry: RetentionEntry): void {
    this.entries.set(entry.target, entry);
  }

  public get(target: string): RetentionEntry | undefined {
    return this.entries.get(target);
  }
}

/** A staged review item (ADR-0012 §stageForReview fulfilment — durably present in the governed queue). */
export interface ReviewItem {
  /** Opaque reference to the staged submission (never a payload). */
  readonly submissionRef: string;
  /** The record class of the staged submission. */
  readonly recordClass: string;
  /** ISO-8601 time the item was staged. */
  readonly stagedAt: string;
}

/** A minimal governed review queue (reference store; C17 replaces it behind the same surface). */
export class ReviewQueue {
  private readonly items: ReviewItem[] = [];

  public stage(item: ReviewItem): void {
    this.items.push(item);
  }

  public contains(submissionRef: string): boolean {
    return this.items.some((item): boolean => item.submissionRef === submissionRef);
  }

  public all(): readonly ReviewItem[] {
    return [ ...this.items ];
  }
}

/**
 * `dbx:issueReceipt`: issue a signed acceptance receipt via DBX-18. `accepted` on success (binding the
 * receipt digest as fulfilment evidence); `failed` if the signer refuses (no durable commit / digest
 * mismatch) — the duty is then retryable, never silently fulfilled.
 */
export function issueReceiptHandler(
  signer: AcceptanceReceiptSigner,
  request: AcceptanceReceiptRequest,
): DutyHandler {
  return async(): Promise<HandlerOutcome> => {
    try {
      const issued = signer.issue(request);
      return {
        resultState: 'accepted',
        evidenceDigest: digestOfBytes(issued.receipt.jws),
        reason: issued.duplicate ? 'receipt-replay' : 'receipt-issued',
      };
    } catch {
      return { resultState: 'failed', reason: 'receipt-not-durably-committed' };
    }
  };
}

/** `dbx:signalHolder`: a QUEUED signal only (delivery is DBX-21) — reports `queued`, never fulfilled. */
export function signalHolderHandler(): DutyHandler {
  return async(): Promise<HandlerOutcome> => ({ resultState: 'queued', reason: 'signal-queued-awaiting-dbx21' });
}

/** `dbx:retainEvidence`: record a retention obligation → `accepted`. */
export function retainEvidenceHandler(registry: RetentionRegistry, entry: RetentionEntry): DutyHandler {
  return async(): Promise<HandlerOutcome> => {
    registry.record(entry);
    return { resultState: 'accepted', evidenceDigest: canonicalDigest(entry), reason: 'retention-recorded' };
  };
}

/** `dbx:tombstone`: record a governed tombstone via DBX-17 (never a destructive rewrite) → `accepted`. */
export function tombstoneHandler(registry: TombstoneRegistry, state: TombstoneState): DutyHandler {
  return async(): Promise<HandlerOutcome> => {
    await registry.mark(state);
    return { resultState: 'accepted', evidenceDigest: canonicalDigest(state), reason: 'tombstone-recorded' };
  };
}

/** `dbx:stageForReview`: durably stage a submission into the governed review queue → `accepted`. */
export function stageForReviewHandler(queue: ReviewQueue, item: ReviewItem): DutyHandler {
  return async(): Promise<HandlerOutcome> => {
    queue.stage(item);
    return { resultState: 'accepted', evidenceDigest: canonicalDigest(item), reason: 'staged-for-review' };
  };
}
