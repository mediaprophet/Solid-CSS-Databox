import type { Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import type { ResourceStore } from '../../storage/ResourceStore';
import { readableToString } from '../../util/StreamUtil';

const TURTLE = 'text/turtle';

export interface CanonicalCmsRdfResource {
  /** Solid resource IRI. This becomes the named graph in the hydrated query environment. */
  readonly path: string;
  /** Canonical RDF bytes read from the Solid pod. */
  readonly turtle: string;
  readonly contentType: string;
}

export interface CanonicalCmsRdfResourceDescriptor {
  /** Solid resource IRI to read from the canonical ResourceStore. */
  readonly path: string;
}

export interface OxigraphCmsHydrationOperation {
  readonly kind: 'replace-named-graph';
  /** The Solid resource whose canonical Turtle produced this operation. */
  readonly sourcePath: string;
  /** The SPARQL named graph being replaced. */
  readonly graph: string;
  /** Normalized Turtle/N-Triples payload inserted into the named graph. */
  readonly turtle: string;
  readonly tripleCount: number;
  /** SPARQL 1.1 Update operation suitable for Oxigraph's update endpoint. */
  readonly update: string;
}

export interface OxigraphCmsHydrationPlan {
  readonly sourceOfTruth: 'Solid LDP/RDF resources';
  readonly targetRole: 'rebuildable SPARQL query environment';
  readonly operations: readonly OxigraphCmsHydrationOperation[];
}

export interface OxigraphCmsHydrationExecutor {
  readonly executeUpdate: (update: string, operation: OxigraphCmsHydrationOperation) => Promise<void>;
}

/**
 * Reads canonical CMS RDF resources from a Solid ResourceStore and creates a deterministic Oxigraph hydration plan.
 *
 * The store remains the source of truth. The returned SPARQL updates only replace named graphs in a query
 * environment, making Oxigraph rebuildable from ordinary pod resources after loss or migration.
 */
export async function createOxigraphCmsHydrationPlanFromSolidStore(
  store: ResourceStore,
  resources: readonly CanonicalCmsRdfResourceDescriptor[],
): Promise<OxigraphCmsHydrationPlan> {
  return createOxigraphCmsHydrationPlan(await Promise.all(resources.map(
    async(resource): Promise<CanonicalCmsRdfResource> => {
      const representation = await store.getRepresentation({ path: resource.path }, { type: { [TURTLE]: 1 }});
      return {
        path: resource.path,
        contentType: TURTLE,
        turtle: await readableToString(representation.data),
      };
    },
  )));
}

/**
 * Converts canonical Solid RDF writes into graph replacement updates for a hydrated SPARQL query environment.
 */
export async function createOxigraphCmsHydrationPlan(
  resources: readonly CanonicalCmsRdfResource[],
): Promise<OxigraphCmsHydrationPlan> {
  const operations = await Promise.all([ ...resources ]
    .sort((left, right): number => left.path.localeCompare(right.path))
    .map(createGraphReplacementOperation));
  return {
    sourceOfTruth: 'Solid LDP/RDF resources',
    targetRole: 'rebuildable SPARQL query environment',
    operations,
  };
}

/**
 * Replays a hydration plan into any SPARQL Update executor.
 *
 * A live Oxigraph endpoint can implement the executor by POSTing each operation's `update` to `/update`; tests
 * and rebuild tooling can use an in-memory executor with the same replacement semantics.
 */
export async function replayOxigraphCmsHydrationPlan(
  plan: OxigraphCmsHydrationPlan,
  executor: OxigraphCmsHydrationExecutor,
): Promise<void> {
  for (const operation of plan.operations) {
    await executor.executeUpdate(operation.update, operation);
  }
}

async function createGraphReplacementOperation(
  resource: CanonicalCmsRdfResource,
): Promise<OxigraphCmsHydrationOperation> {
  if (resource.contentType !== TURTLE) {
    throw new Error(`CMS Oxigraph hydration only supports text/turtle resources, got ${resource.contentType}.`);
  }
  assertAbsoluteIri(resource.path, 'CMS Oxigraph hydration resource path');

  const triples = parseCanonicalTriples(resource);
  const turtle = await serializeTriples(triples);
  const updateParts = [ `DELETE WHERE { GRAPH <${resource.path}> { ?s ?p ?o. } };` ];
  if (triples.length > 0) {
    updateParts.push(
      'INSERT DATA {',
      `  GRAPH <${resource.path}> {`,
      indent(turtle.trim()),
      '  }',
      '}',
    );
  }
  const update = updateParts.join('\n');

  return {
    kind: 'replace-named-graph',
    sourcePath: resource.path,
    graph: resource.path,
    turtle,
    tripleCount: triples.length,
    update,
  };
}

function parseCanonicalTriples(resource: CanonicalCmsRdfResource): Quad[] {
  let quads: Quad[];
  try {
    quads = new Parser({ baseIRI: resource.path }).parse(resource.turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CMS Oxigraph hydration could not parse ${resource.path}: ${message}`);
  }
  if (quads.some((quad): boolean => quad.graph.termType !== 'DefaultGraph')) {
    throw new Error(`CMS Oxigraph hydration resource ${resource.path} must contain Turtle default-graph triples.`);
  }
  return quads
    .map((quad): Quad => DataFactory.quad(quad.subject, quad.predicate, quad.object))
    .sort(compareQuads);
}

function compareQuads(left: Quad, right: Quad): number {
  return [
    termSortKey(left.subject).localeCompare(termSortKey(right.subject)),
    termSortKey(left.predicate).localeCompare(termSortKey(right.predicate)),
    termSortKey(left.object).localeCompare(termSortKey(right.object)),
  ].find((comparison): boolean => comparison !== 0) ?? 0;
}

function termSortKey(term: Term): string {
  if (term.termType === 'Literal') {
    return `${term.termType}:${term.value}:${term.language}:${term.datatype.value}`;
  }
  return `${term.termType}:${term.value}`;
}

async function serializeTriples(quads: readonly Quad[]): Promise<string> {
  const writer = new Writer({ format: 'N-Triples' });
  writer.addQuads([ ...quads ]);
  return new Promise((resolve, reject): void => {
    writer.end((error, result): void => {
      if (error) {
        reject(error);
      } else {
        resolve(typeof result === 'string' ? result : '');
      }
    });
  });
}

function indent(value: string): string {
  return value.split('\n').map((line): string => `    ${line}`).join('\n');
}

function assertAbsoluteIri(value: string, field: string): void {
  if (!URL.canParse(value)) {
    throw new Error(`${field} must be an absolute IRI.`);
  }
}
