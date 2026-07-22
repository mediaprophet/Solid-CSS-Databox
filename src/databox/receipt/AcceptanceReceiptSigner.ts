import type { KeyObject } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { signCompactJws } from '../credential/Es256';
import { normalizeSha256 } from '../proof/Canonicalization';
import type { DurableCommit } from './DurableCommit';
import { assertDurableCommit } from './DurableCommit';
import type {
  AcceptanceReceiptBinding,
  DataboxAcceptanceReceiptCredential,
  LegalPolicyBinding,
  ReceiptOperation,
  SignedAcceptanceReceipt,
} from './ReceiptTypes';
import {
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  DBX_RECORD_CONTEXT,
  PINNED_CANONICALIZATION_ALG,
  RECEIPT_OPERATIONS,
  RECORD_PROOF_ALG,
  RECORD_PROOF_JWS_TYP,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
} from './ReceiptTypes';

// Re-export the receipt plane so a SINGLE barrel line — `export * from './receipt/AcceptanceReceiptSigner'`
// (to be added to src/databox/index.ts by whoever wires C13/C19; see databox/handoffs/DBX-18.md §barrel) —
// transitively re-exports every DBX-18 symbol, mirroring the DBX-11/DBX-14/DBX-15/DBX-16 sibling pattern.
export * from './ReceiptTypes';
export * from './DurableCommit';
export * from './ReceiptStateProgression';
export * from './AcceptanceReceiptVerifier';

const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;

/**
 * The append-only idempotency store for issued receipts (ADR-0019 §Idempotency; T-24). Keyed by the protected
 * idempotency key, it returns the ORIGINAL signed receipt on a replay — never a second logical receipt. The
 * first stored receipt wins and is never overwritten. In-memory reference store; a durable store swaps in
 * behind the same surface (mirrors {@link ../gateway/IdempotencyRegistry}).
 */
export class ReceiptRegistry {
  private readonly byKey = new Map<string, SignedAcceptanceReceipt>();

  /** The original receipt stored under `idempotencyKey`, or `undefined` if this key is unseen. */
  public lookup(idempotencyKey: string): SignedAcceptanceReceipt | undefined {
    return this.byKey.get(idempotencyKey);
  }

  /** Remember the first receipt for a key; a duplicate never overwrites the original (T-24). */
  public remember(idempotencyKey: string, receipt: SignedAcceptanceReceipt): SignedAcceptanceReceipt {
    const existing = this.byKey.get(idempotencyKey);
    if (existing) {
      return existing;
    }
    this.byKey.set(idempotencyKey, receipt);
    return receipt;
  }
}

/** Everything one receipt issuance binds. Every digest is a `urn:sha256:<hex>`; every string non-empty. */
export interface AcceptanceReceiptRequest {
  /** The transaction identifier for the accepted logical operation. */
  readonly transaction: string;
  /** The assigned resource URI of the accepted record/submission. */
  readonly acceptedResource: string;
  /** The EXACT accepted-payload digest from DBX-16 (`urn:sha256:<hex>`). */
  readonly payloadDigest: string;
  /** The sender identity. */
  readonly sender: string;
  /** The addressed program relationship (opaque/pairwise). */
  readonly addressedRelationship: string;
  /** The operation type. */
  readonly operation: ReceiptOperation;
  /** The profile version that governed the class. */
  readonly profileVersion: string;
  /** The profile digest (review #18 — bound alongside the version). */
  readonly profileDigest: string;
  /** The compiled-policy digest that governed acceptance (`urn:sha256:<hex>`, review #18). */
  readonly policyDigest: string;
  /** The ODRL policy identifier. */
  readonly odrlPolicy: string;
  /** The duties activated by acceptance. */
  readonly activatedDuties: readonly string[];
  /**
   * The durable C13 commit this receipt is issued AFTER (§7.0). REQUIRED and confirmed — the receipt is never
   * issued before durable commit; its `payloadDigest` must equal the committed digest (checked below).
   */
  readonly durableCommit: DurableCommit;
  /** The protected idempotency key, when the operation carried a source-event tuple (T-24). */
  readonly idempotencyKey?: string;
  /**
   * The INJECTED legal-policy binding, present ONLY where a legal corpus governs. Copied verbatim — this
   * signer never interprets law (ADR-0015). The four review-#18 fields are validated non-empty.
   */
  readonly legalPolicy?: LegalPolicyBinding;
  /** The server acceptance time; defaults to the durable-commit time. */
  readonly acceptedAt?: string;
  /** The receipt subject id (opaque), when the profile assigns one. */
  readonly subjectId?: string;
}

/** The outcome of an issuance: the signed receipt and whether it is an idempotent replay of the original. */
export interface IssuedReceipt {
  readonly receipt: SignedAcceptanceReceipt;
  /** `true` when the idempotency key was already seen — {@link receipt} is the ORIGINAL (T-24). */
  readonly duplicate: boolean;
}

/**
 * The signed acceptance-receipt issuer (component C13/C19, IF-06; ADR-0019). It mints a W3C VC 2.0
 * `DataboxAcceptanceReceipt`, secured as an `application/vc+jwt` ES256 compact JWS, binding every immutable
 * fact of the accepted transaction. It reuses the hardened {@link signCompactJws} (no new raw crypto), and
 * enforces the two headline invariants:
 *
 * - **Never before durable commit.** {@link issue} fails closed unless a confirmed {@link DurableCommit} is
 *   present and its committed digest equals the receipt's `payloadDigest` (§7.0, ADR-0019 §Never accept
 *   before durable commit). No receipt exists for an uncommitted deposit.
 * - **Idempotent replay returns the original.** A repeat with a seen idempotency key returns the ORIGINAL
 *   signed receipt from the {@link ReceiptRegistry}, never a freshly minted one (T-24).
 */
export class AcceptanceReceiptSigner {
  private readonly registry: ReceiptRegistry;

  /**
   * @param issuer - The accountable-organisation issuer identifier (ADR-0004).
   * @param issuerPrivateKey - The program's ES256 (P-256) signing key object (custody in C18/KMS).
   * @param verificationMethod - The `kid` / verification-method identifier for the signing key.
   * @param registry - The idempotency registry; defaults to a fresh in-memory {@link ReceiptRegistry}.
   */
  public constructor(
    private readonly issuer: string,
    private readonly issuerPrivateKey: KeyObject,
    private readonly verificationMethod: string,
    registry: ReceiptRegistry = new ReceiptRegistry(),
  ) {
    this.registry = registry;
  }

  /**
   * Issue one signed acceptance receipt. On an idempotency-key replay the ORIGINAL receipt is returned
   * unchanged (T-24). Otherwise the durable commit is asserted (no receipt before commit), the committed
   * digest is cross-checked against the bound payload digest, the receipt is built and signed, stored under
   * its idempotency key (when present), and returned.
   */
  public issue(request: AcceptanceReceiptRequest): IssuedReceipt {
    // T-24: a duplicate idempotency key returns the ORIGINAL logical outcome — never a second receipt. This
    // is checked FIRST so a replay never re-signs or re-validates a fresh receipt.
    if (request.idempotencyKey !== undefined) {
      const original = this.registry.lookup(request.idempotencyKey);
      if (original) {
        return { receipt: original, duplicate: true };
      }
    }

    // No receipt before durable commit (§7.0, ADR-0019) — fail closed on an absent/unconfirmed signal.
    const commit = assertDurableCommit(request.durableCommit);
    if (normalizeSha256(request.payloadDigest) !== normalizeSha256(commit.payloadDigest)) {
      throw new BadRequestHttpError('Receipt payloadDigest does not match the durably-committed digest.');
    }

    const binding = this.buildBinding(request, commit);
    const receiptId = `urn:uuid:${randomUUID()}`;
    const credential: DataboxAcceptanceReceiptCredential = {

      '@context': [ VC_V2_CONTEXT, DBX_RECORD_CONTEXT ],
      id: receiptId,
      type: [ VERIFIABLE_CREDENTIAL_TYPE, DATABOX_RECEIPT_CREDENTIAL_TYPE ],
      issuer: this.requireNonEmpty(this.issuer, 'issuer'),
      validFrom: binding.acceptedAt,
      credentialSubject: {
        ...request.subjectId === undefined ? {} : { id: request.subjectId },
        receipt: binding,
      },
    };

    const jws = signCompactJws(
      { alg: RECORD_PROOF_ALG, typ: RECORD_PROOF_JWS_TYP, cty: 'vc', kid: this.verificationMethod },
      credential as unknown as Record<string, unknown>,
      this.issuerPrivateKey,
    );
    const receipt: SignedAcceptanceReceipt = {
      credential,
      jws,
      receiptId,
      ...request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey },
    };
    if (request.idempotencyKey !== undefined) {
      this.registry.remember(request.idempotencyKey, receipt);
    }
    return { receipt, duplicate: false };
  }

  private buildBinding(request: AcceptanceReceiptRequest, commit: DurableCommit): AcceptanceReceiptBinding {
    if (!(RECEIPT_OPERATIONS as readonly string[]).includes(request.operation)) {
      throw new BadRequestHttpError('Receipt operation must be a deposit or submission.');
    }
    const acceptedAt = request.acceptedAt ?? commit.committedAt;
    if (Number.isNaN(Date.parse(acceptedAt))) {
      throw new BadRequestHttpError('Receipt acceptedAt must be a parseable ISO-8601 instant.');
    }
    if (!Array.isArray(request.activatedDuties) ||
      !request.activatedDuties.every((duty): boolean => typeof duty === 'string' && duty.length > 0)) {
      throw new BadRequestHttpError('Receipt activatedDuties must be an array of non-empty strings.');
    }
    return {
      transaction: this.requireNonEmpty(request.transaction, 'transaction'),
      acceptedResource: this.requireNonEmpty(request.acceptedResource, 'acceptedResource'),
      payloadDigest: this.requireDigest(request.payloadDigest, 'payloadDigest'),
      canonicalization: PINNED_CANONICALIZATION_ALG,
      sender: this.requireNonEmpty(request.sender, 'sender'),
      addressedRelationship: this.requireNonEmpty(request.addressedRelationship, 'addressedRelationship'),
      acceptedAt,
      operation: request.operation,
      profileVersion: this.requireNonEmpty(request.profileVersion, 'profileVersion'),
      profileDigest: this.requireNonEmpty(request.profileDigest, 'profileDigest'),
      policyDigest: this.requireDigest(request.policyDigest, 'policyDigest'),
      odrlPolicy: this.requireNonEmpty(request.odrlPolicy, 'odrlPolicy'),
      activatedDuties: [ ...request.activatedDuties as readonly string[] ],
      ...request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey },
      commitEventId: this.requireNonEmpty(commit.eventId, 'commitEventId'),
      ...request.legalPolicy === undefined ? {} : { legal: this.requireLegal(request.legalPolicy) },
      state: 'accepted',
    };
  }

  private requireLegal(legal: LegalPolicyBinding): LegalPolicyBinding {
    // Copied verbatim from the injected compiled-policy bundle — never interpreted here (ADR-0015). Only the
    // presence of the review-#18 fields is enforced (a policy-version string alone is insufficient).
    return {
      compiledPolicyDigest: this.requireNonEmpty(legal.compiledPolicyDigest, 'legal.compiledPolicyDigest'),
      corpusManifestDigest: this.requireNonEmpty(legal.corpusManifestDigest, 'legal.corpusManifestDigest'),
      attestationId: this.requireNonEmpty(legal.attestationId, 'legal.attestationId'),
      evaluatorVersion: this.requireNonEmpty(legal.evaluatorVersion, 'legal.evaluatorVersion'),
    };
  }

  private requireNonEmpty(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestHttpError(`Receipt field '${field}' must be a non-empty string.`);
    }
    return value;
  }

  private requireDigest(value: unknown, field: string): string {
    if (typeof value !== 'string' || !SHA256_URN.test(value)) {
      throw new BadRequestHttpError(`Receipt field '${field}' must be a urn:sha256:<64 hex> digest.`);
    }
    return value;
  }
}
