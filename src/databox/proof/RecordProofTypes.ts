import type { PublicJwk } from '../credential/ConnectionCredentialTypes';
import {
  CONNECTION_CREDENTIAL_ALG,
  CONNECTION_CREDENTIAL_JWS_TYP,
} from '../credential/ConnectionCredentialTypes';

/**
 * Pure value types + pinned constants for the Databox verifiable **record** and **acceptance-receipt**
 * proof suite (component C7/C16, DBX-04; ADR-0020, DBX-16). No runtime logic lives here so the pinned
 * suite, the canonicalization identifier and the valid-vs-true field set are stated exactly once and cannot
 * drift between the issuer, the {@link RecordProofValidator}, the status service and DBX-18 receipts.
 *
 * The suite is deliberately the **same** as the Databox Connection Credential (ADR-0007): W3C Verifiable
 * Credentials Data Model 2.0, secured with VC-JOSE-COSE and signed with **ES256** (P-256), served as
 * `application/vc+jwt`, status by **BitstringStatusList**. One pinned toolchain verifies connection
 * credentials, records and receipts (ADR-0020 §1/§2). The ES256 alg and JWS typ constants are re-exported
 * from the credential module so there is a single source of truth — an alg-swap is structurally denied by
 * {@link verifyCompactJws}.
 */

/** The pinned W3C VC 2.0 context (ADR-0001/0020), shared with the connection credential. */
export { VC_V2_CONTEXT, VERIFIABLE_CREDENTIAL_TYPE } from '../credential/ConnectionCredentialTypes';

/** The only JOSE algorithm records/receipts are signed/verified with (ES256, ADR-0020 §1). */
export const RECORD_PROOF_ALG = CONNECTION_CREDENTIAL_ALG;

/** The JOSE `typ` header value for a secured record/receipt (VC-JOSE-COSE `vc+jwt`). */
export const RECORD_PROOF_JWS_TYP = CONNECTION_CREDENTIAL_JWS_TYP;

/** The VC-JOSE-COSE media type records/receipts are secured as (`application/vc+jwt`, ADR-0020). */
export const RECORD_PROOF_MEDIA_TYPE = 'application/vc+jwt';

/** The pinned Databox record JSON-LD context (ADR-0025/S-14: pinned by hash, never a live mutable URL). */
export const DBX_RECORD_CONTEXT = 'https://w3id.org/solid-databox/context/records/v1';

/** The Databox record credential type (ADR-0020). */
export const DATABOX_RECORD_CREDENTIAL_TYPE = 'DataboxRecordCredential';

/** The Databox acceptance-receipt credential type (ADR-0019/0020 — same suite as records). */
export const DATABOX_RECEIPT_CREDENTIAL_TYPE = 'DataboxAcceptanceReceipt';

/** The BitstringStatusList entry type (ADR-0020 §2: status MUST use BitstringStatusList). */
export { BITSTRING_STATUS_LIST_ENTRY_TYPE } from '../credential/ConnectionCredentialTypes';

/**
 * The pinned, versioned canonicalization algorithm identifier (ADR-0020 §3). A single canonicalization
 * MUST be frozen so any verifier reproduces the exact digest; a record declaring any other identifier
 * cannot be reproduced and is rejected. `dbx-jcs/1.0.0` is RFC 8785-style JSON Canonicalization (sorted
 * keys, minimal separators, no insignificant whitespace) implemented in {@link canonicalize}.
 */
export const PINNED_CANONICALIZATION_ALG = 'dbx-jcs/1.0.0';

/**
 * How a claim's value was established (ADR-0020 §4, isolation-and-privacy.md). A machine-generated
 * interpretation is NOT the same as a human-attested or externally verified fact — the method is a
 * first-class field so a consumer can tell them apart.
 */
export const RECORD_METHODS = [
  'self-asserted',
  'verified-credential',
  'machine-generated',
  'institutional-record',
] as const;
export type RecordMethod = typeof RECORD_METHODS[number];

/**
 * The verification status of a record's claim (ADR-0020 §4). This is the valid-vs-true axis: a preference
 * or a self-asserted fact is not a verified credential, and a machine-proposed interpretation is not
 * attested until an authorized human attests it. A valid signature never upgrades this status.
 */
export const VERIFICATION_STATUSES = [
  'preference',
  'self-asserted',
  'verified',
  'machine-proposed',
] as const;
export type RecordVerificationStatus = typeof VERIFICATION_STATUSES[number];

/**
 * The record binding carried in `credentialSubject.record` (ADR-0020 §3/§4). It binds the **exact
 * accepted-payload digest** (never a re-serialised form), the pinned canonicalization identifier, the
 * compiled-policy/profile/corpus digests (review #18 — bind digests, not a version string) and the
 * valid-vs-true fields (author/method/verification-status/attester).
 */
export interface RecordClaimBinding {
  /** `urn:sha256:<hex>` of the EXACT accepted payload bytes (the digest DBX-18 receipts bind). */
  readonly payloadDigest: string;
  /** MUST equal {@link PINNED_CANONICALIZATION_ALG}; any other value is unreproducible → rejected. */
  readonly canonicalization: string;
  /** The record/submission class id this record belongs to. */
  readonly recordClass: string;
  /** The opaque relationship id, when the record is relationship-scoped. */
  readonly relationship?: string;
  /** The compiled-policy / profile digest bound to this record (review #18, ADR-0014/0015). */
  readonly policyDigest?: string;
  /** The legislative-corpus manifest digest, where a compiled policy applies (ADR-0015). */
  readonly corpusManifestDigest?: string;
  /** The human-attestation identifier, when an authorized human has attested (ADR-0015). */
  readonly attestationId?: string;
  /** Who authored the claim (opaque author id — ADR-0020 §4). */
  readonly author: string;
  /** How the value was established. */
  readonly method: RecordMethod;
  /** The verification status of the claim (never upgraded by a valid signature). */
  readonly verificationStatus: RecordVerificationStatus;
  /** The authorized human attester, present only when the claim has actually been human-attested. */
  readonly attester?: string;
}

/** The record credential subject: an optional subject id and the {@link RecordClaimBinding}. */
export interface DataboxRecordCredentialSubject {
  readonly id?: string;
  readonly record: RecordClaimBinding;
}

/** The BitstringStatusList status reference embedded in a record/receipt (ADR-0020 §2). */
export interface RecordStatusReference {
  readonly id: string;
  readonly type: 'BitstringStatusListEntry';
  readonly statusPurpose: string;
  readonly statusListIndex: number;
  readonly statusListCredential: string;
}

/**
 * A W3C VC 2.0 Databox record or acceptance-receipt credential (ADR-0020). This is the JWS payload of the
 * `application/vc+jwt` secured record; the securing JWS is verified by {@link RecordProofValidator}.
 */
export interface DataboxRecordCredential {

  readonly '@context': readonly string[];
  readonly id: string;
  readonly type: readonly string[];
  readonly issuer: string;
  readonly validFrom: string;
  readonly validUntil?: string;
  readonly credentialSubject: DataboxRecordCredentialSubject;
  readonly credentialStatus: RecordStatusReference;
}

/**
 * A retained issuer signing key in the ledger's key history (ADR-0020 §6, ADR-0019). A `rotated` key stays
 * usable to verify records **issued within its validity window** (so a since-rotated key still verifies
 * historical records); a `revoked` key — the stolen/compromised-key case (T-20) — never verifies, even a
 * historical record, because its private half is no longer trustworthy. The public key comes from HERE, not
 * from the JWS header (a header-supplied key is never trusted).
 */
export interface IssuerKeyDescriptor {
  /** The credential `issuer` this key belongs to; MUST match the credential exactly. */
  readonly issuer: string;
  /** The `kid` / verification-method identifier; MUST match the JWS header `kid` exactly. */
  readonly verificationMethod: string;
  /** The trusted issuer public key (EC P-256). Never the private half. */
  readonly publicKeyJwk: PublicJwk;
  /** `active` (current), `rotated` (retired cleanly — historical records still verify), `revoked` (T-20). */
  readonly status: 'active' | 'rotated' | 'revoked';
  /** ISO instant the key became valid. A record issued before this is rejected. */
  readonly validFrom: string;
  /** ISO instant the key was retired; a record issued at/after this is rejected. Undefined = still current. */
  readonly validUntil?: string;
}

/** The immutable statement that a valid signature is not a true or human-attested claim (review #13). */
export const VALIDITY_NOT_TRUTH_CAVEAT =
  'Cryptographic validity attests the issuer, integrity and issuance time of this record — not the truth ' +
  'of its claim nor human attestation of any machine-generated interpretation (ADR-0020 §4, review #13).';

/**
 * The result of verifying a record proof. It is only ever returned when the record is **cryptographically
 * valid** (a failure throws — fail closed); the fields then let a consumer separate a valid signature from
 * a true/attested claim (ADR-0020 §4).
 *
 * **M1 (round 2): human attestation is INDEPENDENT of the issuer's own signature.** An `attester` string
 * inside the issuer's JWS is *issuer-proposed*, not independent human attestation — a compromised/automated
 * bridge (the T-20 actor) could stamp any attester and flip a machine claim to "attested", collapsing
 * validity≠truth. Independent attestation requires a SEPARATE proof over the record digest by a key in a
 * distinct attester trust set. That mechanism is not built yet (residual, DBX-20 / legal-policy workstream),
 * so `humanAttested` is currently **always `false`** and {@link mayPresentAsAttested} never returns `true`
 * for a record on the strength of the issuer's self-asserted attester alone. The issuer's proposed attester
 * is surfaced as {@link RecordVerification.claim.issuerProposedAttester} — clearly not authoritative.
 */
export interface RecordVerification {
  /** Always `true` when a result is returned: the signature verified against a trusted issuer key. */
  readonly cryptographicallyValid: true;
  /**
   * Whether an authorized human has INDEPENDENTLY attested the claim (a separate attestation proof over the
   * record digest by a key in a distinct attester trust set). Currently always `false`: that separate
   * mechanism is a residual (DBX-20). The issuer's own self-asserted attester never sets this (M1).
   */
  readonly humanAttested: boolean;
  /** True when the record carries machine-generated/proposed content that still needs a human attester. */
  readonly requiresHumanAttestation: boolean;
  readonly issuer: string;
  readonly verificationMethod: string;
  /** The canonical digest of the whole record credential (DBX-18 binds this into the receipt). */
  readonly recordDigest: string;
  /** The exact accepted-payload digest bound in the record (preserved, never recomputed by canonicalizing). */
  readonly payloadDigest: string;
  /** The valid-vs-true claim descriptors surfaced verbatim from the record. */
  readonly claim: {
    readonly author: string;
    readonly method: RecordMethod;
    /** The ISSUER-PROPOSED verification status (not an independently verified fact — M1). */
    readonly verificationStatus: RecordVerificationStatus;
    /** The attester the ISSUER proposed in its own signature — NOT independent human attestation (M1). */
    readonly issuerProposedAttester?: string;
  };
  /** The verbatim {@link VALIDITY_NOT_TRUTH_CAVEAT}. */
  readonly caveat: string;
}

/**
 * Whether a verified record MAY be presented to a consumer as attested/true. Returns `true` ONLY when an
 * INDEPENDENT human attestation has been established (`humanAttested`) and no attestation is still
 * outstanding — never on the strength of the issuer's self-asserted attester (M1). Because the independent
 * attestation mechanism is a residual (DBX-20), this currently returns `false` for every verified record,
 * surfacing the valid-vs-true distinction the register forbids collapsing (ADR-0020 §4, review #13).
 */
export function mayPresentAsAttested(result: RecordVerification): boolean {
  return result.humanAttested && !result.requiresHumanAttestation;
}
