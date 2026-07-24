import type { ResourceStore } from '../../storage/ResourceStore';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import { InMemoryDataboxModuleRegistry } from './DataboxModuleRegistry';
import { ModuleConfigStore } from './ModuleConfigStore';
import type {
  OxigraphIpmsHydrationPlan,
} from './OxigraphIpmsHydration';
import { createOxigraphIpmsHydrationPlanFromSolidStore } from './OxigraphIpmsHydration';
import type {
  PortableIpmsWorksBundle,
  StandardSolidIpmsWorksOptions,
  StandardSolidIpmsWorksResource,
  StandardSolidIpmsWorksResources,
} from './PortableIpmsWorks';
import {
  exportPortableIpmsWorks,
  importPortableIpmsWorksFromStandardSolidStore,
  publishPortableIpmsWorksToStandardSolidStore,
} from './PortableIpmsWorks';
import type {
  PortableConnectorJob,
  PortableConnectorManifest,
} from './modules/integration/ConnectorContract';
import type { VerticalProfileManifest } from './VerticalProfile';

const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z';

export interface IpmsMigrationProofOptions {
  /** Registry/config pair representing the opt-in IPMS running on a file-backed Solid store. */
  readonly sourceRegistry: DataboxModuleRegistry;
  readonly sourceConfigStore: ModuleConfigStore;
  /** Ordinary Solid resource store used as the canonical file-backed pod. */
  readonly sourceStore: ResourceStore;
  /** Base URL of the file-backed IPMS profile. */
  readonly sourceBaseUrl: string;
  /** Base URL of the Oxigraph/SPARQL profile being hydrated from canonical Solid resources. */
  readonly oxigraphProfileBaseUrl: string;
  /** Stable timestamp for deterministic proof bundles. */
  readonly generatedAt?: string;
  readonly verticalProfiles?: readonly VerticalProfileManifest[];
  readonly connectorManifests?: readonly PortableConnectorManifest[];
  readonly connectorJobs?: readonly PortableConnectorJob[];
}

export interface OxigraphBackedIpmsProfileDescriptor {
  readonly profile: 'css-sparql-oxigraph-hydrated';
  readonly sourceOfTruth: 'Solid LDP/RDF resources';
  readonly targetRole: 'rebuildable SPARQL query environment';
  readonly canonicalResources: readonly IpmsMigrationResourceDescriptor[];
  readonly hydrationPlan: OxigraphIpmsHydrationPlan;
  readonly liveEndpointRequired: false;
}

export interface IpmsMigrationResourceDescriptor {
  readonly kind: StandardSolidIpmsWorksResource['kind'];
  readonly path: string;
  readonly contentType: 'text/turtle';
}

export interface IpmsMigrationProofResult {
  readonly sourceMode: 'community-solid-server-file-backend';
  readonly sourceBaseUrl: string;
  readonly sourceBundle: PortableIpmsWorksBundle;
  readonly standardSolidResources: StandardSolidIpmsWorksResources;
  readonly oxigraphProfile: OxigraphBackedIpmsProfileDescriptor;
  readonly degradedMode: 'vanilla-solid-standard-rdf';
  readonly degradedBundle: PortableIpmsWorksBundle;
  readonly invariants: {
    readonly optInIpmsOnly: true;
    readonly portableCoreDegradesWithoutCssEnhancedRoutes: true;
    readonly declarativeRdfWorks: true;
    readonly oxigraphHydratedRebuildableNotCanonical: true;
  };
}

/**
 * Demonstrates the IPMS migration loop without starting CSS or Oxigraph:
 *
 * 1. export file-backed IPMS module/profile RDF as portable works;
 * 2. publish those works as ordinary Solid resources for an Oxigraph-backed CSS profile;
 * 3. build a deterministic named-graph hydration plan for the rebuildable Oxigraph query environment;
 * 4. import the same resources through standard Solid Type Index discovery into vanilla Solid degradation mode.
 */
export async function createIpmsMigrationProof(
  options: IpmsMigrationProofOptions,
): Promise<IpmsMigrationProofResult> {
  const generatedAt = options.generatedAt ?? DEFAULT_GENERATED_AT;
  const sourceBundle = await exportPortableIpmsWorks(
    options.sourceRegistry,
    options.sourceConfigStore,
    generatedAt,
    options.verticalProfiles ?? [],
    options.connectorManifests ?? [],
    options.connectorJobs ?? [],
  );
  const standardSolidOptions: StandardSolidIpmsWorksOptions = {
    baseUrl: options.oxigraphProfileBaseUrl,
    generatedAt,
  };
  const standardSolidResources = await publishPortableIpmsWorksToStandardSolidStore(
    sourceBundle,
    options.sourceStore,
    standardSolidOptions,
  );
  const canonicalResources = ipmsMigrationResourceDescriptors(standardSolidResources);
  const hydrationPlan = await createOxigraphIpmsHydrationPlanFromSolidStore(
    options.sourceStore,
    canonicalResources.map((resource): { path: string } => ({ path: resource.path })),
  );

  const degradedRegistry = new InMemoryDataboxModuleRegistry();
  const degradedConfigStore = new ModuleConfigStore(options.sourceStore, options.oxigraphProfileBaseUrl);
  const degradedBundle = await importPortableIpmsWorksFromStandardSolidStore(
    options.sourceStore,
    degradedRegistry,
    degradedConfigStore,
    {
      ...standardSolidOptions,
      generatedAt,
    },
  );

  return {
    sourceMode: 'community-solid-server-file-backend',
    sourceBaseUrl: options.sourceBaseUrl,
    sourceBundle,
    standardSolidResources,
    oxigraphProfile: {
      profile: 'css-sparql-oxigraph-hydrated',
      sourceOfTruth: hydrationPlan.sourceOfTruth,
      targetRole: hydrationPlan.targetRole,
      canonicalResources,
      hydrationPlan,
      liveEndpointRequired: false,
    },
    degradedMode: 'vanilla-solid-standard-rdf',
    degradedBundle,
    invariants: {
      optInIpmsOnly: true,
      portableCoreDegradesWithoutCssEnhancedRoutes: true,
      declarativeRdfWorks: true,
      oxigraphHydratedRebuildableNotCanonical: true,
    },
  };
}

function ipmsMigrationResourceDescriptors(
  resources: StandardSolidIpmsWorksResources,
): readonly IpmsMigrationResourceDescriptor[] {
  return [
    resources.typeIndex,
    ...resources.manifests,
    ...resources.verticalProfiles,
    ...resources.connectorManifests,
    ...resources.connectorJobs,
    ...resources.states,
  ].map((resource): IpmsMigrationResourceDescriptor => ({
    kind: resource.kind,
    path: resource.path,
    contentType: resource.contentType,
  }));
}
