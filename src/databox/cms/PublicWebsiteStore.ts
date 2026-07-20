import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { ResourceStore } from '../../storage/ResourceStore';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';
import type { PublicWebsiteFeedRender } from './modules/website/PublicFeedRenderer';

const HTML = 'text/html';
const JSON_LD = 'application/ld+json';
const CSS = 'text/css';

/** Which public website asset a persisted resource carries. */
export type PublicWebsiteResourceRole = 'html' | 'json-ld' | 'theme-css';

/** One public website asset written to the pod, echoed back so a caller can locate the published resource. */
export interface PersistedPublicWebsiteResource {
  readonly iri: string;
  readonly role: PublicWebsiteResourceRole;
  readonly contentType: string;
}

/** Internal description of an asset to write: its role, canonical suffix, body and content type. */
interface PublishableAsset {
  readonly role: PublicWebsiteResourceRole;
  readonly suffix: string;
  readonly content: string;
  readonly contentType: string;
}

/**
 * Publishes the rendered public website assets of a {@link PublicWebsiteFeedRender} as ordinary Solid
 * resources through a CSS {@link ResourceStore} (see `databox/solid-cms-plan.md`, §10.7 / §10.8 / §1.6).
 *
 * The renderer ({@link PublicWebsiteFeedRender}) is the portable core: it emits standard schema.org
 * JSON-LD, semantic HTML and CSS with no Databox-only protocol surface, so a plain Solid client reading
 * the same RDF state can reproduce it (the portable-core degradation, §1.6). This store is the
 * CSS-enhanced *publish* leg that commits those already-rendered assets onto the normal Solid data path,
 * so each one is WAC-governed, backed up *with* the pod, and readable through plain LDP. Each asset is
 * written at its own canonical IRI derived from `baseIri`, which must live inside the configured storage
 * space.
 *
 * Honesty note: this store does NOT write any WAC/ACL resource to make the published assets publicly
 * readable. Making them WAC-public — the www/public plane — is deliberately deferred to the Hosting/ACL
 * work (`databox/solid-cms-plan.md`, §10.7 / §10.8); this leg only commits the resources.
 */
export class PublicWebsiteStore {
  private readonly base: string;

  public constructor(
    private readonly store: ResourceStore,
    baseUrl: string,
  ) {
    this.base = ensureTrailingSlash(new URL(baseUrl).href);
  }

  /**
   * Write every present asset of a render as its own Solid resource under `baseIri`, returning what was
   * committed. Optional assets (e.g. a theme stylesheet) are only written when the render carries them.
   */
  public async publish(
    baseIri: string,
    render: PublicWebsiteFeedRender,
  ): Promise<readonly PersistedPublicWebsiteResource[]> {
    const base = ensureTrailingSlash(this.identifier(baseIri).path);
    const assets: PublishableAsset[] = [
      { role: 'html', suffix: 'index.html', content: render.html, contentType: HTML },
      { role: 'json-ld', suffix: 'data.jsonld', content: JSON.stringify(render.jsonLd), contentType: JSON_LD },
    ];
    if (render.themeCss !== undefined) {
      assets.push({ role: 'theme-css', suffix: 'theme.css', content: render.themeCss.css, contentType: CSS });
    }

    const persisted: PersistedPublicWebsiteResource[] = [];
    for (const asset of assets) {
      const identifier = this.identifier(`${base}${asset.suffix}`);
      await this.store.setRepresentation(identifier, new BasicRepresentation(asset.content, asset.contentType));
      persisted.push({ iri: identifier.path, role: asset.role, contentType: asset.contentType });
    }
    return persisted;
  }

  /**
   * Read a published website resource back as a serialized string, or `undefined` if it is absent. When no
   * content type is requested the resource is returned in its stored type (assets span several types).
   */
  public async load(iri: string, contentType?: string): Promise<string | undefined> {
    const identifier = this.identifier(iri);
    if (!await this.store.hasResource(identifier)) {
      return undefined;
    }
    const preferences = contentType === undefined ? {} : { type: { [contentType]: 1 }};
    const representation = await this.store.getRepresentation(identifier, preferences);
    return readableToString(representation.data);
  }

  private identifier(iri: string): ResourceIdentifier {
    let path: string;
    try {
      path = new URL(iri).href;
    } catch {
      throw new BadRequestHttpError(`A public website resource IRI must be an absolute URI, received ${iri}.`);
    }
    if (!path.startsWith(this.base)) {
      throw new BadRequestHttpError(
        `A public website resource IRI must live inside the pod storage space (${this.base}), received ${path}.`,
      );
    }
    return { path };
  }
}
