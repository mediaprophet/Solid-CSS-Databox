import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/cms/DataboxModuleRegistry';
import { ModuleConfigStore } from '../../../../src/databox/cms/ModuleConfigStore';
import {
  exportPortableCmsWorks,
  importPortableCmsWorks,
  importPortableCmsWorksFromStandardSolidStore,
  publishPortableCmsWorksToStandardSolidStore,
} from '../../../../src/databox/cms/PortableCmsWorks';
import type {
  PortableConnectorJob,
  PortableConnectorManifest,
} from '../../../../src/databox/cms/modules/integration/ConnectorContract';
import type { SolidModuleManifest } from '../../../../src/databox/cms/SolidModuleManifest';
import { FOOD_RESTAURANT_VERTICAL_PROFILE } from '../../../../src/databox/cms/VerticalProfile';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const manifest: SolidModuleManifest = {
  id: 'receipt',
  name: 'Receipt',
  version: '0.1.0',
  description: 'Portable RDF and printable receipt documents.',
  capabilities: [ 'cms:receipt' ],
  routes: [ 'POST /.databox/cms/receipt/build' ],
  adminUi: {
    navLabel: 'Receipts',
    path: '/receipts',
  },
};

const connectorManifest: PortableConnectorManifest = {
  id: 'enterprise.staff.odbc',
  name: 'Staff ODBC Import',
  version: '0.1.0',
  description: 'Maps a legacy staff database into portable directory RDF.',
  source: {
    kind: 'odbc',
    sourceRef: 'urn:databox:source:hr-db',
    label: 'HR database',
  },
  modes: [ 'import-snapshot', 'source-to-pod-sync', 'virtual-federated-query' ],
  mapping: {
    language: 'r2rml',
    contentType: 'text/turtle',
    turtle: `
@prefix rr: <http://www.w3.org/ns/r2rml#> .
@prefix schema: <https://schema.org/> .

<#TriplesMap>
  rr:logicalTable [ rr:tableName "people" ];
  rr:subjectMap [ rr:template "https://fresh.example/staff/{id}" ];
  rr:predicateObjectMap [
    rr:predicate schema:name ;
    rr:objectMap [ rr:column "display_name" ]
  ] .
`,
  },
  target: {
    podBaseIri: 'https://fresh.example/',
    resourceContainer: 'https://fresh.example/.databox/cms/directory/',
  },
};

const connectorJob: PortableConnectorJob = {
  id: 'staff-import-2026-07-19',
  connectorId: 'enterprise.staff.odbc',
  mode: 'import-snapshot',
  createdAt: '2026-07-19T00:00:00.000Z',
  conflictPolicy: 'append-only',
};

function moduleManifest(id: string): SolidModuleManifest {
  return {
    id,
    name: id,
    version: '0.1.0',
    description: `${id} horizontal CMS module.`,
    capabilities: [ `cms:${id}` ],
    routes: [],
  };
}

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

function createConfigStore(data = new Map<string, string>(), baseUrl = 'http://localhost:3000/'):
{ data: Map<string, string>; resourceStore: ResourceStore; store: ModuleConfigStore } {
  const { resourceStore } = createResourceStore(data);
  return {
    data,
    resourceStore,
    store: new ModuleConfigStore(resourceStore, baseUrl),
  };
}

describe('Portable CMS works', (): void => {
  it('round-trips module manifests and RDF state into a fresh registry and store.', async(): Promise<void> => {
    const sourceRegistry = new InMemoryDataboxModuleRegistry();
    const source = createConfigStore();
    sourceRegistry.register(manifest);
    sourceRegistry.setEnabled('receipt', true);
    await source.store.save('receipt', '<> <urn:example:printer> "front-counter" .');
    await source.store.setEnabled('receipt', true);

    const bundle = await exportPortableCmsWorks(sourceRegistry, source.store, '2026-07-19T00:00:00.000Z');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const target = createConfigStore();
    const imported = await importPortableCmsWorks(bundle, targetRegistry, target.store);

    expect(targetRegistry.get('receipt')).toEqual(manifest);
    await expect(target.store.isEnabled('receipt')).resolves.toBe(true);
    await expect(target.store.load('receipt')).resolves.toContain('front-counter');
    expect(imported.modules).toMatchObject([
      {
        manifest: { id: 'receipt' },
        enabled: true,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('front-counter'),
        },
      },
    ]);
  });

  it('degrades a CSS-enhanced file-backed export into standard Solid RDF discovery.', async(): Promise<void> => {
    const sourceRegistry = new InMemoryDataboxModuleRegistry();
    const source = createConfigStore();
    sourceRegistry.register({
      ...manifest,
      capabilities: [
        'cms:portable-core-receipt-doc',
        'cms:css-enhanced-receipt-build-route',
      ],
    });
    sourceRegistry.setEnabled('receipt', true);
    await source.store.save('receipt', '<> <urn:example:printer> "front-counter" .');
    await source.store.setEnabled('receipt', true);

    const bundle = await exportPortableCmsWorks(sourceRegistry, source.store, '2026-07-19T00:00:00.000Z');
    const targetRoot = 'https://fresh.example/';
    const targetData = new Map<string, string>();
    const targetResourceStore = createResourceStore(targetData).resourceStore;
    const targetConfigStore = new ModuleConfigStore(targetResourceStore, targetRoot);
    await publishPortableCmsWorksToStandardSolidStore(bundle, targetResourceStore, { baseUrl: targetRoot });

    expect(targetData.get('https://fresh.example/.well-known/databox-cms/type-index.ttl'))
      .toContain('solid:TypeIndex');
    expect(targetData.get('https://fresh.example/.well-known/databox-cms/modules/receipt.ttl'))
      .toContain('cms:Module');
    expect(targetData.get('https://fresh.example/.databox/cms/modules/receipt'))
      .toContain('front-counter');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const imported = await importPortableCmsWorksFromStandardSolidStore(
      targetResourceStore,
      targetRegistry,
      targetConfigStore,
      { baseUrl: targetRoot, generatedAt: '2026-07-19T00:00:00.000Z' },
    );

    expect(targetRegistry.get('receipt')).toEqual({
      ...manifest,
      capabilities: [
        'cms:portable-core-receipt-doc',
        'cms:css-enhanced-receipt-build-route',
      ],
    });
    await expect(targetConfigStore.isEnabled('receipt')).resolves.toBe(true);
    await expect(targetConfigStore.load('receipt')).resolves.toContain('front-counter');
    expect(imported.modules).toEqual([
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'receipt',
          routes: [ 'POST /.databox/cms/receipt/build' ],
        }),
        enabled: true,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('urn:solid-server:databox:cms#enabled'),
        },
      }),
    ]);
  });

  it('exports vertical profiles as portable works and standard Solid RDF resources.', async(): Promise<void> => {
    const sourceRegistry = new InMemoryDataboxModuleRegistry();
    const source = createConfigStore();
    for (const module of FOOD_RESTAURANT_VERTICAL_PROFILE.modules) {
      sourceRegistry.register(module.moduleId === 'receipt' ? manifest : moduleManifest(module.moduleId));
      sourceRegistry.setEnabled(module.moduleId, module.enabledByDefault);
      await source.store.setEnabled(module.moduleId, module.enabledByDefault);
    }

    const bundle = await exportPortableCmsWorks(
      sourceRegistry,
      source.store,
      '2026-07-19T00:00:00.000Z',
      [ FOOD_RESTAURANT_VERTICAL_PROFILE ],
    );
    const targetRoot = 'https://fresh.example/';
    const targetData = new Map<string, string>();
    const targetResourceStore = createResourceStore(targetData).resourceStore;
    await publishPortableCmsWorksToStandardSolidStore(bundle, targetResourceStore, { baseUrl: targetRoot });

    expect(bundle.verticalProfiles).toEqual([ FOOD_RESTAURANT_VERTICAL_PROFILE ]);
    expect(targetData.get('https://fresh.example/.well-known/databox-cms/type-index.ttl'))
      .toContain('cms:VerticalProfile');
    expect(targetData.get('https://fresh.example/.well-known/databox-cms/vertical-profiles/food.restaurant.ttl'))
      .toContain('Food / Restaurant');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const targetConfigStore = new ModuleConfigStore(targetResourceStore, targetRoot);
    const imported = await importPortableCmsWorksFromStandardSolidStore(
      targetResourceStore,
      targetRegistry,
      targetConfigStore,
      { baseUrl: targetRoot, generatedAt: '2026-07-19T00:00:00.000Z' },
    );

    expect(imported.verticalProfiles).toEqual([ FOOD_RESTAURANT_VERTICAL_PROFILE ]);
    expect(targetRegistry.get('menu')).toMatchObject({ id: 'menu' });
  });

  it('exports connector manifests and jobs as portable descriptors, not runtime sidecars.', async(): Promise<void> => {
    const sourceRegistry = new InMemoryDataboxModuleRegistry();
    const source = createConfigStore();
    sourceRegistry.register(manifest);
    sourceRegistry.setEnabled('receipt', true);
    await source.store.setEnabled('receipt', true);

    const bundle = await exportPortableCmsWorks(
      sourceRegistry,
      source.store,
      '2026-07-19T00:00:00.000Z',
      [],
      [ connectorManifest ],
      [ connectorJob ],
    );
    const targetRoot = 'https://fresh.example/';
    const targetData = new Map<string, string>();
    const targetResourceStore = createResourceStore(targetData).resourceStore;
    await publishPortableCmsWorksToStandardSolidStore(bundle, targetResourceStore, { baseUrl: targetRoot });

    expect(bundle.connectorManifests).toEqual([ connectorManifest ]);
    expect(bundle.connectorJobs).toEqual([ connectorJob ]);
    expect(bundle.portability.nonPortableRuntimeWork).toContain(
      'connector sidecar runtime descriptors and secret references',
    );
    expect(targetData.get('https://fresh.example/.well-known/databox-cms/type-index.ttl'))
      .toContain('cms:ConnectorManifest');
    expect(targetData.get('https://fresh.example/.well-known/databox-cms/connectors/enterprise.staff.odbc.ttl'))
      .toContain('cms:ConnectorManifest');
    expect(targetData.get('https://fresh.example/.well-known/databox-cms/connectors/enterprise.staff.odbc.ttl'))
      .not.toContain('Password=');
    expect(targetData.get('https://fresh.example/.well-known/databox-cms/connector-jobs/staff-import-2026-07-19.ttl'))
      .toContain('import-snapshot');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const targetConfigStore = new ModuleConfigStore(targetResourceStore, targetRoot);
    const imported = await importPortableCmsWorksFromStandardSolidStore(
      targetResourceStore,
      targetRegistry,
      targetConfigStore,
      { baseUrl: targetRoot, generatedAt: '2026-07-19T00:00:00.000Z' },
    );

    expect(imported.connectorManifests).toEqual([ connectorManifest ]);
    expect(imported.connectorJobs).toEqual([ connectorJob ]);
  });

  it('refuses to export a vertical profile when its referenced modules are missing.', async(): Promise<void> => {
    const registry = new InMemoryDataboxModuleRegistry();
    registry.register(moduleManifest('menu'));

    await expect(exportPortableCmsWorks(
      registry,
      undefined,
      '2026-07-19T00:00:00.000Z',
      [ FOOD_RESTAURANT_VERTICAL_PROFILE ],
    )).rejects.toThrow('Cannot export vertical profile food.restaurant; missing modules: catalogue');
  });

  it('refuses to replace an existing different module manifest.', async(): Promise<void> => {
    const registry = new InMemoryDataboxModuleRegistry();
    registry.register({ ...manifest, description: 'Different local contract.' });
    const bundle = await exportPortableCmsWorks(new InMemoryDataboxModuleRegistry());
    const replacement = {
      ...bundle,
      modules: [
        {
          manifest,
          enabled: true,
        },
      ],
    };

    await expect(importPortableCmsWorks(replacement, registry))
      .rejects.toThrow('Cannot import module receipt; a different manifest is already registered.');
  });

  it('requires a config store when importing RDF state.', async(): Promise<void> => {
    const bundle = {
      '@context': {},
      type: 'DataboxCmsWorks',
      generatedAt: '2026-07-19T00:00:00.000Z',
      portability: {
        canonicalStore: 'Solid LDP/RDF resources',
        cssEnhanced: 'CMS control plane is an optional interpreter, not the canonical store',
        backendTargets: [ 'vanilla Solid server' ],
        nonPortableRuntimeWork: [ 'control-plane bearer tokens' ],
      },
      modules: [
        {
          manifest,
          enabled: true,
          state: {
            contentType: 'text/turtle',
            turtle: '<> <urn:example:x> "y" .',
          },
        },
      ],
    };

    await expect(importPortableCmsWorks(bundle, new InMemoryDataboxModuleRegistry()))
      .rejects.toThrow('Cannot import RDF state for module receipt without a ModuleConfigStore.');
  });

  it('validates the bundle shape before importing.', async(): Promise<void> => {
    await expect(importPortableCmsWorks({ type: 'SomethingElse' }, new InMemoryDataboxModuleRegistry()))
      .rejects.toThrow('CMS works bundle type must be DataboxCmsWorks.');
  });

  it('rejects connector jobs that reference missing connector manifests.', async(): Promise<void> => {
    const bundle = await exportPortableCmsWorks(new InMemoryDataboxModuleRegistry());

    await expect(importPortableCmsWorks({
      ...bundle,
      connectorJobs: [ connectorJob ],
    }, new InMemoryDataboxModuleRegistry())).rejects
      .toThrow('references missing connector enterprise.staff.odbc');
  });
});
