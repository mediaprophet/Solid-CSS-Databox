import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { BitstringStatusList } from '../credential/BitstringStatusList';
import { decodeCompactJws, verifyCompactJws } from '../credential/Es256';
import { canonicalDigest, digestOfBytes, normalizeSha256 } from './Canonicalization';
import type { CarriedContext, PinnedContextSet } from './OfflineVerification';
import type { IssuerTrustStore } from './IssuerTrustStore';
import {
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  DATABOX_RECORD_CREDENTIAL_TYPE,
  PINNED_CANONICALIZATION_ALG,
  RECORD_METHODS,
  RECORD_PROOF_JWS_TYP,
  VALIDITY_NOT_TRUTH_CAVEAT,
  VERIFIABLE_CREDENTIAL_TYPE,
  VERIFICATION_STATUSES,
} from './RecordProofTypes';
import type {
  DataboxRecordCredential,
  RecordClaimBinding,
  RecordVerification,
} from './RecordProofTypes';

// Re-export the proof plane so a SINGLE barrel line — `export * from './proof/RecordProofValidator'`
// (to be added to src/databox/index.ts by whoever wires C7/C16; see databox/handoffs/DBX-16.md §barrel) —
// transitively re-exports every DBX-16 symbol, mirroring the DBX-11/DBX-14/DBX-15 sibling re-export pattern.
export * from './RecordProofTypes';
export * from './Canonicalization';
export * from './OfflineVerification';
export * from './IssuerTrustStore';

/** Resolves a program-local published BitstringStatusList by its identifier; `undefined` = unreachable. */
export type StatusListResolver = (statusListCredential: string) => BitstringStatusList | undefined;

/**
 * The per-verification context. None of the trust inputs come from the token: the {@link IssuerTrustStore},
 * the {@link PinnedContextSet} and the {@link StatusListResolver} are supplied by the addressed program.
 */
export interface RecordProofContext {
  /** Trusted issuer keys + key history for THIS program (ADR-0020 §6). */
  readonly trustStore: IssuerTrustStore;
  /** Pinned JSON-LD contexts; unpinned/remote contexts fail closed (T-21). */
  readonly pinnedContexts: PinnedContextSet;
  /** Resolves the published status list to check revocation/suspension (ADR-0020 §2). */
  readonly statusListResolver: StatusListResolver;
  /** Current instant (epoch ms); defaults to `Date.now()`. */
  readonly now?: number;
  /** The exact accepted payload bytes; when supplied, their digest MUST equal the bound `payloadDigest`. */
  readonly acceptedPayload?: Buffer | string;
  /** Carried context documents to hash-check against the pins (offline bundle, ADR-0020 §5). */
  readonly offlineContexts?: readonly CarriedContext[];
  /** When set, the record's `recordClass` must equal this (addressed-class binding). */
  readonly expectedRecordClass?: string;
}

const RECORD_TYPES = new Set<string>([ DATABOX_RECORD_CREDENTIAL_TYPE, DATABOX_RECEIPT_CREDENTIAL_TYPE ]);
const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;

/**
 * The record-proof validator (component C7/C16, ADR-0020, DBX-16). It is invoked by the deposit/submission
 * gateway (DBX-15) during the deposit trace (§7.1 validates signature/status BEFORE accept) and by any
 * offline verifier. It establishes, fail-closed and in order:
 *
 * 1. **Pinned contexts** — every `@context` URL is pinned; carried contexts hash-match (T-21).
 * 2. **Trusted issuer + key history** — the key is resolved from the program's trust store by
 *    `(issuer, kid, issuance time)`, never from the token; a revoked/compromised or out-of-window key fails
 *    (T-20).
 * 3. **Authenticity** — the ES256 JWS verifies against that resolved key (alg-swap denied by Es256).
 * 4. **Shape** — VC 2.0 + record/receipt type, the pinned canonicalization identifier, and the valid-vs-true
 *    fields (author/method/verification-status).
 * 5. **Validity window** — `now ∈ [validFrom, validUntil)`.
 * 6. **Integrity** — the exact accepted-payload digest is preserved and matches; an altered payload fails.
 * 7. **Status** — BitstringStatusList must resolve and not mark the record revoked/suspended (fail closed).
 *
 * It then returns a {@link RecordVerification} that **surfaces validity ≠ truth**: a well-formed signed
 * record with a false or machine-proposed claim is still a valid signature, but `humanAttested` is `false`
 * and {@link mayPresentAsAttested} refuses to present it as attested/true (review #13).
 */
export class RecordProofValidator {
  /** Validate a compact-JWS record/receipt proof against `context`, returning the valid-vs-true result. */
  public validate(jws: string, context: RecordProofContext): RecordVerification {
    // Read the UNVERIFIED header/payload only to resolve which trusted key + contexts apply. Nothing here is
    // trusted until the signature verifies against the store-resolved key below.
    const preview = decodeCompactJws(jws);
    if (preview.header.typ !== RECORD_PROOF_JWS_TYP) {
      throw new BadRequestHttpError(`Unexpected JWS typ; expected ${RECORD_PROOF_JWS_TYP}.`);
    }
    const verificationMethod = preview.header.kid;
    if (typeof verificationMethod !== 'string') {
      throw new BadRequestHttpError('Record proof header is missing a string kid (verification method).');
    }
    const previewPayload = preview.payload as Partial<DataboxRecordCredential>;
    const issuer = previewPayload.issuer;
    if (typeof issuer !== 'string') {
      throw new BadRequestHttpError('Record credential is missing an issuer.');
    }
    if (typeof previewPayload.validFrom !== 'string') {
      throw new BadRequestHttpError('Record credential is missing validFrom.');
    }
    const issuanceTime = Date.parse(previewPayload.validFrom);
    if (Number.isNaN(issuanceTime)) {
      throw new BadRequestHttpError('Record credential validFrom is unparseable.');
    }

    // 1. Pinned contexts (T-21) — before trusting the document at all.
    context.pinnedContexts.assertAllowed(previewPayload['@context']!);
    if (context.offlineContexts !== undefined) {
      context.pinnedContexts.verifyCarried(context.offlineContexts);
    }

    // 2. Resolve the trusted key from the program store (never the header/payload key) — fail closed (T-20).
    const key = context.trustStore.resolve(issuer, verificationMethod, issuanceTime);

    // 3. Authenticity — throws on a bad/alg-swapped signature (reused, hardened Es256 verify).
    const verified = verifyCompactJws(jws, key);
    const credential = verified.payload as unknown as DataboxRecordCredential;

    // 4-5. Shape + validity window.
    const record = this.assertShape(credential);
    this.assertValidity(credential, context.now ?? Date.now());
    if (context.expectedRecordClass !== undefined && record.recordClass !== context.expectedRecordClass) {
      throw new BadRequestHttpError('Record class does not match the addressed class.');
    }

    // 6. Integrity — the EXACT accepted payload digest is preserved; an altered payload fails.
    if (context.acceptedPayload !== undefined &&
      normalizeSha256(digestOfBytes(context.acceptedPayload)) !== normalizeSha256(record.payloadDigest)) {
      throw new BadRequestHttpError('Accepted payload digest does not match the record binding (integrity).');
    }

    // 7. Status — fail closed on unreachable/unknown or revoked/suspended (ADR-0020 §2).
    this.assertStatus(credential, context.statusListResolver);

    return this.buildResult(issuer, verificationMethod, credential, record);
  }

  private assertShape(credential: DataboxRecordCredential): RecordClaimBinding {
    if (!Array.isArray(credential.type) ||
      !credential.type.includes(VERIFIABLE_CREDENTIAL_TYPE) ||
      !credential.type.some((type: string): boolean => RECORD_TYPES.has(type))) {
      throw new BadRequestHttpError('Credential is not a VerifiableCredential record/receipt.');
    }
    const subject = credential.credentialSubject;
    if (typeof subject !== 'object' || subject === null ||
      typeof subject.record !== 'object' || subject.record === null) {
      throw new BadRequestHttpError('Record credential is missing a credentialSubject.record binding.');
    }
    const record = subject.record;
    if (record.canonicalization !== PINNED_CANONICALIZATION_ALG) {
      throw new BadRequestHttpError(
        `Record declares an unpinned canonicalization; only ${PINNED_CANONICALIZATION_ALG} is reproducible.`,
      );
    }
    if (typeof record.payloadDigest !== 'string' || !SHA256_URN.test(record.payloadDigest)) {
      throw new BadRequestHttpError('Record payloadDigest must be a urn:sha256:<64 hex> digest.');
    }
    if (typeof record.author !== 'string' || record.author.length === 0) {
      throw new BadRequestHttpError('Record is missing an author (valid-vs-true field, ADR-0020 §4).');
    }
    if (!RECORD_METHODS.includes(record.method)) {
      throw new BadRequestHttpError('Record has an unknown method (valid-vs-true field).');
    }
    if (!VERIFICATION_STATUSES.includes(record.verificationStatus)) {
      throw new BadRequestHttpError('Record has an unknown verificationStatus (valid-vs-true field).');
    }
    return record;
  }

  private assertValidity(credential: DataboxRecordCredential, now: number): void {
    const from = Date.parse(credential.validFrom);
    // `from` was already proven parseable in the preview; validUntil is optional (a record may not expire).
    if (now < from) {
      throw new BadRequestHttpError('Record credential is not yet valid.');
    }
    if (credential.validUntil !== undefined) {
      const until = Date.parse(credential.validUntil);
      if (Number.isNaN(until)) {
        throw new BadRequestHttpError('Record credential has an unparseable validUntil.');
      }
      if (now >= until) {
        throw new BadRequestHttpError('Record credential has expired.');
      }
    }
  }

  private assertStatus(credential: DataboxRecordCredential, resolver: StatusListResolver): void {
    const status = credential.credentialStatus;
    if (typeof status !== 'object' || status === null ||
      typeof status.statusListCredential !== 'string' ||
      !Number.isInteger(status.statusListIndex)) {
      throw new BadRequestHttpError('Record credential is missing a well-formed BitstringStatusList entry.');
    }
    const list = resolver(status.statusListCredential);
    if (!list) {
      // Status-unknown fails closed — an unreachable list is never assumed "not revoked" (ADR-0020 §Failure).
      throw new BadRequestHttpError('Record status list is unreachable; failing closed (ADR-0020 §2).');
    }
    if (list.getStatus(status.statusListIndex)) {
      throw new BadRequestHttpError('Record credential is revoked/suspended per its status list.');
    }
  }

  private buildResult(
    issuer: string,
    verificationMethod: string,
    credential: DataboxRecordCredential,
    record: RecordClaimBinding,
  ): RecordVerification {
    // M1: the `attester` in the ISSUER's own signature is issuer-PROPOSED, not independent human attestation
    // (a T-20 actor could stamp any attester). Independent attestation is a separate proof over the record
    // digest by a key in a distinct attester trust set — not built yet (residual, DBX-20). So no verified
    // record is human-attested today, and a machine-origin claim always still requires human attestation.
    const humanAttested = false;
    const machineOrigin = record.method === 'machine-generated' || record.verificationStatus === 'machine-proposed';
    return {
      cryptographicallyValid: true,
      humanAttested,
      requiresHumanAttestation: machineOrigin,
      issuer,
      verificationMethod,
      recordDigest: canonicalDigest(credential),
      payloadDigest: record.payloadDigest,
      claim: {
        author: record.author,
        method: record.method,
        verificationStatus: record.verificationStatus,
        ...record.attester === undefined ? {} : { issuerProposedAttester: record.attester },
      },
      caveat: VALIDITY_NOT_TRUTH_CAVEAT,
    };
  }
}
