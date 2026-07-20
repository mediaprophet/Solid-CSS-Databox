import type { ResourceStore } from '../../storage/ResourceStore';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import { InMemoryDataboxModuleRegistry } from './DataboxModuleRegistry';
import { ModuleConfigStore } from './ModuleConfigStore';
import type {
  OxigraphCmsHydrationPlan,
} from './OxigraphCmsHydration';
import { createOxigraphCmsHydrationPlanFromSolidStore } from './OxigraphCmsHydration';
import type {
  PortableCmsWorksBundle,
  StandardSolidCmsWorksOptions,
  StandardSolidCmsWorksResource,
  StandardSolidCmsWorksResources,
} from './PortableCmsWorks';
import {
  exportPortableCmsWorks,
  importPortableCmsWorksFromStandardSolidStore,
  publishPortableCmsWorksToStandardSolidStore,
} from './PortableCmsWorks';
import type {
  PortableConnectorJob,
  PortableConnectorManifest,
} from './modules/integration/ConnectorContract';
import type { VerticalProfileManifest } from './VerticalProfile';

const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z';

export interface CmsMigrationProofOptions {
  /** Registry/config pair representing the opt-in CMS running on a file-backed Solid store. */
  readonly sourceRegistry: DataboxModuleRegistry;
  readonly sourceConfigStore: ModuleConfigStore;
  /** Ordinary Solid resource store used as the canonical file-backed pod. */
  readonly sourceStore: ResourceStore;
  /** Base URL of the file-backed CMS profile. */
  readonly sourceBaseUrl: string;
  /** Base URL of the Oxigraph/SPARQL profile being hydrated from canonical Solid resources. */
  readonly oxigraphProfileBaseUrl: string;
  /** Stable timestamp for deterministic proof bundles. */
  readonly generatedAt?: string;
  readonly verticalProfiles?: readonly VerticalProfileManifest[];
  readonly connectorManifests?: readonly PortableConnectorManifest[];
  readonly connectorJobs?: readonly PortableConnectorJob[];
}

export interface OxigraphBackedCmsProfileDescriptor {
  readonly profile: 'css-sparql-oxigraph-hydrated';
  readonly sourceOfTruth: 'Solid LDP/RDF resources';
  readonly targetRole: 'rebuildable SPARQL query environment';
  readonly canonicalResources: readonly CmsMigrationResourceDescriptor[];
  readonly hydrationPlan: OxigraphCmsHydrationPlan;
  readonly liveEndpointRequired: false;
}

export interface CmsMigrationResourceDescriptor {
  readonly kind: StandardSolidCmsWorksResource['kind'];
  readonly path: string;
  readonly contentType: 'text/turtle';
}

export interface CmsMigrationProofResult {
  readonly sourceMode: 'community-solid-server-file-backend';
  readonly sourceBaseUrl: string;
  readonly sourceBundle: PortableCmsWorksBundle;
  readonly standardSolidResources: StandardSolidCmsWorksResources;
  readonly oxigraphProfile: OxigraphBackedCmsProfileDescriptor;
  readonly degradedMode: 'vanilla-solid-standard-rdf';
  readonly degradedBundle: PortableCmsWorksBundle;
  readonly invariants: {
    readonly optInCmsOnly: true;
    readonly portableCoreDegradesWithoutCssEnhancedRoutes: true;
    readonly declarativeRdfWorks: true;
    readonly oxigraphHydratedRebuildableNotCanonical: true;
  };
}

/**
 * Demonstrates the CMS migration loop without starting CSS or Oxigraph:
 *
 * 1. export file-backed CMS module/profile RDF as portable works;
 * 2. publish those works as ordinary Solid resources for an Oxigraph-backed CSS profile;
 * 3. build a deterministic named-graph hydration plan for the rebuildable Oxigraph query environment;
 * 4. import the same resources through standard Solid Type Index discovery into vanilla Solid degradation mode.
 */
export async function createCmsMigrationProof(
  options: CmsMigrationProofOptions,
): Promise<CmsMigrationProofResult> {
  const generatedAt = options.generatedAt ?? DEFAULT_GENERATED_AT;
  const sourceBundle = await exportPortableCmsWorks(
    options.sourceRegistry,
    options.sourceConfigStore,
    generatedAt,
    options.verticalProfiles ?? [],
    options.connectorManifests ?? [],
    options.connectorJobs ?? [],
  );
  const standardSolidOptions: StandardSolidCmsWorksOptions = {
    baseUrl: options.oxigraphProfileBaseUrl,
    generatedAt,
  };
  const standardSolidResources = await publishPortableCmsWorksToStandardSolidStore(
    sourceBundle,
    options.sourceStore,
    standardSolidOptions,
  );
  const canonicalResources = cmsMigrationResourceDescriptors(standardSolidResources);
  const hydrationPlan = await createOxigraphCmsHydrationPlanFromSolidStore(
    options.sourceStore,
    canonicalResources.map((resource): { path: string } => ({ path: resource.path })),
  );

  const degradedRegistry = new InMemoryDataboxModuleRegistry();
  const degradedConfigStore = new ModuleConfigStore(options.sourceStore, options.oxigraphProfileBaseUrl);
  const degradedBundle = await importPortableCmsWorksFromStandardSolidStore(
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
      optInCmsOnly: true,
      portableCoreDegradesWithoutCssEnhancedRoutes: true,
      declarativeRdfWorks: true,
      oxigraphHydratedRebuildableNotCanonical: true,
    },
  };
}

function cmsMigrationResourceDescriptors(
  resources: StandardSolidCmsWorksResources,
): readonly CmsMigrationResourceDescriptor[] {
  return [
    resources.typeIndex,
    ...resources.manifests,
    ...resources.verticalProfiles,
    ...resources.connectorManifests,
    ...resources.connectorJobs,
    ...resources.states,
  ].map((resource): CmsMigrationResourceDescriptor => ({
    kind: resource.kind,
    path: resource.path,
    contentType: resource.contentType,
  }));
}
