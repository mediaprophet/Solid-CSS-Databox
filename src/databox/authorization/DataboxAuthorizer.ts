import type { PermissionMap } from '../../authorization/permissions/Permissions';
import { PermissionReader } from '../../authorization/PermissionReader';
import { IdentifierMap } from '../../util/map/IdentifierMap';

/**
 * The composed Databox authorizer seam (component C4, DBX-04 §2).
 *
 * Per DBX-01 §3 and ADR-0003, the Databox decision is expressed as an extra {@link PermissionReader}
 * unioned into `readers/default.json` that can only ever force a mode to `false` — the conjunction
 * `tenant ∧ WAC ∧ relationship ∧ assurance ∧ record-grade ∧ immutability ∧ ODRL precondition`,
 * *narrow-never-broaden*. It composes *around* the flat WAC {@link PermissionMap} (which has no
 * tenant/assurance/ODRL dimension, DBX-01 §3) rather than replacing it, preserving the standard
 * Solid surface (invariant 12). The concrete composition is built by DBX-14.
 *
 * This is a marker interface documenting the contract; a concrete C4 is a {@link PermissionReader}.
 */
export interface ComposedDataboxAuthorizer {
  /**
   * A composed Databox authorizer MUST only ever narrow the permissions produced by the upstream
   * (WAC) readers; it may set a mode to `false` but MUST NOT introduce a `true` that the standard
   * surface did not already grant.
   */
  readonly narrowNeverBroaden: true;
}

/**
 * Fail-closed placeholder for the composed Databox authorizer (C4), shaped as a
 * {@link PermissionReader} so it can be unioned into `readers/default.json` (DBX-01 §3, DBX-14).
 *
 * Until DBX-14 implements the real conjunction, this reader grants nothing: it returns an empty
 * {@link PermissionMap}. Because the Databox seam only narrows, an empty map contributes no `true`
 * and can never widen access. It is a safe, non-conformant placeholder — it does not claim to
 * enforce any Databox invariant, it simply never permits.
 */
export class DenyAllDataboxPermissionReader extends PermissionReader implements ComposedDataboxAuthorizer {
  public readonly narrowNeverBroaden = true as const;

  public async handle(): Promise<PermissionMap> {
    // Grant nothing. The composed authorizer narrows; an empty map adds no permission (DBX-14).
    return new IdentifierMap();
  }
}
