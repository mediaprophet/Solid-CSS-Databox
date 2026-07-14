/**
 * Shared value types for the Databox provisioning / relationship-mapping model (components C10 + C11,
 * DBX-04 §6; ADR-0002 §3; ADR-0016; DBX-10). Pure types — no runtime code — so the control-plane
 * boundary shapes are stated once and cannot drift between the mapping registry and the provisioner.
 *
 * The cardinal privacy rule of ADR-0016 is expressed structurally here: an {@link InstitutionalKey}
 * carries the raw `customerId`, but **no type that is emitted toward the data plane**
 * ({@link RelationshipRecord}, {@link DataboxDescriptor}, {@link ProvisionResult}) has a field that can
 * hold it. The raw key stays inside the registry (invariant 2 / ADR-0016).
 */

/**
 * Lifecycle status of a program relationship (ADR-0016). A relationship is `active` once provisioned and
 * `suspended` when the control plane revokes it; it is never deleted (identifiers are never reassigned).
 */
export type RelationshipStatus = 'active' | 'suspended';

/**
 * The **typed institutional key** (ADR-0016 §Decision, HD-09): the fully-qualified coordinate of one
 * customer within one program's source system. This is control-plane input only.
 *
 * `customerId` is the raw internal primary key of the source system and is **PII**. It is used solely to
 * derive the (protected, keyed) idempotency key and is stored only inside the mapping registry. It MUST
 * NEVER appear in a box identifier, resource path, credential, notification, log line or any
 * {@link ProvisionResult} (invariant 2, ADR-0016 §Decision).
 */
export interface InstitutionalKey {
  /** Opaque accountable-organisation identifier (the tenant principal, ADR-0004). */
  readonly organisation: string;
  /** Opaque program identifier within the organisation. */
  readonly program: string;
  /** Opaque source-system identifier the customer record originates from. */
  readonly sourceSystem: string;
  /** The namespace the raw `customerId` is unique within (e.g. `crm`, `loyalty`). */
  readonly customerIdNamespace: string;
  /** RAW internal customer reference — PII. Never emitted; registry-internal only. */
  readonly customerId: string;
}

/**
 * A program-scoped ODRL policy reference bound to a record/submission class at provisioning time
 * (ADR-0013/0014). Carries only class + versioned-template coordinates resolved from the validated
 * profile — never consumer data.
 */
export interface PolicyRef {
  /** The record- or submission-class id this policy governs. */
  readonly classId: string;
  /** The {@link PolicyTemplate.id} resolved from the profile. */
  readonly policyTemplate: string;
  /** The versioned policy identity (ADR-0014 first-class version). */
  readonly policyVersion: string;
  /** The ODRL profile URI the template conforms to. */
  readonly odrlProfile: string;
}

/**
 * The container/metadata descriptor for a provisioned Databox (DBX-04 §6 resource layout; ADR-0002 §3).
 * Every path here is derived from the opaque box root and program schema labels — no consumer PII.
 */
export interface DataboxDescriptor {
  /** The opaque box identifier (>= 128-bit CSPRNG token). */
  readonly boxId: string;
  /** The opaque box root path (`{base}/{boxId}/`). */
  readonly root: string;
  /** The sub-container paths to create under {@link root} (records/submissions/receipts/...). */
  readonly containers: readonly string[];
  /** Provisioning metadata — program-scoped, PII-free. */
  readonly metadata: DataboxMetadata;
}

/**
 * PII-free provisioning metadata retained on a {@link DataboxDescriptor}.
 */
export interface DataboxMetadata {
  readonly organisation: string;
  readonly program: string;
  readonly provisionedAt: string;
}

/**
 * The protected relationship record (component C11 authoritative state, DBX-04 §6). It links the opaque
 * relationship, the opaque box and the pairwise WebID (ADR-0004). It deliberately holds **no**
 * `customerId`: the raw key is stored separately inside the registry, keyed by relationship id, and is
 * reachable only through the control-plane {@link RelationshipMappingRegistry.resolveCustomer} path.
 */
export interface RelationshipRecord {
  /** Opaque relationship identifier (>= 128-bit CSPRNG token). */
  readonly relationshipId: string;
  /** Opaque box identifier (>= 128-bit CSPRNG token). */
  readonly boxId: string;
  /** The opaque box root path. */
  readonly boxRoot: string;
  /** The vault-controlled pairwise HTTPS WebID for this relationship (ADR-0004). */
  readonly pairwiseWebId: string;
  /** Opaque accountable-organisation identifier (tenant scoping). */
  readonly organisation: string;
  /** Opaque program identifier (tenant scoping). */
  readonly program: string;
  /** Opaque source-system identifier. */
  readonly sourceSystem: string;
  /** Lifecycle status. */
  readonly status: RelationshipStatus;
  /** ISO-8601 provisioning instant. */
  readonly provisionedAt: string;
}

/**
 * The result of an (idempotent) provisioning call (IF-15). `reused` is true when an authorized
 * re-provisioning of the same relationship returned the already-assigned box rather than minting a new
 * one (ADR-0016 idempotency; T-24).
 */
export interface ProvisionResult {
  readonly relationship: RelationshipRecord;
  readonly databox: DataboxDescriptor;
  readonly policyRefs: readonly PolicyRef[];
  readonly reused: boolean;
}
