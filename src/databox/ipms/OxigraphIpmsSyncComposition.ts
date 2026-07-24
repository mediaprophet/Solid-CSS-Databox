import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import type { Finalizable } from '../../init/final/Finalizable';
import { Initializer } from '../../init/Initializer';
import { getLoggerFor } from '../../logging/LogUtil';
import type { ActivityEmitter } from '../../server/notifications/ActivityEmitter';
import type { ResourceStore } from '../../storage/ResourceStore';
import { createErrorMessage } from '../../util/errors/ErrorUtil';
import { ensureTrailingSlash } from '../../util/PathUtil';
import type {
  CanonicalIpmsRdfResourceDescriptor,
  OxigraphIpmsHydrationExecutor,
  OxigraphIpmsHydrationOperation,
} from './OxigraphIpmsHydration';
import { OxigraphIpmsSync } from './OxigraphIpmsSync';
import type { OxigraphIpmsSyncResult, OxigraphIpmsSyncSubscription } from './OxigraphIpmsSync';

const DEFAULT_RESOURCE_PATHS: readonly string[] = [
  '.well-known/databox-ipms/type-index.ttl',
  '.well-known/databox-ipms/modules/index.ttl',
  '.well-known/databox-ipms/modules/hosting.ttl',
  '.well-known/databox-ipms/modules/receipt.ttl',
  '.well-known/databox-ipms/modules/pos.ordering.ttl',
  '.well-known/databox-ipms/modules/pos.promotions-display.ttl',
  '.well-known/databox-ipms/modules/pos.native-edge-devices.ttl',
  '.well-known/databox-ipms/modules/menu.ttl',
  '.well-known/databox-ipms/modules/website-seo.ttl',
  '.well-known/databox-ipms/vertical-profiles/food.restaurant.ttl',
  '.well-known/databox-ipms/vertical-profiles/health.privacy-consent.ttl',
  '.databox/ipms/modules/hosting',
  '.databox/ipms/modules/receipt',
  '.databox/ipms/modules/pos.ordering',
  '.databox/ipms/modules/pos.promotions-display',
  '.databox/ipms/modules/pos.native-edge-devices',
  '.databox/ipms/modules/menu',
  '.databox/ipms/modules/website-seo',
];

export function defaultOxigraphIpmsSyncResourcePaths(): string[] {
  return [ ...DEFAULT_RESOURCE_PATHS ];
}

/**
 * SPARQL Update executor for the hydrated IPMS query environment.
 *
 * The executor has no read path by design: canonical reads stay on the Solid ResourceStore, while this
 * component only receives named-graph replacement updates produced from those canonical resources.
 */
export class OxigraphIpmsSparqlUpdateExecutor implements OxigraphIpmsHydrationExecutor {
  protected readonly logger = getLoggerFor(this);
  private readonly fetcher = new SparqlEndpointFetcher();

  public constructor(private readonly updateEndpoint: string) {
    if (!URL.canParse(updateEndpoint)) {
      throw new TypeError('IPMS Oxigraph sync updateEndpoint must be an absolute URL.');
    }
  }

  public async executeUpdate(update: string, operation: OxigraphIpmsHydrationOperation): Promise<void> {
    this.logger.info(`Hydrating IPMS graph ${operation.graph} into ${this.updateEndpoint}.`);
    try {
      await this.fetcher.fetchUpdate(this.updateEndpoint, update);
    } catch (error: unknown) {
      this.logger.error(`IPMS Oxigraph sync update failed: ${createErrorMessage(error)}`);
      throw error;
    }
  }
}

/**
 * Components.js-owned lifecycle for optional IPMS Oxigraph sync.
 *
 * Startup does a bounded rebuild from allowlisted Solid RDF resources, then subscribes to the canonical
 * MonitoringStore notifications. Finalization detaches the subscription and waits for queued sync work.
 */
export class OxigraphIpmsSyncInitializer extends Initializer implements Finalizable {
  protected readonly logger = getLoggerFor(this);
  private readonly sync: OxigraphIpmsSync;
  private subscription?: OxigraphIpmsSyncSubscription;
  private readonly enabled: boolean;
  private readonly hydrateOnStartup: boolean;
  private lastStartupResult?: OxigraphIpmsSyncResult;

  public constructor(
    source: ResourceStore,
    activityEmitter: ActivityEmitter,
    executor: OxigraphIpmsHydrationExecutor,
    baseUrl: string,
    enabled = false,
    resourcePaths: string[] = [],
    hydrateOnStartup = true,
    maxResourcesPerBatch?: number,
  ) {
    super();
    this.enabled = enabled;
    this.hydrateOnStartup = hydrateOnStartup;
    const resources = canonicalIpmsRdfResourceDescriptors(baseUrl, resourcePaths.length === 0 ?
      DEFAULT_RESOURCE_PATHS :
      resourcePaths);
    this.sync = new OxigraphIpmsSync({
      enabled,
      source,
      executor,
      resources,
      maxResourcesPerBatch: maxResourcesPerBatch ?? Math.max(resources.length, 1),
      onError: (error): void => {
        this.logger.error(`IPMS Oxigraph notification sync failed: ${createErrorMessage(error)}`);
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
      `IPMS Oxigraph startup sync hydrated ${this.lastStartupResult.synchronizedPaths.length} resources.`,
    );
  }

  public async finalize(): Promise<void> {
    this.subscription?.dispose();
    this.subscription = undefined;
    await this.sync.waitForIdle();
  }

  public getHydrationQueue(): OxigraphIpmsSync {
    return this.sync;
  }

  public getLastStartupResult(): OxigraphIpmsSyncResult | undefined {
    return this.lastStartupResult;
  }
}

export function canonicalIpmsRdfResourceDescriptors(
  baseUrl: string,
  resourcePaths: readonly string[] = [],
): CanonicalIpmsRdfResourceDescriptor[] {
  const root = ensureTrailingSlash(new URL(baseUrl).href);
  const sourcePaths = resourcePaths.length === 0 ? DEFAULT_RESOURCE_PATHS : resourcePaths;
  const paths = sourcePaths.map((path): string => URL.canParse(path) ? new URL(path).href : new URL(path, root).href);
  return [ ...new Set(paths) ].map((path): CanonicalIpmsRdfResourceDescriptor => ({ path }));
}
