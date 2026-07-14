import { getLoggerFor } from '../../logging/LogUtil';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import type { RelationshipMappingRegistry } from '../provisioning/RelationshipMappingRegistry';
import type { TenantContext } from './TenantContext';
import { sameTenant } from './TenantContext';

/**
 * The single non-leaking denial the tenant plane emits. Existence-hiding (ADR-0002 §Consequences:
 * "404-not-403"; CR-SRV-02/03): every tenant denial returns the identical status and body the server
 * gives for a non-existent box, so it can never confirm another program's box exists (T-01).
 */
export const TENANT_DENIED_MESSAGE = 'Not found.';

/**
 * Re-validates, at the store boundary, that a resolved {@link TenantContext} still owns its target
 * (component C6 seam, closes T-54). The tenant was resolved and validated by C5 *before* authorization;
 * between that resolution and the actual ResourceStore operation the mapping could be mutated (a box
 * re-bound, a relationship changed). This guard re-resolves the box→relationship binding **now** and
 * denies — non-leaking — on any drift, so a TOCTOU race cannot land an op in the wrong tenant.
 *
 * It is the execution-time complement to the resolver: the resolver decides admission; this guard
 * confirms the decision is still true at the moment bytes are written. It never widens — it can only
 * deny — and it denies with the same existence-hiding response as every other tenant failure.
 */
export class TenantIsolationGuard {
  private readonly logger = getLoggerFor(this);
  private readonly mapping: RelationshipMappingRegistry;

  public constructor(mapping: RelationshipMappingRegistry) {
    this.mapping = mapping;
  }

  /**
   * Assert the immutable resolved tenant still binds its target box. Re-resolves the current
   * box→relationship record and denies if the box binding vanished, was re-bound to another tenant, or
   * had its relationship / box root changed since resolution (T-54). Resolves quietly on a match.
   */
  public async assertStillBound(context: TenantContext): Promise<void> {
    const record = await this.mapping.findByBoxId(context.boxId);
    if (!record) {
      throw this.deny('box binding vanished between tenant resolution and the store operation');
    }
    if (!sameTenant(record, context)) {
      throw this.deny('box re-bound to another tenant between resolution and the store operation (TOCTOU)');
    }
    if (record.relationshipId !== context.relationshipId) {
      throw this.deny('relationship changed between resolution and the store operation');
    }
    if (record.boxRoot !== context.boxRoot) {
      throw this.deny('box root changed between resolution and the store operation');
    }
  }

  /**
   * Build the non-leaking denial. The real reason is logged for the audit deny event only; the thrown
   * error carries the generic existence-hiding message so the response reveals nothing (T-01/T-54).
   */
  private deny(reason: string): NotFoundHttpError {
    this.logger.warn(`Tenant re-validation denied: ${reason}.`);
    return new NotFoundHttpError(TENANT_DENIED_MESSAGE);
  }
}
