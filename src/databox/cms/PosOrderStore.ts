import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { ResourceStore } from '../../storage/ResourceStore';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';
import type {
  CustomerOrderingFlow,
  CustomerOrderingResourceDescriptor,
} from './modules/pos/CustomerOrdering';

const JSON_LD = 'application/ld+json';

/** One POS resource written to the pod, echoed back so a caller can locate the canonical record. */
export interface PersistedPosResource {
  readonly iri: string;
  readonly role: CustomerOrderingResourceDescriptor['role'];
  readonly contentType: typeof JSON_LD;
}

/**
 * Persists a POS ordering flow's cart, order, ticket and onboarding records as ordinary Solid
 * resources through a CSS {@link ResourceStore} (see `databox/solid-cms-plan.md`, §10.4 / §1.6).
 *
 * The portable POS contracts ({@link CustomerOrderingFlow}) already yield standard schema.org
 * JSON-LD records; this store is the CSS-enhanced write leg that commits them onto the normal Solid
 * data path so they are WAC-governed, backed up *with* the pod, and — crucially — readable through
 * plain LDP by any Solid client (the portable-core degradation, §1.4). Each record is written at its
 * own canonical IRI, which must live inside the configured storage space; fragment resources (e.g. a
 * `#customer-vault-connection`) travel inside their parent document and are not written standalone.
 */
export class PosOrderStore {
  private readonly base: string;

  public constructor(
    private readonly store: ResourceStore,
    baseUrl: string,
  ) {
    this.base = ensureTrailingSlash(new URL(baseUrl).href);
  }

  /** Write every standalone resource of a built ordering flow, returning what was committed. */
  public async persistFlow(flow: CustomerOrderingFlow): Promise<PersistedPosResource[]> {
    const persisted: PersistedPosResource[] = [];
    for (const resource of flow.resources) {
      // Fragment identifiers name a node inside another document, not a standalone LDP resource.
      if (resource.iri.includes('#')) {
        continue;
      }
      const identifier = this.identifier(resource.iri);
      await this.store.setRepresentation(
        identifier,
        new BasicRepresentation(JSON.stringify(resource.record), JSON_LD),
      );
      persisted.push({ iri: identifier.path, role: resource.role, contentType: JSON_LD });
    }
    return persisted;
  }

  /** Read a persisted POS resource back as a serialized string, or `undefined` if it is absent. */
  public async load(iri: string, contentType: string = JSON_LD): Promise<string | undefined> {
    const identifier = this.identifier(iri);
    if (!await this.store.hasResource(identifier)) {
      return undefined;
    }
    const representation = await this.store.getRepresentation(identifier, { type: { [contentType]: 1 }});
    return readableToString(representation.data);
  }

  private identifier(iri: string): ResourceIdentifier {
    let path: string;
    try {
      path = new URL(iri).href;
    } catch {
      throw new BadRequestHttpError(`A POS resource IRI must be an absolute URI, received ${iri}.`);
    }
    if (!path.startsWith(this.base)) {
      throw new BadRequestHttpError(
        `A POS resource IRI must live inside the pod storage space (${this.base}), received ${path}.`,
      );
    }
    return { path };
  }
}
