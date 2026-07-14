import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { InternalServerError } from '../../util/errors/InternalServerError';
import type { TenantScope } from './TenantContext';
import { tenantIdOf } from './TenantContext';

/**
 * The program-bound transport/identity facts for one tenant (ADR-0002 §Decision; ADR-0016 HD-13).
 *
 * ADR-0002 requires that token audiences, browser origins and client/service registrations are
 * *program-bound*: a value registered for program A MUST NOT be honoured for program B. This descriptor
 * is the authoritative binding of those facts to a single tenant, plus the tenant's storage namespace
 * (the box-root prefix its resources must live under). It carries no consumer PII.
 */
export interface TenantBinding extends TenantScope {
  /** The origins/hosts bound to this program (distinct origin or subdomain, ADR-0002). */
  readonly origins: readonly string[];
  /** The token audiences bound to this program (each = exactly one storage realm, ADR-0009). */
  readonly audiences: readonly string[];
  /** The per-program bridge service identities (least-privilege, one program each, ADR-0016 HD-13). */
  readonly serviceIdentities: readonly string[];
  /** The storage-namespace prefix every box root of this tenant lives under (ADR-0002 §3.2). */
  readonly storageNamespace: string;
}

/**
 * The authoritative registry of per-program tenant bindings (component C5 configuration, DBX-11).
 *
 * It answers, for each program-bound fact, "which single tenant owns it?". The cardinal invariant is
 * enforced structurally at registration: no origin, audience or service identity may be bound to more
 * than one tenant, so **no platform-wide data-plane credential can exist** (T-31) — an attempt to
 * register a cross-tenant fact fails closed. Lookups never reveal anything for an unknown value
 * (enumeration fails safely).
 */
export interface TenantBindingRegistry {
  /**
   * Register a tenant's program-bound facts. Fails closed if any origin/audience/service identity is
   * already bound to a *different* tenant (no cross-tenant/platform-wide credential, T-31), if the
   * tenant is already registered, or if any field is empty.
   */
  register: (binding: TenantBinding) => void;
  /** The binding for a tenant scope, or `undefined` if none is configured (fail closed at the caller). */
  findByTenant: (organisation: string, program: string) => TenantBinding | undefined;
  /** The single tenant an origin is bound to, or `undefined` (no leak for an unknown origin). */
  findByOrigin: (origin: string) => TenantBinding | undefined;
  /** The single tenant an audience is bound to, or `undefined` (no leak for an unknown audience). */
  findByAudience: (audience: string) => TenantBinding | undefined;
  /** The single tenant a service identity is bound to, or `undefined` (absence proof for T-31). */
  findByServiceIdentity: (serviceIdentity: string) => TenantBinding | undefined;
}

/**
 * In-memory reference implementation of {@link TenantBindingRegistry}. Program-bound facts are process-
 * local configuration; a production deployment swaps in a durable, access-audited store behind the same
 * interface without changing the invariant. Four indexes (by tenant, origin, audience, service identity)
 * each resolve in one hop; every reverse index maps a fact to exactly one tenant.
 */
export class InMemoryTenantBindingRegistry implements TenantBindingRegistry {
  private readonly byTenant = new Map<string, TenantBinding>();
  private readonly byOrigin = new Map<string, TenantBinding>();
  private readonly byAudience = new Map<string, TenantBinding>();
  private readonly byServiceIdentity = new Map<string, TenantBinding>();

  public register(binding: TenantBinding): void {
    this.assertNonEmpty('organisation', binding.organisation);
    this.assertNonEmpty('program', binding.program);
    this.assertNonEmpty('storageNamespace', binding.storageNamespace);

    const tenantId = tenantIdOf(binding.organisation, binding.program);
    if (this.byTenant.has(tenantId)) {
      // Tenants are registered once; a re-registration could silently widen an existing binding.
      throw new InternalServerError(`Tenant ${tenantId} is already registered; refusing to re-bind.`);
    }

    // No fact may be shared across tenants: that is exactly the platform-wide credential T-31 forbids.
    this.assertExclusive('origin', binding.origins, this.byOrigin, tenantId);
    this.assertExclusive('audience', binding.audiences, this.byAudience, tenantId);
    this.assertExclusive('service identity', binding.serviceIdentities, this.byServiceIdentity, tenantId);

    this.byTenant.set(tenantId, binding);
    for (const origin of binding.origins) {
      this.byOrigin.set(origin, binding);
    }
    for (const audience of binding.audiences) {
      this.byAudience.set(audience, binding);
    }
    for (const serviceIdentity of binding.serviceIdentities) {
      this.byServiceIdentity.set(serviceIdentity, binding);
    }
  }

  public findByTenant(organisation: string, program: string): TenantBinding | undefined {
    return this.byTenant.get(tenantIdOf(organisation, program));
  }

  public findByOrigin(origin: string): TenantBinding | undefined {
    return this.byOrigin.get(origin);
  }

  public findByAudience(audience: string): TenantBinding | undefined {
    return this.byAudience.get(audience);
  }

  public findByServiceIdentity(serviceIdentity: string): TenantBinding | undefined {
    return this.byServiceIdentity.get(serviceIdentity);
  }

  private assertNonEmpty(field: string, value: string): void {
    if (value.length === 0) {
      throw new BadRequestHttpError(`Tenant binding ${field} must be a non-empty string.`);
    }
  }

  /**
   * Refuse to bind any of `values` when one is already bound to a different tenant. This is the
   * structural denial of a platform-wide/cross-tenant credential (T-31): a fact can name only one tenant.
   */
  private assertExclusive(
    kind: string,
    values: readonly string[],
    index: Map<string, TenantBinding>,
    tenantId: string,
  ): void {
    for (const value of values) {
      this.assertNonEmpty(kind, value);
      const holder = index.get(value);
      if (holder && tenantIdOf(holder.organisation, holder.program) !== tenantId) {
        throw new InternalServerError(
          `${kind} is already bound to another tenant; a cross-tenant/platform-wide binding is refused (T-31).`,
        );
      }
    }
  }
}
