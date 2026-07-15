import { createHmac, randomBytes } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { InternalServerError } from '../../util/errors/InternalServerError';
import { ensureTrailingSlash } from '../../util/PathUtil';
import type { OpaqueIdentifierGenerator } from '../identifiers/OpaqueIdentifierGenerator';
import type { InstitutionProfile } from '../profile/InstitutionProfile';
import { loadInstitutionProfile } from '../profile/InstitutionProfileValidator';
import type { RelationshipMappingRegistry } from './RelationshipMappingRegistry';
import type {
  DataboxDescriptor,
  InstitutionalKey,
  PolicyRef,
  ProvisionResult,
  RelationshipRecord,
} from './ProvisioningTypes';

/**
 * Injectable seams for {@link DataboxProvisioner}, defaulted to CSPRNG/clock primitives. Exposed for
 * deterministic testing only; production leaves them defaulted.
 */
export interface DataboxProvisionerOptions {
  /** Mints the opaque relationship identifier (default: 128-bit `randomBytes` hex). */
  readonly relationshipIdFactory?: () => string;
  /** Mints a per-program idempotency-HMAC secret (default: 256-bit `randomBytes`). */
  readonly secretFactory?: () => Buffer;
  /** Supplies the provisioning timestamp (default: `Date.now` as ISO-8601). */
  readonly clock?: () => string;
}

/** 32 bytes = 256-bit HMAC secret; 16 bytes = 128-bit relationship token. */
const RELATIONSHIP_ID_BYTES = 16;
const SECRET_BYTES = 32;

/**
 * Idempotent Databox provisioner (component C10 provisioning service, DBX-04 §6 / IF-15; ADR-0002 §3;
 * ADR-0016). It turns a validated {@link InstitutionProfile} plus a typed {@link InstitutionalKey} into a
 * provisioned Databox: opaque box identifier, container/metadata descriptor, program-scoped ODRL policy
 * references, and a protected relationship record — created idempotently.
 *
 * Security properties enforced here:
 * - **Fails closed on bad input:** the profile is loaded through {@link loadInstitutionProfile} (rejects an
 *   invalid profile) and the institutional key + pairwise WebID are validated; anything malformed throws a
 *   {@link BadRequestHttpError} and provisions nothing.
 * - **Relationship-level idempotency (T-24, ADR-0016 HD-12):** the idempotency key is a **tenant-keyed
 *   HMAC** of the namespaced tuple `organisation/program/source-system/namespace/customerId` — stable
 *   across retries, so repeated authorized provisioning of the same relationship returns the *same* opaque
 *   box, never a fresh identifier per attempt.
 * - **Cross-program isolation (T-01/T-54):** each program has its own HMAC secret *and* the program is part
 *   of the HMAC message, so the same `customerId` in two programs yields unrelated idempotency keys and
 *   unrelated boxes — a cross-tenant collision is structurally impossible.
 * - **No PII in identifiers (invariant 2, ADR-0004):** the box identifier comes from the CSPRNG
 *   {@link OpaqueIdentifierGenerator} (which cannot see the `name`/customer reference); the raw `customerId`
 *   is handed only to the protected registry, never into a path, descriptor or result.
 */
export class DataboxProvisioner {
  private readonly boxIdentifierGenerator: OpaqueIdentifierGenerator;
  private readonly registry: RelationshipMappingRegistry;
  private readonly relationshipIdFactory: () => string;
  private readonly secretFactory: () => Buffer;
  private readonly clock: () => string;
  private readonly secrets = new Map<string, Buffer>();

  public constructor(
    boxIdentifierGenerator: OpaqueIdentifierGenerator,
    registry: RelationshipMappingRegistry,
    options: DataboxProvisionerOptions = {},
  ) {
    this.boxIdentifierGenerator = boxIdentifierGenerator;
    this.registry = registry;
    this.relationshipIdFactory = options.relationshipIdFactory ??
      ((): string => randomBytes(RELATIONSHIP_ID_BYTES).toString('hex'));
    this.secretFactory = options.secretFactory ?? ((): Buffer => randomBytes(SECRET_BYTES));
    this.clock = options.clock ?? ((): string => new Date().toISOString());
  }

  /**
   * Provision (or idempotently resolve) the Databox for one relationship.
   *
   * @param profileInput - The untrusted institution/program profile; loaded + validated (fails closed).
   * @param key - The typed institutional key (control-plane input; carries the raw `customerId`).
   * @param pairwiseWebId - The vault-controlled pairwise HTTPS WebID for this relationship (ADR-0004).
   *
   * @returns The relationship record, box descriptor, policy references and whether the box was reused.
   */
  public async provision(
    profileInput: unknown,
    key: InstitutionalKey,
    pairwiseWebId: string,
  ): Promise<ProvisionResult> {
    const profile = loadInstitutionProfile(profileInput);
    this.validateKey(key);
    this.validateWebId(pairwiseWebId);

    const idempotencyKey = this.idempotencyKey(key);

    // Mint a candidate box up-front; the registry is the single atomic idempotency authority, so on a
    // re-provision the candidate is simply discarded (never stored → never "reassigned"). The empty
    // argument satisfies the IdentifierGenerator contract and is ignored by an OpaqueIdentifierGenerator
    // (the identifier is CSPRNG, never name-derived — invariant 2).
    const boxRoot = this.boxIdentifierGenerator.generate('').path;
    const candidate: RelationshipRecord = {
      relationshipId: this.relationshipIdFactory(),
      boxId: boxIdFromRoot(boxRoot),
      boxRoot,
      pairwiseWebId,
      organisation: key.organisation,
      program: key.program,
      sourceSystem: key.sourceSystem,
      status: 'active',
      provisionedAt: this.clock(),
    };

    const record = await this.registry.register({ idempotencyKey, record: candidate, customer: key });
    const reused = record !== candidate;

    return {
      relationship: record,
      databox: this.describe(profile, record),
      policyRefs: buildPolicyRefs(profile),
      reused,
    };
  }

  /**
   * The relationship idempotency key: a per-program keyed HMAC of the namespaced institutional tuple
   * (ADR-0016 HD-12 external representation; ADR-0004 keyed-HMAC rule). Deterministic for a given key +
   * program secret, so retries collapse onto one box; opaque and non-reversible, so it never leaks the
   * internal customer reference even if the store is read.
   */
  private idempotencyKey(key: InstitutionalKey): string {
    const secret = this.programSecret(key.organisation, key.program);
    const tuple = [ key.organisation, key.program, key.sourceSystem, key.customerIdNamespace, key.customerId ]
      .map((part): string => encodeURIComponent(part))
      .join('/');
    return createHmac('sha256', secret).update(tuple).digest('hex');
  }

  private programSecret(organisation: string, program: string): Buffer {
    const programKey = `${encodeURIComponent(organisation)}/${encodeURIComponent(program)}`;
    let secret = this.secrets.get(programKey);
    if (!secret) {
      secret = this.secretFactory();
      this.secrets.set(programKey, secret);
    }
    return secret;
  }

  private validateKey(key: InstitutionalKey): void {
    const parts: (keyof InstitutionalKey)[] =
      [ 'organisation', 'program', 'sourceSystem', 'customerIdNamespace', 'customerId' ];
    for (const part of parts) {
      const value = key[part];
      if (typeof value !== 'string' || value.length === 0) {
        throw new BadRequestHttpError(`Institutional key field '${part}' must be a non-empty string (fail closed).`);
      }
    }
  }

  private validateWebId(pairwiseWebId: string): void {
    try {
      const parsed = new URL(pairwiseWebId);
      const loopback = parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1');
      if (parsed.protocol !== 'https:' && !loopback) {
        throw new Error('not secure');
      }
    } catch {
      throw new BadRequestHttpError(
        'Pairwise WebID must be an absolute HTTPS URL or HTTP loopback URL (fail closed).',
      );
    }
  }

  /**
   * Build the container/metadata descriptor for a box from the validated profile. Every path is derived
   * from the opaque box root and the program's own class labels — no consumer data enters here.
   */
  private describe(profile: InstitutionProfile, record: RelationshipRecord): DataboxDescriptor {
    const { boxRoot } = record;
    const containers: string[] = [
      `${boxRoot}records/`,
      `${boxRoot}submissions/`,
      `${boxRoot}receipts/`,
      `${boxRoot}dispositions/`,
      `${boxRoot}record-index/`,
      `${boxRoot}audit-view/`,
    ];
    for (const recordClass of profile.recordClasses) {
      containers.push(`${boxRoot}records/${encodeURIComponent(recordClass.id)}/`);
    }
    for (const submissionClass of profile.submissionClasses) {
      containers.push(`${boxRoot}submissions/${encodeURIComponent(submissionClass.id)}/`);
    }
    return {
      boxId: record.boxId,
      root: boxRoot,
      containers,
      metadata: {
        organisation: record.organisation,
        program: record.program,
        provisionedAt: record.provisionedAt,
      },
    };
  }
}

/**
 * Derive the opaque box-id token from a box root path (`{base}/{boxId}/`). The token is the final
 * non-empty path segment.
 */
export function boxIdFromRoot(boxRoot: string): string {
  const segments = ensureTrailingSlash(boxRoot).split('/').filter((segment): boolean => segment.length > 0);
  const boxId = segments.at(-1);
  if (boxId === undefined) {
    throw new InternalServerError(`Opaque box root ${boxRoot} has no box segment.`);
  }
  return boxId;
}

/**
 * Build the program-scoped ODRL policy references from a validated profile: one per record and submission
 * class, resolved to its versioned template (the profile validator guarantees each template resolves).
 */
export function buildPolicyRefs(profile: InstitutionProfile): PolicyRef[] {
  const templates = new Map(profile.policies.templates.map((template): [string, typeof template] =>
    [ template.id, template ]));
  const refs: PolicyRef[] = [];
  const classes = [
    ...profile.recordClasses.map((recordClass): { id: string; policyTemplate: string } => recordClass),
    ...profile.submissionClasses.map((submissionClass): { id: string; policyTemplate: string } => submissionClass),
  ];
  for (const klass of classes) {
    const template = templates.get(klass.policyTemplate)!;
    refs.push({
      classId: klass.id,
      policyTemplate: template.id,
      policyVersion: template.version,
      odrlProfile: template.odrlProfile,
    });
  }
  return refs;
}
