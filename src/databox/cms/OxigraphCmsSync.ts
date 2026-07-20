import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { RepresentationMetadata } from '../../http/representation/RepresentationMetadata';
import type { ActivityEmitter } from '../../server/notifications/ActivityEmitter';
import type { ChangeMap, ResourceStore } from '../../storage/ResourceStore';
import { readableToString } from '../../util/StreamUtil';
import { AS, SOLID_AS } from '../../util/Vocabularies';
import type { VocabularyTerm } from '../../util/Vocabularies';
import {
  createOxigraphCmsHydrationPlan,
  replayOxigraphCmsHydrationPlan,
} from './OxigraphCmsHydration';
import type {
  CanonicalCmsRdfResource,
  CanonicalCmsRdfResourceDescriptor,
  OxigraphCmsHydrationExecutor,
  OxigraphCmsHydrationOperation,
} from './OxigraphCmsHydration';

const TURTLE = 'text/turtle';

export type OxigraphCmsSyncSource = 'manual' | 'write-result' | 'notification';

export interface OxigraphCmsSyncChangedResource {
  /** Absolute Solid resource IRI from the canonical pod. */
  readonly path: string;
  /** Indicates that the corresponding named graph should be cleared from the hydrated query copy. */
  readonly deleted?: boolean;
}

export interface OxigraphCmsSyncOptions {
  /**
   * Explicit opt-in gate. Disabled sync is a no-op and does not require a source store or executor.
   */
  readonly enabled?: boolean;
  /** Canonical Solid ResourceStore. Reads always come from here; Oxigraph is never read as source-of-truth. */
  readonly source?: ResourceStore;
  /** SPARQL Update executor for the rebuildable hydrated query environment. */
  readonly executor?: OxigraphCmsHydrationExecutor;
  /** Explicit allowlist of canonical CMS RDF resources eligible for hydration. */
  readonly resources?: readonly CanonicalCmsRdfResourceDescriptor[];
  /** Maximum number of allowed resources processed by one call. Defaults to the allowlist size. */
  readonly maxResourcesPerBatch?: number;
  /** Optional async-listener error sink for notification-driven sync. */
  readonly onError?: (error: Error, event: OxigraphCmsSyncErrorEvent) => void;
}

export interface OxigraphCmsSyncErrorEvent {
  readonly source: OxigraphCmsSyncSource;
  readonly resources: readonly OxigraphCmsSyncChangedResource[];
}

export interface OxigraphCmsSyncResult {
  readonly enabled: boolean;
  readonly source: OxigraphCmsSyncSource;
  readonly requestedPaths: readonly string[];
  readonly synchronizedPaths: readonly string[];
  readonly skippedPaths: readonly string[];
  readonly operations: readonly OxigraphCmsHydrationOperation[];
}

export interface OxigraphCmsSyncSubscription {
  readonly dispose: () => void;
}

/**
 * Bounded opt-in bridge from canonical Solid CMS RDF writes to an Oxigraph hydration executor.
 *
 * This helper deliberately reads after write from the Solid ResourceStore and only replays named-graph
 * replacement updates. It is safe to disable for vanilla Solid mode and safe to rebuild from pod resources later.
 */
export class OxigraphCmsSync {
  private readonly enabled: boolean;
  private readonly allowedPaths: ReadonlySet<string>;
  private readonly maxResourcesPerBatch: number;
  private readonly source?: ResourceStore;
  private readonly executor?: OxigraphCmsHydrationExecutor;
  private readonly onError?: (error: Error, event: OxigraphCmsSyncErrorEvent) => void;
  private tail: Promise<void> = Promise.resolve();
  private readonly canonicalChangeListener = (
    target: ResourceIdentifier,
    activity: VocabularyTerm<typeof AS>,
  ): void => {
    const resource = {
      path: target.path,
      deleted: activity.equals(AS.terms.Delete) || activity.equals(AS.terms.Remove),
    };
    this.syncResources([ resource ], 'notification')
      .catch((error: unknown): void => this.reportError(error, 'notification', [ resource ]));
  };

  public constructor(options: OxigraphCmsSyncOptions = {}) {
    this.enabled = options.enabled === true;
    this.source = options.source;
    this.executor = options.executor;
    this.onError = options.onError;
    const allowedPaths = [ ...new Set((options.resources ?? []).map((resource): string => resource.path)) ];
    this.allowedPaths = new Set(allowedPaths);
    this.maxResourcesPerBatch = options.maxResourcesPerBatch ?? Math.max(allowedPaths.length, 1);

    if (!this.enabled) {
      return;
    }
    if (!this.source) {
      throw new TypeError('Enabled CMS Oxigraph sync requires a canonical Solid ResourceStore.');
    }
    if (!this.executor) {
      throw new TypeError('Enabled CMS Oxigraph sync requires an Oxigraph hydration executor.');
    }
    if (this.allowedPaths.size === 0) {
      throw new TypeError('Enabled CMS Oxigraph sync requires an explicit allowlist of CMS RDF resources.');
    }
    if (this.maxResourcesPerBatch < 1) {
      throw new TypeError('CMS Oxigraph sync maxResourcesPerBatch must be at least 1.');
    }
    for (const path of this.allowedPaths) {
      assertAbsoluteIri(path, 'CMS Oxigraph sync resource path');
    }
  }

  /**
   * Sync all configured canonical CMS resources. Useful after startup or after attaching a new executor.
   */
  public async syncAll(): Promise<OxigraphCmsSyncResult> {
    return this.syncResources(
      [ ...this.allowedPaths ].map((path): OxigraphCmsSyncChangedResource => ({ path })),
      'manual',
    );
  }

  /**
   * Sync changed resources from a ResourceStore write result.
   */
  public async syncChangeMap(changes: ChangeMap): Promise<OxigraphCmsSyncResult> {
    return this.syncResources([ ...changes ].map(([ identifier, metadata ]): OxigraphCmsSyncChangedResource => ({
      path: identifier.path,
      deleted: isDeleteActivity(metadata),
    })), 'write-result');
  }

  /**
   * Sync a single changed resource, typically from a Solid notification callback.
   */
  public async syncResource(
    identifier: ResourceIdentifier,
    deleted = false,
  ): Promise<OxigraphCmsSyncResult> {
    return this.syncResources([{ path: identifier.path, deleted }], 'notification');
  }

  /**
   * Listen to CSS resource change notifications. The returned subscription is inert in disabled mode.
   */
  public subscribeToCanonicalChanges(emitter: ActivityEmitter): OxigraphCmsSyncSubscription {
    if (!this.enabled) {
      return { dispose: (): void => undefined };
    }

    emitter.on('changed', this.canonicalChangeListener);
    return {
      dispose: (): void => {
        emitter.off('changed', this.canonicalChangeListener);
      },
    };
  }

  /**
   * Wait until all sync work that has already been queued has finished.
   */
  public async waitForIdle(): Promise<void> {
    await this.tail;
  }

  private async syncResources(
    resources: readonly OxigraphCmsSyncChangedResource[],
    source: OxigraphCmsSyncSource,
  ): Promise<OxigraphCmsSyncResult> {
    if (!this.enabled) {
      return {
        enabled: false,
        source,
        requestedPaths: resources.map((resource): string => resource.path),
        synchronizedPaths: [],
        skippedPaths: resources.map((resource): string => resource.path),
        operations: [],
      };
    }

    return this.enqueue(async(): Promise<OxigraphCmsSyncResult> => {
      const requestedPaths = resources.map((resource): string => resource.path);
      const selected = selectAllowedResources(resources, this.allowedPaths);
      if (selected.length > this.maxResourcesPerBatch) {
        throw new Error(
          `CMS Oxigraph sync refused to hydrate ${selected.length} resources; maxResourcesPerBatch is ` +
          `${this.maxResourcesPerBatch}.`,
        );
      }

      const canonicalResources = await Promise.all(selected.map(async(resource): Promise<CanonicalCmsRdfResource> => {
        const canonicalResource = await this.readCanonicalResource(resource);
        return canonicalResource;
      }));
      const plan = await createOxigraphCmsHydrationPlan(canonicalResources);
      await replayOxigraphCmsHydrationPlan(plan, this.executor!);
      const synchronizedPaths = plan.operations.map((operation): string => operation.sourcePath);
      return {
        enabled: true,
        source,
        requestedPaths,
        synchronizedPaths,
        skippedPaths: requestedPaths.filter((path): boolean => !this.allowedPaths.has(path)),
        operations: plan.operations,
      };
    });
  }

  private async readCanonicalResource(resource: OxigraphCmsSyncChangedResource): Promise<CanonicalCmsRdfResource> {
    if (resource.deleted || !await this.source!.hasResource({ path: resource.path })) {
      return { path: resource.path, contentType: TURTLE, turtle: '' };
    }
    const representation = await this.source!.getRepresentation({ path: resource.path }, { type: { [TURTLE]: 1 }});
    return {
      path: resource.path,
      contentType: TURTLE,
      turtle: await readableToString(representation.data),
    };
  }

  private async enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work);
    this.tail = run.then((): void => undefined, (): void => undefined);
    return run;
  }

  private reportError(
    error: unknown,
    source: OxigraphCmsSyncSource,
    resources: readonly OxigraphCmsSyncChangedResource[],
  ): void {
    this.onError?.(error instanceof Error ? error : new Error(String(error)), { source, resources });
  }
}

function selectAllowedResources(
  resources: readonly OxigraphCmsSyncChangedResource[],
  allowedPaths: ReadonlySet<string>,
): OxigraphCmsSyncChangedResource[] {
  const selected = new Map<string, OxigraphCmsSyncChangedResource>();
  for (const resource of resources) {
    if (allowedPaths.has(resource.path)) {
      selected.set(resource.path, {
        path: resource.path,
        deleted: selected.get(resource.path)?.deleted === true || resource.deleted === true,
      });
    }
  }
  return [ ...selected.values() ].sort((left, right): number => left.path.localeCompare(right.path));
}

function isDeleteActivity(metadata: RepresentationMetadata): boolean {
  const activity = metadata.get(SOLID_AS.terms.activity);
  return Boolean(activity && (activity.equals(AS.terms.Delete) || activity.equals(AS.terms.Remove)));
}

function assertAbsoluteIri(value: string, field: string): void {
  if (!URL.canParse(value)) {
    throw new Error(`${field} must be an absolute IRI.`);
  }
}
