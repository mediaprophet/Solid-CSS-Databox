import type { RecordVerification } from '../proof/RecordProofValidator';

/**
 * The **inert-data** ingestion contract for a retrieved record (threat T-51; ADR-0026 consumer agent;
 * dbx-04 §7.2 submission trace). A record deposited into the consumer's box — or recovered off the cursor
 * feed — is treated as **pure data**, never as a program: the consumer agent MUST NOT auto-dereference any
 * link the record carries, MUST NOT auto-submit on the strength of any directive inside it, and MUST NOT
 * execute anything the record names. A deposited record that says "fetch https://…" or "submit these
 * fields" is exactly the T-51 attack; honouring it would let a depositor drive the consumer's agent.
 *
 * The guarantee here is **structural, not conventional**: {@link toInertRecord} is a pure transform with no
 * transport, resolver, fetcher or endpoint in scope, so it *cannot* perform I/O however hostile the record
 * content is. It deep-copies the payload into an opaque, frozen value and copies only the already-verified
 * valid-vs-true claim descriptors (from {@link RecordVerification}) — it never walks the payload looking for
 * links or directives to act on. Whatever links/directives the payload contains are retained verbatim as
 * inert bytes for a human to inspect later; the agent itself does nothing with them.
 */

/**
 * A retrieved record reduced to inert, opaque data with its provenance. The `payload` is a private copy of
 * the exact verified bytes (kept so an independent re-verification can reproduce the digest); nothing in
 * this structure is ever interpreted as an instruction.
 */
export interface InertRecord {
  /** The connection this record was retrieved through (isolation: never shared across connections). */
  readonly connectionId: string;
  /** The canonical digest of the whole record credential (from the verified proof). */
  readonly recordDigest: string;
  /** The exact accepted-payload digest bound in the record. */
  readonly payloadDigest: string;
  /** The verifying issuer + verification method (provenance of the signature). */
  readonly issuer: string;
  readonly verificationMethod: string;
  /** The valid-vs-true claim descriptors, copied verbatim from the verified record (never upgraded). */
  readonly claim: RecordVerification['claim'];
  /** True when the record still needs an independent human attestation before it may be treated as true. */
  readonly requiresHumanAttestation: boolean;
  /** An opaque provenance label for how this copy was obtained (e.g. `authenticated-pull`). */
  readonly provenance: string;
  /** ISO instant the inert copy was taken. */
  readonly retrievedAt: string;
  /** The exact verified payload bytes/string — an opaque copy, NEVER dereferenced or executed (T-51). */
  readonly payload: Buffer | string;
}

/**
 * Take a private copy of the exact payload bytes so mutation of the source (on the way in) or of a handed-out
 * reference (on the way out) cannot alter the retained evidence (T-46 integrity). A string is already
 * immutable; a `Buffer`'s bytes are not, so it is duplicated. Exported so the knowledge store copies on every
 * boundary crossing too.
 */
export function copyPayload(payload: Buffer | string): Buffer | string {
  return Buffer.isBuffer(payload) ? Buffer.from(payload) : payload;
}

/**
 * Reduce a verified record + its exact payload to an {@link InertRecord}. This transform is deliberately
 * side-effect-free and dependency-free: it holds no fetcher/endpoint, so it can never turn a link or a
 * directive inside `payload` into an outbound request or a submission (T-51). The result is frozen.
 *
 * @param connectionId - The connection the record was retrieved through.
 * @param verification - The already-verified record proof (validity established BEFORE ingestion).
 * @param payload - The exact accepted payload whose digest the verification matched.
 * @param provenance - An opaque provenance label recorded on the copy.
 * @param retrievedAt - ISO instant the copy was taken.
 */
export function toInertRecord(
  connectionId: string,
  verification: RecordVerification,
  payload: Buffer | string,
  provenance: string,
  retrievedAt: string,
): InertRecord {
  return Object.freeze<InertRecord>({
    connectionId,
    recordDigest: verification.recordDigest,
    payloadDigest: verification.payloadDigest,
    issuer: verification.issuer,
    verificationMethod: verification.verificationMethod,
    // Deep-copy + freeze the claim descriptors (all primitives) so mutating the source RecordVerification
    // cannot mutate the retained inert copy, and a handed-out reference cannot be widened (L2).
    claim: Object.freeze({ ...verification.claim }),
    requiresHumanAttestation: verification.requiresHumanAttestation,
    provenance,
    retrievedAt,
    payload: copyPayload(payload),
  });
}
