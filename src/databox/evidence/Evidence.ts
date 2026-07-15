import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';

/**
 * Evidence, receipt and ledger contracts (components C13 evidence ledger + C19/receipt, DBX-04 §2/§6;
 * ADR-0019). The evidence ledger is the append-only, external-to-Pod, hash-chained source of truth
 * and the commit anchor of the §7.0 commit protocol. Nothing of this exists in CSS 7.1.9 (build).
 *
 * This module keeps the original DBX-09 seam ({@link EvidenceEvent}/{@link AcceptanceReceipt}/
 * {@link EvidenceLedger} + the fail-closed {@link NotImplementedEvidenceLedger}) AND re-exports the real
 * DBX-19 ledger: the hash chain ({@link ./EvidenceChain}), the bound audit record + verified-context binder
 * ({@link ./AuditEvidence}), the append-only hash-chained ledger store + DBX-17 sink
 * ({@link ./EvidenceLedgerStore}) and the minimised consumer audit projection ({@link ./AuditProjection}).
 * The barrel line `export * from './evidence/Evidence'` therefore covers every DBX-19 symbol too.
 */

export * from './EvidenceChain';
export * from './AuditEvidence';
export * from './EvidenceLedgerStore';
export * from './AuditProjection';

/**
 * A single append-only evidence event (receipt, audit event, duty transition, key-history entry).
 * The ledger is authoritative for these (DBX-04 §6).
 */
export interface EvidenceEvent {
  /**
   * Opaque, ledger-assigned event identifier. Monotonic within a tenant so it can anchor a cursor.
   */
  readonly eventId: string;
  /**
   * Opaque tenant identifier this event belongs to.
   */
  readonly tenantId: string;
  /**
   * Event kind, e.g. `deposit-accepted`, `access-denied`, `duty-transition`, `key-rotation`.
   */
  readonly kind: string;
  /**
   * ISO-8601 time the event was durably committed.
   */
  readonly committedAt: string;
  /**
   * Hash of the previous event in the tenant's chain, binding this event into the hash chain.
   * Absent only for the genesis event.
   */
  readonly prevHash?: string;
  /**
   * Content digest of this event's payload (the value that a receipt binds to).
   */
  readonly digest: string;
}

/**
 * A signed acceptance receipt (C19/IF-06), issued only *after* a durable ledger commit (ADR-0019).
 * It binds the accepted content digest to the governing policy/corpus so it is later verifiable.
 */
export interface AcceptanceReceipt {
  /**
   * The evidence event this receipt was issued for.
   */
  readonly eventId: string;
  /**
   * Content digest of the accepted record the receipt attests to.
   */
  readonly recordDigest: string;
  /**
   * Digest of the compiled policy version that governed acceptance (DBX-04 §7.6, multi-digest bind).
   */
  readonly policyDigest?: string;
  /**
   * Detached signature over the receipt (suite per ADR-0020). Absent in an unsigned draft receipt,
   * which MUST NOT be presented as an acceptance.
   */
  readonly signature?: string;
}

/**
 * The append-only evidence ledger (C13). Appends are the commit point; reads are derived.
 * There is deliberately no update/delete: the ledger is WORM-equivalent (ADR-0019).
 */
export interface EvidenceLedger {
  /**
   * Durably append an event, returning the committed event (with its assigned id and chain hash).
   * This is the commit anchor of §7.0; it MUST fail closed (reject) rather than partially commit.
   */
  append: (event: Omit<EvidenceEvent, 'eventId' | 'prevHash'>) => Promise<EvidenceEvent>;
}

/**
 * Fail-closed placeholder for {@link EvidenceLedger}.
 *
 * The commit protocol depends on a durable, hash-chained ledger (DBX-18/DBX-19). Until that exists,
 * this stub refuses to append: it throws {@link NotImplementedHttpError}. Refusing is the safe
 * behavior — a deposit whose evidence cannot be durably committed MUST NOT be accepted (ADR-0019,
 * FAILED-RETRYABLE), so a no-op "success" would be an unsafe false acceptance.
 */
/* eslint-disable unused-imports/no-unused-vars */
export class NotImplementedEvidenceLedger implements EvidenceLedger {
  public async append(event: Omit<EvidenceEvent, 'eventId' | 'prevHash'>): Promise<EvidenceEvent> {
    throw new NotImplementedHttpError('Databox evidence ledger (C13) is not implemented (DBX-18/DBX-19).');
  }
}
