import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { createCmsMigrationProof } from '../../../../src/databox/cms/CmsMigrationProof';
import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/cms/DataboxModuleRegistry';
import { ModuleConfigStore } from '../../../../src/databox/cms/ModuleConfigStore';
import type { SolidModuleManifest } from '../../../../src/databox/cms/SolidModuleManifest';
import type { VerticalProfileManifest } from '../../../../src/databox/cms/VerticalProfile';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const sourceBaseUrl = 'https://file.example/';
const oxigraphBaseUrl = 'https://oxigraph.example/';
const generatedAt = '2026-07-19T00:00:00.000Z';
const statePath = `${oxigraphBaseUrl}.databox/cms/modules/receipt`;

const receiptManifest: SolidModuleManifest = {
  id: 'receipt',
  name: 'Receipt',
  version: '0.1.0',
  description: 'Portable RDF and printable receipt documents.',
  capabilities: [
    'cms:portable-core-receipt-doc',
    'cms:css-enhanced-receipt-build-route',
  ],
  routes: [ 'POST /.databox/cms/receipt/build' ],
  adminUi: {
    navLabel: 'Receipts',
    path: '/receipts',
  },
};

const receiptProfile: VerticalProfileManifest = {
  id: 'proof.receipts',
  name: 'Receipt Proof',
  version: '0.1.0',
  description: 'Single-module profile used to prove CMS migration portability.',
  useCases: [ 'PROOF' ],
  modules: [
    {
      moduleId: 'receipt',
      required: true,
      enabledByDefault: true,
      rationale: 'Receipts carry portable proof of purchase and printable QR payloads.',
      defaultConfig: {
        contentType: 'text/turtle',
        turtle: '<> <urn:example:receiptMode> "portable" .',
      },
    },
  ],
};

function createResourceStore(data = new Map<string, string>()): {
  data: Map<string, string>;
  resourceStore: ResourceStore;
} {
  return {
    data,
    resourceStore: {
      hasResource: async(id: ResourceIdentifier): Promise<boolean> => data.has(id.path),
      getRepresentation: async(id: ResourceIdentifier): Promise<Representation> =>
        new BasicRepresentation(data.get(id.path) ?? '', 'text/turtle'),
      setRepresentation: async(id: ResourceIdentifier, representation: Representation): Promise<void> => {
        data.set(id.path, await readableToString(representation.data));
      },
    } as unknown as ResourceStore,
  };
}

describe('CMS migration proof', (): void => {
  it('proves file-backed CMS works can hydrate Oxigraph and degrade back to standard Solid.', async():
  Promise<void> => {
    const { data, resourceStore } = createResourceStore();
    const registry = new InMemoryDataboxModuleRegistry();
    const configStore = new ModuleConfigStore(resourceStore, sourceBaseUrl);
    registry.register(receiptManifest);
    registry.setEnabled('receipt', true);
    await configStore.save('receipt', '<> <urn:example:printer> "front-counter" .');
    await configStore.setEnabled('receipt', true);

    const proof = await createCmsMigrationProof({
      sourceRegistry: registry,
      sourceConfigStore: configStore,
      sourceStore: resourceStore,
      sourceBaseUrl,
      oxigraphProfileBaseUrl: oxigraphBaseUrl,
      generatedAt,
      verticalProfiles: [ receiptProfile ],
    });

    expect(proof).toMatchObject({
      sourceMode: 'community-solid-server-file-backend',
      sourceBaseUrl,
      degradedMode: 'vanilla-solid-standard-rdf',
      invariants: {
        optInCmsOnly: true,
        portableCoreDegradesWithoutCssEnhancedRoutes: true,
        declarativeRdfWorks: true,
        oxigraphHydratedRebuildableNotCanonical: true,
      },
    });
    expect(proof.sourceBundle.generatedAt).toBe(generatedAt);
    expect(proof.sourceBundle.modules).toEqual([
      expect.objectContaining({
        manifest: receiptManifest,
        enabled: true,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('front-counter'),
        },
      }),
    ]);
    expect(proof.sourceBundle.verticalProfiles).toEqual([ receiptProfile ]);

    expect(proof.standardSolidResources.typeIndex.path)
      .toBe(`${oxigraphBaseUrl}.well-known/databox-cms/type-index.ttl`);
    expect(data.get(`${oxigraphBaseUrl}.well-known/databox-cms/type-index.ttl`)).toContain('solid:TypeIndex');
    expect(data.get(`${oxigraphBaseUrl}.well-known/databox-cms/modules/receipt.ttl`)).toContain('cms:Module');
    expect(data.get(`${oxigraphBaseUrl}.well-known/databox-cms/vertical-profiles/proof.receipts.ttl`))
      .toContain('Receipt Proof');
    expect(data.get(statePath)).toContain('front-counter');

    expect(proof.oxigraphProfile).toMatchObject({
      profile: 'css-sparql-oxigraph-hydrated',
      sourceOfTruth: 'Solid LDP/RDF resources',
      targetRole: 'rebuildable SPARQL query environment',
      liveEndpointRequired: false,
    });
    expect(proof.oxigraphProfile.canonicalResources.map((resource): string => resource.path)).toEqual([
      `${oxigraphBaseUrl}.well-known/databox-cms/type-index.ttl`,
      `${oxigraphBaseUrl}.well-known/databox-cms/modules/receipt.ttl`,
      `${oxigraphBaseUrl}.well-known/databox-cms/vertical-profiles/proof.receipts.ttl`,
      statePath,
    ]);
    expect(proof.oxigraphProfile.hydrationPlan.operations.map((operation): string => operation.graph))
      .toEqual(proof.oxigraphProfile.canonicalResources.map((resource): string => resource.path).sort());
    expect(proof.oxigraphProfile.hydrationPlan.operations.find((operation): boolean => operation.graph === statePath))
      .toMatchObject({
        kind: 'replace-named-graph',
        sourcePath: statePath,
        tripleCount: 2,
        update: expect.stringContaining(`GRAPH <${statePath}>`),
      });

    expect(proof.degradedBundle.modules).toEqual([
      expect.objectContaining({
        manifest: receiptManifest,
        enabled: true,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('front-counter'),
        },
      }),
    ]);
    expect(proof.degradedBundle.verticalProfiles).toEqual([ receiptProfile ]);
    expect(proof.degradedBundle.portability.canonicalStore).toBe('Solid LDP/RDF resources');
  });
});
