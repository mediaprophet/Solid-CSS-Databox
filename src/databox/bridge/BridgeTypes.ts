import type { PublicJwk } from '../credential/ConnectionCredentialTypes';
import type { InstitutionalSignatureClaim, PolicyRefClaim } from '../gateway/GatewayTypes';

/**
 * Pure value types for the synthetic institutional bridge (component C21, DBX-04 §7.1 deposit trace; DBX-22;
 * ADR-0016 institutional integration plane, ADR-0017 bridge deposit boundary). No runtime logic lives here so
 * the source-outbox event, the program service identity, the signed institutional record and the
 * source→Databox reconciliation shapes are stated exactly once and cannot drift between the outbox, the
 * relationship resolver, the record builder and the {@link ../bridge/DataboxBridge}.
 *
 * The cardinal privacy rule of ADR-0016 is structural here: a {@link SourceEvent} carries the raw
 * `customerId` (control-plane PII, used ONLY to resolve the protected mapping), but **no type that a bridge
 * emits toward the data plane** ({@link InstitutionalRecord}, {@link BridgeReconciliation}) has a field that
 * can hold it — the raw key never enters a Databox URI, record, receipt or notification (invariant 2).
 */

/**
 * The program-specific service identity a bridge authenticates as (ADR-0016 HD-13; HD-02). A human operator,
 * the accountable organisation and the software service are NEVER the same identifier: `programPrincipal` is
 * the accountable organisation principal, `serviceIdentity` is the bridge's own distinct service WebID, and
 * `issuer` is the trusted institutional signer presented on the deposit signature. Each bridge appends ONLY
 * to its own program's containers and has no cross-program role.
 */
export interface ProgramServiceIdentity {
  /** Opaque accountable-organisation identifier (tenant scoping, ADR-0004). */
  readonly organisation: string;
  /** Opaque program identifier within the organisation (tenant scoping). */
  readonly program: string;
  /** The accountable organisation principal recorded as record provenance (HD-02; never a human/service id). */
  readonly programPrincipal: string;
  /** The bridge's own software service identity (a distinct service WebID, HD-02) — the software actor. */
  readonly serviceIdentity: string;
  /** The trusted institutional signer identifier presented on the deposit signature (ADR-0016). */
  readonly issuer: string;
}

/**
 * A synthetic business event a source system commits together with its source-outbox row (HD-12: the
 * business event + outbox entry are committed in the same transaction; the bridge drains the outbox). The
 * first five fields are the **namespaced idempotency tuple** — stable across retries, NOT minted per attempt
 * (T-24). `customerIdNamespace`/`customerId` are the typed institutional key used ONLY to resolve the
 * protected mapping; the raw `customerId` is PII and is never emitted toward the data plane.
 */
export interface SourceEvent {
  /** Opaque accountable-organisation identifier (idempotency tuple + tenant scoping). */
  readonly organisation: string;
  /** Opaque program identifier (idempotency tuple + tenant scoping). */
  readonly program: string;
  /** Opaque source-system identifier the record originates from (idempotency tuple). */
  readonly sourceSystem: string;
  /** The event type (idempotency tuple), e.g. `receipt`, `recall`, `service-notice`. */
  readonly eventType: string;
  /** The stable source-event id (idempotency tuple) — a retry reuses the SAME id (T-24). */
  readonly sourceEventId: string;
  /** The namespace the raw `customerId` is unique within (typed institutional key, HD-09). */
  readonly customerIdNamespace: string;
  /** RAW internal customer reference — PII. Used ONLY to resolve the mapping; never emitted. */
  readonly customerId: string;
  /** The record class this event deposits into (must be declared in the program profile). */
  readonly recordClass: string;
  /** The legal basis (must be the class's declared basis in the profile). */
  readonly legalBasis: string;
  /** The declared processing purpose (must be permitted for the class). */
  readonly purpose: string;
  /** The synthetic business payload deposited as the record body (PII-free in these fixtures). */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Optional supersession pointer: the earlier record this event supersedes (recall update, ADR-0018). */
  readonly supersedes?: { readonly sourceEventId: string; readonly resource: string };
}

/** The provenance block bound into a signed institutional record: WHO produced it (HD-02 separation). */
export interface InstitutionalRecordProvenance {
  /** The accountable organisation principal the record is attributed to. */
  readonly programPrincipal: string;
  /** The software service (bridge) that actually produced the record — distinct from the principal. */
  readonly softwareActor: string;
  /** ISO-8601 instant the bridge signed the record. */
  readonly signedAt: string;
}

/**
 * The canonical institutional record envelope a bridge deposits (reuses the DBX-08 fixture record shape:
 * synthetic flag, record class, opaque relationship/box, resolved policy ref, provenance, optional
 * supersession, and the synthetic payload). Every identifier here is opaque — the raw `customerId` never
 * appears (invariant 2).
 */
export interface InstitutionalRecord {
  /** Marks this as synthetic data (never a real retailer/customer record). */
  readonly syntheticFixture: true;
  /** The deposited record class. */
  readonly recordClass: string;
  /** The opaque program identifier. */
  readonly program: string;
  /** The opaque source-system identifier. */
  readonly sourceSystem: string;
  /** The opaque relationship the record belongs to. */
  readonly relationshipId: string;
  /** The opaque box identifier. */
  readonly box: string;
  /** The assigned (opaque) record resource URI. */
  readonly resource: string;
  /** The resolved versioned policy reference governing the class (ADR-0014). */
  readonly policyRef: PolicyRefClaim;
  /** The record provenance (software actor + program principal, HD-02). */
  readonly provenance: InstitutionalRecordProvenance;
  /** The opaque resource this record supersedes (recall update), or `null` when it supersedes nothing. */
  readonly supersedes: string | null;
  /** The synthetic business payload. */
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * A built + signed institutional record ready to deposit: the envelope, the EXACT body bytes (never
 * re-encoded), the payload digest (bare hex), the institutional signature and the addressed container target.
 */
export interface SignedInstitutionalRecord {
  /** The canonical record envelope. */
  readonly record: InstitutionalRecord;
  /** The EXACT deposited bytes (`JSON.stringify` of {@link record}) — the gateway digests these unchanged. */
  readonly body: Buffer;
  /** The declared media type of the deposited body. */
  readonly mediaType: string;
  /** SHA-256 (hex) of the exact body bytes — bound by the signature and echoed to the receipt. */
  readonly payloadDigest: string;
  /** The institutional ES256 signature (issuer + compact JWS over the payload digest, ADR-0016). */
  readonly signature: InstitutionalSignatureClaim;
  /** The addressed `records/<class>/` container the deposit POSTs to. */
  readonly target: string;
}

/** The trusted institutional signer key a bridge presents to the gateway (its own program key). */
export interface BridgeIssuerKey {
  readonly issuer: string;
  readonly publicKey: PublicJwk;
}

/** The disposition of one source event after a bridge drain attempt. */
export type ReconciliationStatus = 'reconciled' | 'unresolved' | 'failed';

/**
 * The source→Databox reconciliation record for one source event (DBX-04 §7.1 reconciliation). It is the
 * bridge's observable, recoverable state: `reconciled` is terminal (a receipt was retained); `unresolved`
 * (no active mapping — quarantined for review) and `failed` (a transient/permanent deposit failure) both
 * leave the outbox row PENDING so a later drain resumes it (fail closed + recoverable). Every field is
 * opaque — no raw `customerId` (invariant 2).
 */
export interface BridgeReconciliation {
  /** The stable source-event id this reconciliation concerns. */
  readonly sourceEventId: string;
  /** The disposition of the deposit attempt. */
  readonly status: ReconciliationStatus;
  /** The opaque relationship the record was deposited into (present when reconciled). */
  readonly relationshipId?: string;
  /** The assigned opaque record resource URI (present when reconciled). */
  readonly acceptedResource?: string;
  /** The protected (keyed-HMAC) idempotency key the acceptance echoes (present when reconciled). */
  readonly idempotencyKey?: string;
  /** The retained acceptance-receipt id (present when reconciled). */
  readonly receiptId?: string;
  /** The `urn:sha256:<hex>` payload digest the receipt binds (present when reconciled). */
  readonly payloadDigest?: string;
  /** A non-leaking reason token (present when NOT reconciled) — safe for an audit ledger (T-23). */
  readonly reason?: string;
  /** ISO-8601 instant the reconciliation was recorded. */
  readonly at: string;
}
