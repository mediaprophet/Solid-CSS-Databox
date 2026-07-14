import type { Patch } from '../../http/representation/Patch';
import type { Representation } from '../../http/representation/Representation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { Conditions } from '../../storage/conditions/Conditions';
import { PassthroughStore } from '../../storage/PassthroughStore';
import type { ChangeMap, ResourceStore } from '../../storage/ResourceStore';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../util/errors/ConflictHttpError';
import { ForbiddenHttpError } from '../../util/errors/ForbiddenHttpError';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import type { AppendOnlyEvidenceSink, SupersessionEvidence, TombstoneEvidence } from './AppendOnlyEvidence';
import type { SupersessionRegistry } from './AppendOnlySupersession';
import { InMemorySupersessionRegistry } from './AppendOnlySupersession';
import type { TombstoneRegistry, TombstoneRequest } from './AppendOnlyTombstone';
import { InMemoryTombstoneRegistry } from './AppendOnlyTombstone';

export * from './AppendOnlyEvidence';
export * from './AppendOnlySupersession';
export * from './AppendOnlyTombstone';

/**
 * Optional collaborators for {@link AppendOnlyStore}. All are optional: a bare `new AppendOnlyStore(source)`
 * keeps the DBX-09 create-yes/replace-no behaviour with in-memory supersession/tombstone registries and no
 * evidence sink.
 */
export interface AppendOnlyStoreOptions {
  /** Records tombstone state; defaults to an {@link InMemoryTombstoneRegistry}. */
  readonly tombstones?: TombstoneRegistry;
  /** Records supersession links; defaults to an {@link InMemorySupersessionRegistry}. */
  readonly supersessions?: SupersessionRegistry;
  /** Sink the store notifies with supersession/tombstone evidence (DBX-19). Optional. */
  readonly evidence?: AppendOnlyEvidenceSink;
  /** Clock for evidence timestamps; defaults to `Date.now` via ISO-8601. Injectable for tests. */
  readonly now?: () => string;
}

/**
 * The result of a governed supersession: the {@link ChangeMap} from appending the new record and the
 * {@link SupersessionEvidence} describing the link (consumed by DBX-18 receipts / DBX-19 ledger).
 */
export interface SupersessionResult {
  readonly changes: ChangeMap;
  readonly evidence: SupersessionEvidence;
}

/**
 * Append-only record store decorator (component C6, DBX-04 §2; ADR-0018; DBX-17/HAK-07).
 *
 * Same pattern as CSS {@link ReadOnlyStore}, but with a narrower override set: creation is allowed,
 * while replace/update/delete of an already-accepted resource is rejected. This sits *below*
 * authorization, so it binds every actor class including consumer, program, owner and administrative
 * permissions (invariant 17; no silent overwrite, invariant 7). Because the denial lives below the
 * WAC/owner layer, the actor class is irrelevant — no `control` permission, `OwnerPermissionReader`
 * grant, or ordinary Solid operation can reach past it.
 *
 * Sharp edge (DBX-01 §4): `setRepresentation` is used by CSS for *both* create and replace. A blanket
 * throw (as in {@link ReadOnlyStore}) would also block legitimate creation, so this decorator checks
 * {@link ResourceStore.hasResource} first and only rejects the replace case. It fails closed: if
 * existence cannot be determined, the write is refused rather than allowed.
 *
 * Governance (DBX-17): correction is a **supersession** — a new appended record that links to the prior
 * (via {@link supersedeResource}); the prior remains retrievable. Lawful deletion is a **tombstone** —
 * recorded state plus an evidence event, never a destructive rewrite (via {@link tombstoneResource}).
 * Ordinary `deleteResource`/`modifyResource` stay denied for every actor; the governed paths are the
 * only ways to correct or retire an accepted resource, and neither destroys history (T-26/T-27/T-29).
 *
 * This is the deterministic append-only *mechanism*. It emits evidence to the injected sink but does
 * not itself implement the evidence-ledger commit protocol (C13/§7.0); that is layered above by DBX-19.
 */
/* eslint-disable unused-imports/no-unused-vars */
export class AppendOnlyStore<T extends ResourceStore = ResourceStore> extends PassthroughStore<T> {
  protected readonly tombstones: TombstoneRegistry;
  protected readonly supersessions: SupersessionRegistry;
  protected readonly evidence?: AppendOnlyEvidenceSink;
  protected readonly now: () => string;

  public constructor(source: T, options: AppendOnlyStoreOptions = {}) {
    super(source);
    this.tombstones = options.tombstones ?? new InMemoryTombstoneRegistry();
    this.supersessions = options.supersessions ?? new InMemorySupersessionRegistry();
    this.evidence = options.evidence;
    this.now = options.now ?? ((): string => new Date().toISOString());
  }

  /**
   * Allowed only when the resource does not yet exist (create). Replacing an existing resource is
   * rejected, and re-creating over a tombstoned path is rejected (that would resurrect/rewrite retired
   * history). If existence cannot be confirmed, the write is refused (fail closed).
   */
  public async setRepresentation(
    identifier: ResourceIdentifier,
    representation: Representation,
    conditions?: Conditions,
  ): Promise<ChangeMap> {
    if (await this.tombstones.isTombstoned(identifier.path)) {
      throw new ForbiddenHttpError('Append-only: recreating a tombstoned resource is not allowed.');
    }
    if (await this.source.hasResource(identifier)) {
      throw new ForbiddenHttpError('Append-only: replacing an existing resource is not allowed.');
    }
    return this.source.setRepresentation(identifier, representation, conditions);
  }

  /**
   * Ordinary DELETE is denied for every actor class. Lawful deletion goes through the governed
   * {@link tombstoneResource} path, which never destroys bytes.
   */
  public async deleteResource(identifier: ResourceIdentifier, conditions?: Conditions): Promise<ChangeMap> {
    throw new ForbiddenHttpError('Append-only: deleting an existing resource is not allowed; use the tombstone path.');
  }

  /**
   * PATCH is denied for every actor class: an accepted resource is never modified in place.
   */
  public async modifyResource(
    identifier: ResourceIdentifier,
    patch: Patch,
    conditions?: Conditions,
  ): Promise<ChangeMap> {
    throw new ForbiddenHttpError('Append-only: modifying an existing resource is not allowed.');
  }

  /**
   * Governed correction (ADR-0018 §2). Appends a **new** record that supersedes the prior accepted
   * record; the prior bytes remain retrievable and unchanged. The new record is created through the
   * append-only create path (so create-yes/replace-no still holds), the prior→next link is recorded,
   * and a supersession evidence event is emitted.
   *
   * Fails closed: the prior must resolve to an existing, non-tombstoned accepted record (no dangling
   * supersession, ADR-0018 failure behaviour), and a prior may be superseded at most once (no fork).
   */
  public async supersedeResource(
    newIdentifier: ResourceIdentifier,
    representation: Representation,
    prior: ResourceIdentifier,
    conditions?: Conditions,
  ): Promise<SupersessionResult> {
    if (await this.tombstones.isTombstoned(prior.path)) {
      throw new ConflictHttpError('Append-only: cannot supersede a tombstoned record.');
    }
    if (!await this.source.hasResource(prior)) {
      throw new NotFoundHttpError('Append-only: supersession target does not resolve to an existing accepted record.');
    }
    if (await this.supersessions.supersededBy(prior.path) !== undefined) {
      throw new ConflictHttpError('Append-only: the prior record has already been superseded.');
    }

    // Reuse the append-only create path: this enforces create-yes/replace-no on the new identifier.
    const changes = await this.setRepresentation(newIdentifier, representation, conditions);
    const recordedAt = this.now();
    await this.supersessions.record({ prior: prior.path, next: newIdentifier.path, recordedAt });
    const evidence: SupersessionEvidence = {
      kind: 'supersession',
      target: prior.path,
      supersedes: prior.path,
      supersededBy: newIdentifier.path,
      recordedAt,
    };
    await this.evidence?.record(evidence);
    return { changes, evidence };
  }

  /**
   * Governed lawful deletion (ADR-0018 §3). Records a tombstone (state + evidence) **without** destroying
   * the resource's bytes — no `deleteResource` is called on the source. Distinguishes tombstoned from
   * never-existed: an already-tombstoned target replays idempotently; a target that never existed is a
   * 404. A request lacking a legal-basis reference is rejected (no silent in-place rewrite).
   */
  public async tombstoneResource(
    identifier: ResourceIdentifier,
    request: TombstoneRequest,
  ): Promise<TombstoneEvidence> {
    if (request.legalBasis.trim().length === 0) {
      throw new BadRequestHttpError('Append-only: a tombstone requires a recorded legal-basis reference.');
    }

    const existing = await this.tombstones.get(identifier.path);
    if (existing) {
      // Idempotent replay: already tombstoned. Do not destroy or re-emit; return the recorded facts.
      return {
        kind: 'tombstone',
        target: existing.target,
        recordClass: existing.recordClass,
        legalBasis: existing.legalBasis,
        recordedAt: existing.tombstonedAt,
      };
    }

    if (!await this.source.hasResource(identifier)) {
      // Never existed — distinguished from tombstoned (handled above). Fail closed.
      throw new NotFoundHttpError('Append-only: cannot tombstone a resource that does not exist.');
    }

    const tombstonedAt = this.now();
    await this.tombstones.mark({
      target: identifier.path,
      recordClass: request.recordClass,
      legalBasis: request.legalBasis,
      tombstonedAt,
    });
    const evidence: TombstoneEvidence = {
      kind: 'tombstone',
      target: identifier.path,
      recordClass: request.recordClass,
      legalBasis: request.legalBasis,
      recordedAt: tombstonedAt,
    };
    await this.evidence?.record(evidence);
    // NB: no `source.deleteResource` — the bytes-history contract is preserved (T-29).
    return evidence;
  }

  /**
   * Whether a resource is tombstoned (distinguishes tombstoned from never-existed for read handlers).
   */
  public async isTombstoned(identifier: ResourceIdentifier): Promise<boolean> {
    return this.tombstones.isTombstoned(identifier.path);
  }

  /**
   * Resolves the record that directly supersedes `identifier`, or `undefined` if none.
   */
  public async supersededBy(identifier: ResourceIdentifier): Promise<string | undefined> {
    return this.supersessions.supersededBy(identifier.path);
  }
}
