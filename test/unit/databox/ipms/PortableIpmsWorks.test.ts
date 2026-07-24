import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/ipms/DataboxModuleRegistry';
import { ModuleConfigStore } from '../../../../src/databox/ipms/ModuleConfigStore';
import {
  exportPortableIpmsWorks,
  importPortableIpmsWorks,
  importPortableIpmsWorksFromStandardSolidStore,
  publishPortableIpmsWorksToStandardSolidStore,
} from '../../../../src/databox/ipms/PortableIpmsWorks';
import type {
  PortableConnectorJob,
  PortableConnectorManifest,
} from '../../../../src/databox/ipms/modules/integration/ConnectorContract';
import type { SolidModuleManifest } from '../../../../src/databox/ipms/SolidModuleManifest';
import { FOOD_RESTAURANT_VERTICAL_PROFILE } from '../../../../src/databox/ipms/VerticalProfile';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const manifest: SolidModuleManifest = {
  id: 'receipt',
  name: 'Receipt',
  version: '0.1.0',
  description: 'Portable RDF and printable receipt documents.',
  capabilities: [ 'ipms:receipt' ],
  routes: [ 'POST /.databox/ipms/receipt/build' ],
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
    resourceContainer: 'https://fresh.example/.databox/ipms/directory/',
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
    description: `${id} horizontal IPMS module.`,
    capabilities: [ `ipms:${id}` ],
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

describe('Portable IPMS works', (): void => {
  it('round-trips module manifests and RDF state into a fresh registry and store.', async(): Promise<void> => {
    const sourceRegistry = new InMemoryDataboxModuleRegistry();
    const source = createConfigStore();
    sourceRegistry.register(manifest);
    sourceRegistry.setEnabled('receipt', true);
    await source.store.save('receipt', '<> <urn:example:printer> "front-counter" .');
    await source.store.setEnabled('receipt', true);

    const bundle = await exportPortableIpmsWorks(sourceRegistry, source.store, '2026-07-19T00:00:00.000Z');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const target = createConfigStore();
    const imported = await importPortableIpmsWorks(bundle, targetRegistry, target.store);

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
        'ipms:portable-core-receipt-doc',
        'ipms:css-enhanced-receipt-build-route',
      ],
    });
    sourceRegistry.setEnabled('receipt', true);
    await source.store.save('receipt', '<> <urn:example:printer> "front-counter" .');
    await source.store.setEnabled('receipt', true);

    const bundle = await exportPortableIpmsWorks(sourceRegistry, source.store, '2026-07-19T00:00:00.000Z');
    const targetRoot = 'https://fresh.example/';
    const targetData = new Map<string, string>();
    const targetResourceStore = createResourceStore(targetData).resourceStore;
    const targetConfigStore = new ModuleConfigStore(targetResourceStore, targetRoot);
    await publishPortableIpmsWorksToStandardSolidStore(bundle, targetResourceStore, { baseUrl: targetRoot });

    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/type-index.ttl'))
      .toContain('solid:TypeIndex');
    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/modules/receipt.ttl'))
      .toContain('ipms:Module');
    expect(targetData.get('https://fresh.example/.databox/ipms/modules/receipt'))
      .toContain('front-counter');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const imported = await importPortableIpmsWorksFromStandardSolidStore(
      targetResourceStore,
      targetRegistry,
      targetConfigStore,
      { baseUrl: targetRoot, generatedAt: '2026-07-19T00:00:00.000Z' },
    );

    expect(targetRegistry.get('receipt')).toEqual({
      ...manifest,
      capabilities: [
        'ipms:portable-core-receipt-doc',
        'ipms:css-enhanced-receipt-build-route',
      ],
    });
    await expect(targetConfigStore.isEnabled('receipt')).resolves.toBe(true);
    await expect(targetConfigStore.load('receipt')).resolves.toContain('front-counter');
    expect(imported.modules).toEqual([
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'receipt',
          routes: [ 'POST /.databox/ipms/receipt/build' ],
        }),
        enabled: true,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('urn:solid-server:databox:ipms#enabled'),
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

    const bundle = await exportPortableIpmsWorks(
      sourceRegistry,
      source.store,
      '2026-07-19T00:00:00.000Z',
      [ FOOD_RESTAURANT_VERTICAL_PROFILE ],
    );
    const targetRoot = 'https://fresh.example/';
    const targetData = new Map<string, string>();
    const targetResourceStore = createResourceStore(targetData).resourceStore;
    await publishPortableIpmsWorksToStandardSolidStore(bundle, targetResourceStore, { baseUrl: targetRoot });

    expect(bundle.verticalProfiles).toEqual([ FOOD_RESTAURANT_VERTICAL_PROFILE ]);
    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/type-index.ttl'))
      .toContain('ipms:VerticalProfile');
    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/vertical-profiles/food.restaurant.ttl'))
      .toContain('Food / Restaurant');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const targetConfigStore = new ModuleConfigStore(targetResourceStore, targetRoot);
    const imported = await importPortableIpmsWorksFromStandardSolidStore(
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

    const bundle = await exportPortableIpmsWorks(
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
    await publishPortableIpmsWorksToStandardSolidStore(bundle, targetResourceStore, { baseUrl: targetRoot });

    expect(bundle.connectorManifests).toEqual([ connectorManifest ]);
    expect(bundle.connectorJobs).toEqual([ connectorJob ]);
    expect(bundle.portability.nonPortableRuntimeWork).toContain(
      'connector sidecar runtime descriptors and secret references',
    );
    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/type-index.ttl'))
      .toContain('ipms:ConnectorManifest');
    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/connectors/enterprise.staff.odbc.ttl'))
      .toContain('ipms:ConnectorManifest');
    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/connectors/enterprise.staff.odbc.ttl'))
      .not.toContain('Password=');
    expect(targetData.get('https://fresh.example/.well-known/databox-ipms/connector-jobs/staff-import-2026-07-19.ttl'))
      .toContain('import-snapshot');

    const targetRegistry = new InMemoryDataboxModuleRegistry();
    const targetConfigStore = new ModuleConfigStore(targetResourceStore, targetRoot);
    const imported = await importPortableIpmsWorksFromStandardSolidStore(
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

    await expect(exportPortableIpmsWorks(
      registry,
      undefined,
      '2026-07-19T00:00:00.000Z',
      [ FOOD_RESTAURANT_VERTICAL_PROFILE ],
    )).rejects.toThrow('Cannot export vertical profile food.restaurant; missing modules: catalogue');
  });

  it('refuses to replace an existing different module manifest.', async(): Promise<void> => {
    const registry = new InMemoryDataboxModuleRegistry();
    registry.register({ ...manifest, description: 'Different local contract.' });
    const bundle = await exportPortableIpmsWorks(new InMemoryDataboxModuleRegistry());
    const replacement = {
      ...bundle,
      modules: [
        {
          manifest,
          enabled: true,
        },
      ],
    };

    await expect(importPortableIpmsWorks(replacement, registry))
      .rejects.toThrow('Cannot import module receipt; a different manifest is already registered.');
  });

  it('requires a config store when importing RDF state.', async(): Promise<void> => {
    const bundle = {
      '@context': {},
      type: 'DataboxIpmsWorks',
      generatedAt: '2026-07-19T00:00:00.000Z',
      portability: {
        canonicalStore: 'Solid LDP/RDF resources',
        cssEnhanced: 'IPMS control plane is an optional interpreter, not the canonical store',
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

    await expect(importPortableIpmsWorks(bundle, new InMemoryDataboxModuleRegistry()))
      .rejects.toThrow('Cannot import RDF state for module receipt without a ModuleConfigStore.');
  });

  it('validates the bundle shape before importing.', async(): Promise<void> => {
    await expect(importPortableIpmsWorks({ type: 'SomethingElse' }, new InMemoryDataboxModuleRegistry()))
      .rejects.toThrow('IPMS works bundle type must be DataboxIpmsWorks.');
  });

  it('rejects connector jobs that reference missing connector manifests.', async(): Promise<void> => {
    const bundle = await exportPortableIpmsWorks(new InMemoryDataboxModuleRegistry());

    await expect(importPortableIpmsWorks({
      ...bundle,
      connectorJobs: [ connectorJob ],
    }, new InMemoryDataboxModuleRegistry())).rejects
      .toThrow('references missing connector enterprise.staff.odbc');
  });
});
