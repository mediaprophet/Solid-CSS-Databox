import type { NamedNode, Quad } from '@rdfjs/types';
import { DataFactory, Parser, Store } from 'n3';
import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { ModuleConfigStore } from '../../../../src/databox/ipms/ModuleConfigStore';
import {
  createOxigraphIpmsHydrationPlan,
  createOxigraphIpmsHydrationPlanFromSolidStore,
  replayOxigraphIpmsHydrationPlan,
} from '../../../../src/databox/ipms/OxigraphIpmsHydration';
import type {
  OxigraphIpmsHydrationExecutor,
  OxigraphIpmsHydrationOperation,
} from '../../../../src/databox/ipms/OxigraphIpmsHydration';
import {
  exportPortableIpmsWorks,
  publishPortableIpmsWorksToStandardSolidStore,
} from '../../../../src/databox/ipms/PortableIpmsWorks';
import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/ipms/DataboxModuleRegistry';
import type { SolidModuleManifest } from '../../../../src/databox/ipms/SolidModuleManifest';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';
import { IPMS, RDF } from '../../../../src/util/Vocabularies';

const baseUrl = 'https://fresh.example/';
const statePath = `${baseUrl}.databox/ipms/modules/receipt`;
const manifestPath = `${baseUrl}.well-known/databox-ipms/modules/receipt.ttl`;

const manifest: SolidModuleManifest = {
  id: 'receipt',
  name: 'Receipt',
  version: '0.1.0',
  description: 'Portable RDF and printable receipt documents.',
  capabilities: [ 'ipms:portable-core-receipt-doc' ],
  routes: [ 'POST /.databox/ipms/receipt/build' ],
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

class InMemoryHydratedSparqlEnvironment implements OxigraphIpmsHydrationExecutor {
  public readonly updates: string[] = [];
  private readonly store = new Store();

  public async executeUpdate(update: string, operation: OxigraphIpmsHydrationOperation): Promise<void> {
    this.updates.push(update);
    const graph = namedNode(operation.graph);
    this.store.removeMatches(null, null, null, graph);
    for (const triple of new Parser({ baseIRI: operation.graph }).parse(operation.turtle)) {
      this.store.addQuad(rdfQuad(triple.subject, triple.predicate, triple.object, graph));
    }
  }

  public hasTriple(graph: string, subject: string, predicate: string, object: string): boolean {
    return this.store.countQuads(namedNode(subject), namedNode(predicate), literal(object), namedNode(graph)) > 0;
  }

  public hasIriTriple(graph: string, subject: string, predicate: string, object: string): boolean {
    return this.store.countQuads(namedNode(subject), namedNode(predicate), namedNode(object), namedNode(graph)) > 0;
  }

  public graphSize(graph: string): number {
    return this.store.countQuads(null, null, null, namedNode(graph));
  }
}

async function createCanonicalIpmsResources(): Promise<{
  data: Map<string, string>;
  resourceStore: ResourceStore;
  descriptors: { path: string }[];
}> {
  const registry = new InMemoryDataboxModuleRegistry();
  const { data, resourceStore } = createResourceStore();
  const configStore = new ModuleConfigStore(resourceStore, baseUrl);
  registry.register(manifest);
  registry.setEnabled('receipt', true);
  await configStore.save('receipt', '<> <urn:example:printer> "front-counter" .');
  await configStore.setEnabled('receipt', true);

  const bundle = await exportPortableIpmsWorks(registry, configStore, '2026-07-19T00:00:00.000Z');
  const resources = await publishPortableIpmsWorksToStandardSolidStore(bundle, resourceStore, { baseUrl });
  return {
    data,
    resourceStore,
    descriptors: [ resources.typeIndex, ...resources.manifests, ...resources.states ]
      .map((resource): { path: string } => ({ path: resource.path })),
  };
}

describe('Oxigraph IPMS hydration', (): void => {
  it('creates deterministic named-graph replacement updates from canonical Solid resources.', async():
  Promise<void> => {
    const { resourceStore, descriptors } = await createCanonicalIpmsResources();
    const resources = await Promise.all(descriptors.map(async(descriptor): Promise<{
      path: string;
      contentType: 'text/turtle';
      turtle: string;
    }> => ({
      path: descriptor.path,
      contentType: 'text/turtle',
      turtle: await readableToString((await resourceStore.getRepresentation(
        { path: descriptor.path },
        { type: { 'text/turtle': 1 }},
      )).data),
    })));

    const plan = await createOxigraphIpmsHydrationPlan(resources.reverse());

    expect(plan).toMatchObject({
      sourceOfTruth: 'Solid LDP/RDF resources',
      targetRole: 'rebuildable SPARQL query environment',
    });
    expect(plan.operations.map((operation): string => operation.graph))
      .toEqual(descriptors.map((descriptor): string => descriptor.path).sort());
    expect(plan.operations.find((operation): boolean => operation.graph === statePath)).toMatchObject({
      kind: 'replace-named-graph',
      sourcePath: statePath,
      graph: statePath,
      tripleCount: 2,
      update: expect.stringContaining(`DELETE WHERE { GRAPH <${statePath}> { ?s ?p ?o. } };`),
    });
    expect(plan.operations.find((operation): boolean => operation.graph === statePath)?.update)
      .toContain('INSERT DATA');
  });

  it('rebuilds a SPARQL query environment from Solid resources and then syncs later Solid writes.', async():
  Promise<void> => {
    const { data, resourceStore, descriptors } = await createCanonicalIpmsResources();
    const environment = new InMemoryHydratedSparqlEnvironment();

    await replayOxigraphIpmsHydrationPlan(
      await createOxigraphIpmsHydrationPlanFromSolidStore(resourceStore, descriptors),
      environment,
    );

    expect(environment.graphSize(manifestPath)).toBeGreaterThan(0);
    expect(environment.hasIriTriple(manifestPath, `${manifestPath}#manifest`, RDF.type, IPMS.Module)).toBe(true);
    expect(environment.hasTriple(statePath, statePath, IPMS.enabled, 'true')).toBe(true);
    expect(environment.hasTriple(statePath, statePath, 'urn:example:printer', 'front-counter')).toBe(true);

    data.set(statePath, [
      '<> <urn:example:printer> "back-counter" .',
      `<> <${IPMS.enabled}> "false" .`,
    ].join('\n'));
    await replayOxigraphIpmsHydrationPlan(
      await createOxigraphIpmsHydrationPlanFromSolidStore(resourceStore, [{ path: statePath }]),
      environment,
    );

    expect(environment.hasTriple(statePath, statePath, 'urn:example:printer', 'front-counter')).toBe(false);
    expect(environment.hasTriple(statePath, statePath, 'urn:example:printer', 'back-counter')).toBe(true);
    expect(environment.hasTriple(statePath, statePath, IPMS.enabled, 'false')).toBe(true);
    expect(environment.updates.at(-1)).toContain(`GRAPH <${statePath}>`);
  });

  it('rejects malformed Solid RDF before it can hydrate the query environment.', async(): Promise<void> => {
    const resource = {
      path: 'https://fresh.example/.databox/ipms/modules/bad',
      contentType: 'text/turtle' as const,
      turtle: '<urn:example:s> <urn:example:p> "unterminated .',
    };

    await expect(createOxigraphIpmsHydrationPlan([ resource ]))
      .rejects.toThrow('IPMS Oxigraph hydration could not parse https://fresh.example/.databox/ipms/modules/bad');
  });
});

function literal(value: string): ReturnType<typeof DataFactory.literal> {
  return DataFactory.literal(value);
}

function namedNode(value: string): ReturnType<typeof DataFactory.namedNode> {
  return DataFactory.namedNode(value);
}

function rdfQuad(
  subject: Quad['subject'],
  predicate: Quad['predicate'],
  object: Quad['object'],
  graph: NamedNode,
): Quad {
  return DataFactory.quad(subject, predicate, object, graph);
}
