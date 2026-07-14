import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';
import { AsyncHandler } from '../../util/handlers/AsyncHandler';

/**
 * The resolved, validated program tenant for a single request (component C5, DBX-04 §2/§6).
 *
 * Tenant identity is resolved and validated *before* authorization (DBX-04 §9.1, closes T-01/T-54)
 * and is then carried immutably into the operation. CSS 7.1.9 has no tenant/multi-realm concept
 * (DBX-01 §5), so this is net-new.
 */
export interface TenantContext {
  /**
   * Opaque, stable tenant/program identifier. Never a raw customer or PII value.
   */
  readonly tenantId: string;
  /**
   * The origin/host the request arrived on, retained for audit of the resolution.
   */
  readonly origin?: string;
  /**
   * The token audience the tenant was validated against, when applicable.
   */
  readonly audience?: string;
}

/**
 * Input to a {@link TenantResolver}: the request-identifying facts used to resolve a tenant.
 */
export interface TenantResolverInput {
  /**
   * The request origin / host authority.
   */
  readonly origin?: string;
  /**
   * The audience the presented token was bound to.
   */
  readonly audience?: string;
}

/**
 * Resolves and validates the program tenant for a request before authorization runs (C5).
 * Fails closed: an unresolved or mismatched tenant must deny (403, no existence leak) rather
 * than fall through to a default tenant (DBX-04 §8, T-01/T-54). Built by DBX-11.
 */
export abstract class TenantResolver extends AsyncHandler<TenantResolverInput, TenantContext> {}

/**
 * Fail-closed placeholder for {@link TenantResolver}.
 *
 * No tenant policy is configured yet (DBX-11), so this stub resolves *no* tenant: it throws
 * {@link NotImplementedHttpError} instead of inventing a default tenant. Inventing one would let a
 * request cross a tenant wall, so refusing is the only safe behavior.
 */
export class NotImplementedTenantResolver extends TenantResolver {
  public async handle(): Promise<TenantContext> {
    throw new NotImplementedHttpError('Databox tenant resolver (C5) is not implemented (DBX-11).');
  }
}
