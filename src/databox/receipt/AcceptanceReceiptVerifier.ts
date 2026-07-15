import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { decodeCompactJws, verifyCompactJws } from '../credential/Es256';
import { canonicalDigest, digestOfBytes, normalizeSha256 } from '../proof/Canonicalization';
import type { IssuerTrustStore } from '../proof/IssuerTrustStore';
import type {
  AcceptanceReceiptBinding,
  DataboxAcceptanceReceiptCredential,
  LegalPolicyBinding,
  ReceiptState,
} from './ReceiptTypes';
import {
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  PINNED_CANONICALIZATION_ALG,
  RECEIPT_OPERATIONS,
  RECEIPT_STATES,
  RECORD_PROOF_JWS_TYP,
  VERIFIABLE_CREDENTIAL_TYPE,
} from './ReceiptTypes';

/**
 * The **offline** acceptance-receipt verifier (ADR-0019 §Receipt validity is independent of the provider;
 * T-28/T-46). It establishes a receipt's authenticity and integrity from the receipt bytes and a retained
 * signing key ALONE — it never dereferences the accepted resource, a status list, or any live URL. This is
 * what lets a validly issued receipt keep verifying after the provider later deletes/alters/tombstones the
 * underlying record (invariant 8): the receipt binds a digest and is signed with a retained key.
 *
 * The signing key is resolved from the program {@link IssuerTrustStore} (the reviewed DBX-16 key-history
 * resolver, consumed via import) keyed by `(issuer, kid, acceptedAt)` — never from the JWS header — so a
 * receipt signed by a **since-rotated** key still verifies (its window contained the acceptance time), while
 * a `revoked`/substituted key fails closed. Authenticity uses the reused, hardened
 * {@link verifyCompactJws} (alg-swap denied); no raw crypto is added here.
 */

/** The per-verification context. No trust input comes from the receipt itself. */
export interface ReceiptVerificationContext {
  /** Trusted issuer keys + key history for the program that signed the receipt (ADR-0020 §6). */
  readonly trustStore: IssuerTrustStore;
  /**
   * The exact accepted payload bytes. When supplied, their digest MUST equal the receipt's bound
   * `payloadDigest` — altered record bytes fail (T-28: the provider cannot swap the record under a receipt).
   */
  readonly acceptedPayload?: Buffer | string;
  /** When set, the receipt's `transaction` MUST equal this (binds the receipt to an expected transaction). */
  readonly expectedTransaction?: string;
}

/** The result of verifying an acceptance receipt — only ever returned when it is cryptographically valid. */
export interface ReceiptVerification {
  /** Always `true` when a result is returned: the signature verified against a trusted, in-window key. */
  readonly cryptographicallyValid: true;
  readonly issuer: string;
  readonly verificationMethod: string;
  /** The canonical digest of the whole receipt credential (DBX-19 anchors this into the evidence ledger). */
  readonly receiptDigest: string;
  /** The immutable facts the receipt binds (transaction, resource, exact payload digest, policy, duties…). */
  readonly binding: AcceptanceReceiptBinding;
  /** The state the receipt attests — always `accepted` for a signed acceptance receipt. */
  readonly state: ReceiptState;
}

const RECEIPT_STATE_SET = new Set<string>(RECEIPT_STATES);
const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;

export class AcceptanceReceiptVerifier {
  /** Verify a compact-JWS acceptance receipt offline against `context`, fail-closed at each step. */
  public verify(jws: string, context: ReceiptVerificationContext): ReceiptVerification {
    // Read the UNVERIFIED header/payload only to resolve which trusted key applies. Nothing is trusted until
    // the signature verifies against the store-resolved key below.
    const preview = decodeCompactJws(jws);
    if (preview.header.typ !== RECORD_PROOF_JWS_TYP) {
      throw new BadRequestHttpError(`Unexpected JWS typ; expected ${RECORD_PROOF_JWS_TYP}.`);
    }
    const verificationMethod = preview.header.kid;
    if (typeof verificationMethod !== 'string') {
      throw new BadRequestHttpError('Receipt header is missing a string kid (verification method).');
    }
    const previewPayload = preview.payload as Partial<DataboxAcceptanceReceiptCredential>;
    const issuer = previewPayload.issuer;
    if (typeof issuer !== 'string') {
      throw new BadRequestHttpError('Receipt credential is missing an issuer.');
    }
    if (typeof previewPayload.validFrom !== 'string') {
      throw new BadRequestHttpError('Receipt credential is missing validFrom.');
    }
    const acceptanceTime = Date.parse(previewPayload.validFrom);
    if (Number.isNaN(acceptanceTime)) {
      throw new BadRequestHttpError('Receipt credential validFrom is unparseable.');
    }

    // Resolve the trusted key from the program store (never the header) keyed by acceptance time so a
    // since-rotated key still verifies while a revoked/substituted key fails closed (T-28/T-20).
    const key = context.trustStore.resolve(issuer, verificationMethod, acceptanceTime);

    // Authenticity — throws on a bad/alg-swapped/altered signature (reused, hardened Es256 verify). An altered
    // receipt byte anywhere in header or payload breaks this (T-46 repudiation defence).
    const verified = verifyCompactJws(jws, key);
    const credential = verified.payload as unknown as DataboxAcceptanceReceiptCredential;

    const binding = this.assertShape(credential);

    // Integrity — when the record bytes are supplied, their EXACT digest must match the bound payloadDigest.
    // A provider that deletes and re-creates a DIFFERENT record cannot make it verify under this receipt (T-28).
    if (context.acceptedPayload !== undefined &&
      normalizeSha256(digestOfBytes(context.acceptedPayload)) !== normalizeSha256(binding.payloadDigest)) {
      throw new BadRequestHttpError('Accepted payload digest does not match the receipt binding (integrity).');
    }
    if (context.expectedTransaction !== undefined && binding.transaction !== context.expectedTransaction) {
      throw new BadRequestHttpError('Receipt transaction does not match the expected transaction.');
    }

    return {
      cryptographicallyValid: true,
      issuer,
      verificationMethod,
      receiptDigest: canonicalDigest(credential),
      binding,
      state: binding.state,
    };
  }

  private assertShape(credential: DataboxAcceptanceReceiptCredential): AcceptanceReceiptBinding {
    if (!Array.isArray(credential.type) ||
      !credential.type.includes(VERIFIABLE_CREDENTIAL_TYPE) ||
      !credential.type.includes(DATABOX_RECEIPT_CREDENTIAL_TYPE)) {
      throw new BadRequestHttpError('Credential is not a VerifiableCredential DataboxAcceptanceReceipt.');
    }
    const subject = credential.credentialSubject;
    if (typeof subject !== 'object' || subject === null ||
      typeof subject.receipt !== 'object' || subject.receipt === null) {
      throw new BadRequestHttpError('Receipt credential is missing a credentialSubject.receipt binding.');
    }
    const receipt = subject.receipt;
    this.assertBindingFields(receipt);
    return receipt;
  }

  private assertBindingFields(receipt: AcceptanceReceiptBinding): void {
    const nonEmpty: (keyof AcceptanceReceiptBinding)[] = [
      'transaction',
      'acceptedResource',
      'sender',
      'addressedRelationship',
      'acceptedAt',
      'odrlPolicy',
      'profileVersion',
      'profileDigest',
      'commitEventId',
    ];
    for (const field of nonEmpty) {
      const value = receipt[field];
      if (typeof value !== 'string' || value.length === 0) {
        throw new BadRequestHttpError(`Receipt binding field '${field}' must be a non-empty string.`);
      }
    }
    if (receipt.canonicalization !== PINNED_CANONICALIZATION_ALG) {
      throw new BadRequestHttpError(
        `Receipt declares an unpinned canonicalization; only ${PINNED_CANONICALIZATION_ALG} is reproducible.`,
      );
    }
    if (typeof receipt.payloadDigest !== 'string' || !SHA256_URN.test(receipt.payloadDigest)) {
      throw new BadRequestHttpError('Receipt payloadDigest must be a urn:sha256:<64 hex> digest.');
    }
    if (typeof receipt.policyDigest !== 'string' || !SHA256_URN.test(receipt.policyDigest)) {
      throw new BadRequestHttpError('Receipt policyDigest must be a urn:sha256:<64 hex> digest.');
    }
    if (!(RECEIPT_OPERATIONS as readonly string[]).includes(receipt.operation)) {
      throw new BadRequestHttpError('Receipt has an unknown operation type.');
    }
    if (!Array.isArray(receipt.activatedDuties) ||
      !receipt.activatedDuties.every((duty): boolean => typeof duty === 'string')) {
      throw new BadRequestHttpError('Receipt activatedDuties must be an array of strings.');
    }
    if (!RECEIPT_STATE_SET.has(receipt.state) || receipt.state !== 'accepted') {
      throw new BadRequestHttpError('A signed acceptance receipt must attest the accepted state.');
    }
    if (receipt.legal !== undefined) {
      this.assertLegalBinding(receipt.legal);
    }
  }

  private assertLegalBinding(legal: LegalPolicyBinding): void {
    const fields: (keyof LegalPolicyBinding)[] =
      [ 'compiledPolicyDigest', 'corpusManifestDigest', 'attestationId', 'evaluatorVersion' ];
    for (const field of fields) {
      if (typeof legal[field] !== 'string' || legal[field].length === 0) {
        throw new BadRequestHttpError(`Legal-policy binding field '${field}' must be a non-empty string (review #18).`);
      }
    }
  }
}
