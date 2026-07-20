import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import type { Finalizable } from '../../init/final/Finalizable';
import { Initializer } from '../../init/Initializer';
import { getLoggerFor } from '../../logging/LogUtil';
import type { ActivityEmitter } from '../../server/notifications/ActivityEmitter';
import type { ResourceStore } from '../../storage/ResourceStore';
import { createErrorMessage } from '../../util/errors/ErrorUtil';
import { ensureTrailingSlash } from '../../util/PathUtil';
import type {
  CanonicalCmsRdfResourceDescriptor,
  OxigraphCmsHydrationExecutor,
  OxigraphCmsHydrationOperation,
} from './OxigraphCmsHydration';
import { OxigraphCmsSync } from './OxigraphCmsSync';
import type { OxigraphCmsSyncResult, OxigraphCmsSyncSubscription } from './OxigraphCmsSync';

const DEFAULT_RESOURCE_PATHS: readonly string[] = [
  '.well-known/databox-cms/type-index.ttl',
  '.well-known/databox-cms/modules/index.ttl',
  '.well-known/databox-cms/modules/hosting.ttl',
  '.well-known/databox-cms/modules/receipt.ttl',
  '.well-known/databox-cms/modules/pos.ordering.ttl',
  '.well-known/databox-cms/modules/pos.promotions-display.ttl',
  '.well-known/databox-cms/modules/pos.native-edge-devices.ttl',
  '.well-known/databox-cms/modules/menu.ttl',
  '.well-known/databox-cms/modules/website-seo.ttl',
  '.well-known/databox-cms/vertical-profiles/food.restaurant.ttl',
  '.well-known/databox-cms/vertical-profiles/health.privacy-consent.ttl',
  '.databox/cms/modules/hosting',
  '.databox/cms/modules/receipt',
  '.databox/cms/modules/pos.ordering',
  '.databox/cms/modules/pos.promotions-display',
  '.databox/cms/modules/pos.native-edge-devices',
  '.databox/cms/modules/menu',
  '.databox/cms/modules/website-seo',
];

export function defaultOxigraphCmsSyncResourcePaths(): string[] {
  return [ ...DEFAULT_RESOURCE_PATHS ];
}

/**
 * SPARQL Update executor for the hydrated CMS query environment.
 *
 * The executor has no read path by design: canonical reads stay on the Solid ResourceStore, while this
 * component only receives named-graph replacement updates produced from those canonical resources.
 */
export class OxigraphCmsSparqlUpdateExecutor implements OxigraphCmsHydrationExecutor {
  protected readonly logger = getLoggerFor(this);
  private readonly fetcher = new SparqlEndpointFetcher();

  public constructor(private readonly updateEndpoint: string) {
    if (!URL.canParse(updateEndpoint)) {
      throw new TypeError('CMS Oxigraph sync updateEndpoint must be an absolute URL.');
    }
  }

  public async executeUpdate(update: string, operation: OxigraphCmsHydrationOperation): Promise<void> {
    this.logger.info(`Hydrating CMS graph ${operation.graph} into ${this.updateEndpoint}.`);
    try {
      await this.fetcher.fetchUpdate(this.updateEndpoint, update);
    } catch (error: unknown) {
      this.logger.error(`CMS Oxigraph sync update failed: ${createErrorMessage(error)}`);
      throw error;
    }
  }
}

/**
 * Components.js-owned lifecycle for optional CMS Oxigraph sync.
 *
 * Startup does a bounded rebuild from allowlisted Solid RDF resources, then subscribes to the canonical
 * MonitoringStore notifications. Finalization detaches the subscription and waits for queued sync work.
 */
export class OxigraphCmsSyncInitializer extends Initializer implements Finalizable {
  protected readonly logger = getLoggerFor(this);
  private readonly sync: OxigraphCmsSync;
  private subscription?: OxigraphCmsSyncSubscription;
  private readonly enabled: boolean;
  private readonly hydrateOnStartup: boolean;
  private lastStartupResult?: OxigraphCmsSyncResult;

  public constructor(
    source: ResourceStore,
    activityEmitter: ActivityEmitter,
    executor: OxigraphCmsHydrationExecutor,
    baseUrl: string,
    enabled = false,
    resourcePaths: string[] = [],
    hydrateOnStartup = true,
    maxResourcesPerBatch?: number,
  ) {
    super();
    this.enabled = enabled;
    this.hydrateOnStartup = hydrateOnStartup;
    const resources = canonicalCmsRdfResourceDescriptors(baseUrl, resourcePaths.length === 0 ?
      DEFAULT_RESOURCE_PATHS :
      resourcePaths);
    this.sync = new OxigraphCmsSync({
      enabled,
      source,
      executor,
      resources,
      maxResourcesPerBatch: maxResourcesPerBatch ?? Math.max(resources.length, 1),
      onError: (error): void => {
        this.logger.error(`CMS Oxigraph notification sync failed: ${createErrorMessage(error)}`);
      },
    });
    if (enabled) {
      this.subscription = this.sync.subscribeToCanonicalChanges(activityEmitter);
    }
  }

  public async handle(): Promise<void> {
    if (!this.enabled || !this.hydrateOnStartup) {
      return;
    }
    this.lastStartupResult = await this.sync.syncAll();
    this.logger.info(
      `CMS Oxigraph startup sync hydrated ${this.lastStartupResult.synchronizedPaths.length} resources.`,
    );
  }

  public async finalize(): Promise<void> {
    this.subscription?.dispose();
    this.subscription = undefined;
    await this.sync.waitForIdle();
  }

  public getHydrationQueue(): OxigraphCmsSync {
    return this.sync;
  }

  public getLastStartupResult(): OxigraphCmsSyncResult | undefined {
    return this.lastStartupResult;
  }
}

export function canonicalCmsRdfResourceDescriptors(
  baseUrl: string,
  resourcePaths: readonly string[] = [],
): CanonicalCmsRdfResourceDescriptor[] {
  const root = ensureTrailingSlash(new URL(baseUrl).href);
  const sourcePaths = resourcePaths.length === 0 ? DEFAULT_RESOURCE_PATHS : resourcePaths;
  const paths = sourcePaths.map((path): string => URL.canParse(path) ? new URL(path).href : new URL(path, root).href);
  return [ ...new Set(paths) ].map((path): CanonicalCmsRdfResourceDescriptor => ({ path }));
}
