import type { Patch } from '../../http/representation/Patch';
import type { Representation } from '../../http/representation/Representation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { Conditions } from '../../storage/conditions/Conditions';
import { PassthroughStore } from '../../storage/PassthroughStore';
import type { ChangeMap, ResourceStore } from '../../storage/ResourceStore';
import { ForbiddenHttpError } from '../../util/errors/ForbiddenHttpError';

/**
 * Append-only record store decorator (component C6, DBX-04 §2; ADR-0018; DBX-17/HAK-07).
 *
 * Same pattern as CSS {@link ReadOnlyStore}, but with a narrower override set: creation is allowed,
 * while replace/update/delete of an already-accepted resource is rejected. This sits *below*
 * authorization, so it binds every actor class including owner/administrative permissions
 * (invariant 17; no silent overwrite, invariant 7).
 *
 * Sharp edge (DBX-01 §4): `setRepresentation` is used by CSS for *both* create and replace. A blanket
 * throw (as in {@link ReadOnlyStore}) would also block legitimate creation, so this decorator checks
 * {@link ResourceStore.hasResource} first and only rejects the replace case. It fails closed: if
 * existence cannot be determined, the write is refused rather than allowed.
 *
 * NOTE: This is the deterministic append-only *mechanism* only. It does not itself implement the
 * evidence-ledger commit protocol (C13/§7.0); that is layered above by DBX-17/DBX-18.
 */
/* eslint-disable unused-imports/no-unused-vars */
export class AppendOnlyStore<T extends ResourceStore = ResourceStore> extends PassthroughStore<T> {
  public constructor(source: T) {
    super(source);
  }

  /**
   * Allowed only when the resource does not yet exist (create). Replacing an existing resource is
   * rejected. If existence cannot be confirmed, the write is refused (fail closed).
   */
  public async setRepresentation(
    identifier: ResourceIdentifier,
    representation: Representation,
    conditions?: Conditions,
  ): Promise<ChangeMap> {
    if (await this.source.hasResource(identifier)) {
      throw new ForbiddenHttpError('Append-only: replacing an existing resource is not allowed.');
    }
    return this.source.setRepresentation(identifier, representation, conditions);
  }

  public async deleteResource(identifier: ResourceIdentifier, conditions?: Conditions): Promise<ChangeMap> {
    throw new ForbiddenHttpError('Append-only: deleting an existing resource is not allowed.');
  }

  public async modifyResource(
    identifier: ResourceIdentifier,
    patch: Patch,
    conditions?: Conditions,
  ): Promise<ChangeMap> {
    throw new ForbiddenHttpError('Append-only: modifying an existing resource is not allowed.');
  }
}
