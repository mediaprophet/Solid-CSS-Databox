import {
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  DBX_RECORD_CONTEXT,
  PINNED_CANONICALIZATION_ALG,
  RECORD_PROOF_ALG,
  RECORD_PROOF_JWS_TYP,
  RECORD_PROOF_MEDIA_TYPE,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
} from '../proof/RecordProofTypes';

/**
 * Pure value types + pinned constants for the Databox signed **acceptance receipt** (component C13/C19,
 * IF-06; ADR-0019, exchange-and-evidence.md §Signed receipt). No runtime logic lives here so the receipt
 * shape, the receipt-state vocabulary and the legal-policy binding are stated exactly once and cannot drift
 * between the {@link AcceptanceReceiptSigner}, the {@link AcceptanceReceiptVerifier} and DBX-19/DBX-21.
 *
 * The receipt reuses the **same** proof suite as records and the connection credential (ADR-0020, DBX-16):
 * W3C VC 2.0, secured VC-JOSE-COSE, signed with **ES256**, served as `application/vc+jwt`. The constants are
 * re-exported from the DBX-16 proof types so there is a single source of truth — an alg-swap is structurally
 * denied by the reused {@link verifyCompactJws}.
 *
 * **Deliberately NO `credentialStatus` on a receipt.** A record's verification fails closed on an unreachable
 * status list; a receipt must verify *independently and offline* after export, so that a later provider
 * deletion/alteration NEVER invalidates an already-issued receipt (invariant 8; T-28). The receipt therefore
 * binds a digest and is signed with a retained key — its validity depends only on the retained signing-key
 * history and the receipt bytes, not on any live resource, URL or status list.
 */

/** The proof suite constants the receipt reuses verbatim from the DBX-16 record-proof suite (ADR-0020). */
export {
  RECORD_PROOF_ALG,
  RECORD_PROOF_JWS_TYP,
  RECORD_PROOF_MEDIA_TYPE,
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  PINNED_CANONICALIZATION_ALG,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
  DBX_RECORD_CONTEXT,
};

/**
 * The receipt state vocabulary (ADR-0019 §Receipt states). A receipt is NOT a single fact: it tracks a
 * **monotonic, append-only progression** of distinct evidence events, each a recorded transition — never an
 * overwrite. `accepted` is what the signed acceptance receipt attests (durable commit at the server) and MUST
 * NOT be conflated with the later hint/consumer-driven states (ADR-0011/0012). `disposed` is terminal.
 */
export const RECEIPT_STATES = [
  'accepted',
  'notified',
  'retrieved',
  'acknowledged',
  'reviewed',
  'disposed',
] as const;
export type ReceiptState = typeof RECEIPT_STATES[number];

/** The zero-based monotonic ordinal of a receipt state (its position in {@link RECEIPT_STATES}). */
export function receiptStateOrdinal(state: ReceiptState): number {
  return RECEIPT_STATES.indexOf(state);
}

/** The operation an acceptance receipt attests: an institutional deposit or a consumer submission. */
export const RECEIPT_OPERATIONS = [ 'deposit', 'submission' ] as const;
export type ReceiptOperation = typeof RECEIPT_OPERATIONS[number];

/**
 * The legal-policy binding (review #18, ADR-0014/0015). Where a **legal corpus** governs acceptance, a bare
 * policy-version *string* is insufficient: the receipt MUST bind the compiled-policy digest, the
 * corpus-manifest digest, the human-attestation identifier and the evaluator version. These are **injected**
 * from an already-compiled legal bundle — this module NEVER interprets law (ADR-0015 boundary); it copies the
 * provided reference verbatim into the receipt so the exact governing corpus is later provable.
 */
export interface LegalPolicyBinding {
  /** The digest of the compiled policy that governed acceptance. */
  readonly compiledPolicyDigest: string;
  /** The digest of the legislative-corpus manifest the policy was compiled from. */
  readonly corpusManifestDigest: string;
  /** The identifier of the human attestation admitting the compiled policy (IF-19). */
  readonly attestationId: string;
  /** The version of the evaluator that will apply the policy. */
  readonly evaluatorVersion: string;
}

/**
 * The immutable facts bound into a signed acceptance receipt (ADR-0019 §Receipt content; IF-06). Every field
 * is a canonical, immutable fact of the transaction. The `payloadDigest` is the **exact accepted-payload
 * digest** produced by DBX-16 (never a re-serialised form); `profileDigest`/`policyDigest` bind digests, not
 * a mutable version label (review #18); `commitEventId` binds the C13 durable-commit event the receipt was
 * issued after (§7.0 — never before durable commit).
 */
export interface AcceptanceReceiptBinding {
  /** The transaction identifier (opaque, per accepted logical operation). */
  readonly transaction: string;
  /** The assigned resource URI of the accepted record/submission. */
  readonly acceptedResource: string;
  /** `urn:sha256:<hex>` of the EXACT accepted payload bytes (the DBX-16 digest). */
  readonly payloadDigest: string;
  /** The pinned canonicalization identifier the digest scheme is bound to. */
  readonly canonicalization: string;
  /** The sender identity (institutional issuer for a deposit, consumer for a submission). */
  readonly sender: string;
  /** The addressed program relationship (opaque/pairwise — never a global identifier). */
  readonly addressedRelationship: string;
  /** The server acceptance time (ISO-8601) — equal to the durable-commit time. */
  readonly acceptedAt: string;
  /** The operation type the receipt attests. */
  readonly operation: ReceiptOperation;
  /** The profile version that governed the accepted class. */
  readonly profileVersion: string;
  /** The profile digest bound alongside the version (review #18 — not a bare string). */
  readonly profileDigest: string;
  /** The compiled-policy digest that governed acceptance (review #18, ADR-0014). */
  readonly policyDigest: string;
  /** The ODRL policy identifier that governs the class (ADR-0012). */
  readonly odrlPolicy: string;
  /** The duties ACTIVATED by acceptance (ADR-0012; distinct from later fulfilment). */
  readonly activatedDuties: readonly string[];
  /** The protected idempotency key (the HD-12 tuple's keyed HMAC), when the operation carried one. */
  readonly idempotencyKey?: string;
  /** The C13 durable-commit event id this receipt was issued after (§7.0; never before commit). */
  readonly commitEventId: string;
  /** The injected legal-policy binding, present ONLY when a legal corpus governs (review #18). */
  readonly legal?: LegalPolicyBinding;
  /** The state a signed acceptance receipt attests is always `accepted` (durable commit at the server). */
  readonly state: 'accepted';
}

/** The receipt credential subject: an optional subject id and the {@link AcceptanceReceiptBinding}. */
export interface AcceptanceReceiptSubject {
  readonly id?: string;
  readonly receipt: AcceptanceReceiptBinding;
}

/**
 * A W3C VC 2.0 Databox acceptance-receipt credential (ADR-0019/0020). This is the JWS payload of the
 * `application/vc+jwt` secured receipt; the securing JWS is produced by {@link AcceptanceReceiptSigner} and
 * verified by {@link AcceptanceReceiptVerifier}. It carries NO `credentialStatus` (see the module note) so it
 * verifies offline, independent of any live provider resource.
 */
export interface DataboxAcceptanceReceiptCredential {

  readonly '@context': readonly string[];
  readonly id: string;
  readonly type: readonly string[];
  readonly issuer: string;
  readonly validFrom: string;
  readonly credentialSubject: AcceptanceReceiptSubject;
}

/** The issued artefacts: the receipt credential object, its securing JWS, and the receipt id. */
export interface SignedAcceptanceReceipt {
  readonly credential: DataboxAcceptanceReceiptCredential;
  readonly jws: string;
  /** The stable receipt id (the credential `id`). */
  readonly receiptId: string;
  /** Mirror of the bound idempotency key, when present (the idempotency registry keys on this). */
  readonly idempotencyKey?: string;
}
