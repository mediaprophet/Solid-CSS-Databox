import { Parser } from 'n3';
import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { ResourceStore } from '../../storage/ResourceStore';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';

const CMS_ENABLED = 'urn:solid-server:databox:cms#enabled';
const TURTLE = 'text/turtle';

/**
 * Persists a CMS module's state (its enabled flag and config graph) as an ordinary Solid resource
 * (see `databox/solid-cms-plan.md`, §5.1 / §1.6). Module state lives in the pod as RDF — so it is
 * declarative, WAC-governed, backed up *with* the pod, and portable — rather than in a side store.
 * All reads and writes go through a CSS {@link ResourceStore}, keeping module state on the normal
 * Solid data path.
 */
export class ModuleConfigStore {
  private readonly container: string;

  public constructor(
    private readonly store: ResourceStore,
    baseUrl: string,
  ) {
    this.container = `${ensureTrailingSlash(new URL(baseUrl).href)}.databox/cms/modules/`;
  }

  /** Write a module's state graph (Turtle) as its Solid resource. */
  public async save(id: string, turtle: string): Promise<void> {
    await this.store.setRepresentation(this.identifier(id), new BasicRepresentation(turtle, TURTLE));
  }

  /** Read a module's state graph as Turtle, or `undefined` if it has none yet. */
  public async load(id: string): Promise<string | undefined> {
    const identifier = this.identifier(id);
    if (!await this.store.hasResource(identifier)) {
      return undefined;
    }
    const representation = await this.store.getRepresentation(identifier, { type: { [TURTLE]: 1 }});
    return readableToString(representation.data);
  }

  /** Set the enabled flag, persisting it as the module's state graph. */
  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.save(id, `<> <${CMS_ENABLED}> ${enabled ? 'true' : 'false'} .`);
  }

  /** Whether the module is enabled (defaults to `false` when no state, or no flag, is stored). */
  public async isEnabled(id: string): Promise<boolean> {
    const turtle = await this.load(id);
    if (turtle === undefined) {
      return false;
    }
    return new Parser({ baseIRI: this.container }).parse(turtle)
      .some((quad): boolean => quad.predicate.value === CMS_ENABLED && quad.object.value === 'true');
  }

  private identifier(id: string): ResourceIdentifier {
    return { path: `${this.container}${id}` };
  }
}
