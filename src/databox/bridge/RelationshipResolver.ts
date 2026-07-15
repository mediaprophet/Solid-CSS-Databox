import { createHmac, randomBytes } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { InstitutionalKey, RelationshipRecord } from '../provisioning/ProvisioningTypes';
import type { RelationshipMappingRegistry } from '../provisioning/RelationshipMappingRegistry';

/**
 * Resolve a typed institutional key to its opaque relationship/box **only** through the protected mapping
 * registry (component C11; ADR-0016 HD-10). This is the single seam a bridge uses to translate the
 * institutional key-space into the opaque Databox key-space: the raw `customerId` enters here, is used ONLY
 * to derive the protected lookup key, and NEVER leaves (the returned {@link RelationshipRecord} carries no
 * PII). A bridge that cannot resolve an active mapping MUST fail closed — it never guesses a box (invariant
 * 2, ADR-0016 §Failure behavior).
 */
export interface RelationshipResolver {
  /**
   * Resolve the active relationship for a typed institutional key, or `undefined` when no mapping exists
   * (an unresolved event is quarantined for review, never deposited into a guessed box). Fails closed on a
   * malformed key.
   */
  resolve: (key: InstitutionalKey) => Promise<RelationshipRecord | undefined>;
}

/** Injectable seams for {@link KeyedHmacRelationshipResolver}; defaulted to a CSPRNG secret. */
export interface RelationshipResolverOptions {
  /**
   * Mints a per-program idempotency-HMAC secret (default: 256-bit `randomBytes`). This MUST be the SAME
   * per-program secret the {@link ../provisioning/DataboxProvisioner} was constructed with, so the resolver
   * derives the identical relationship idempotency key the mapping is stored under.
   */
  readonly secretFactory?: () => Buffer;
}

const SECRET_BYTES = 32;

/**
 * The reference {@link RelationshipResolver} over the protected mapping registry. It derives the relationship
 * idempotency key **identically** to {@link ../provisioning/DataboxProvisioner} — a per-program keyed HMAC of
 * the namespaced institutional tuple `organisation/program/source-system/customerId-namespace/customerId` —
 * and looks the relationship up via {@link RelationshipMappingRegistry.findByIdempotencyKey}. Because the
 * program is mixed into both the per-program secret and the HMAC message, the same `customerId` in two
 * programs resolves to unrelated relationships (cross-tenant collision structurally impossible), and the
 * resolver only ever sees the opaque relationship record — never another program's mapping.
 */
export class KeyedHmacRelationshipResolver implements RelationshipResolver {
  private readonly registry: RelationshipMappingRegistry;
  private readonly secretFactory: () => Buffer;
  private readonly secrets = new Map<string, Buffer>();

  public constructor(registry: RelationshipMappingRegistry, options: RelationshipResolverOptions = {}) {
    this.registry = registry;
    this.secretFactory = options.secretFactory ?? ((): Buffer => randomBytes(SECRET_BYTES));
  }

  public async resolve(key: InstitutionalKey): Promise<RelationshipRecord | undefined> {
    this.validateKey(key);
    return this.registry.findByIdempotencyKey(this.idempotencyKey(key));
  }

  /**
   * The relationship idempotency key: a per-program keyed HMAC of the namespaced institutional tuple. This
   * MUST match {@link ../provisioning/DataboxProvisioner} byte-for-byte, or the mapping will not resolve.
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
}
