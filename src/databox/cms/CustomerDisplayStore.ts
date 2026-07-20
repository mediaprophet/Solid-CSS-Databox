import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { ResourceStore } from '../../storage/ResourceStore';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';
import type { CustomerDisplayRender } from './modules/website/CustomerDisplayRenderer';

const JSON_LD = 'application/ld+json';
// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';
const LD_VOCAB = '@vocab';
const SCHEMA = 'https://schema.org/';
const SOLID = 'http://www.w3.org/ns/solid/terms#';
const CMS = 'urn:solid-server:databox:cms#';

const DISPLAY_STATE_MODES = [ 'transaction', 'idle', 'advertising' ] as const;
export type CustomerDisplayStateMode = typeof DISPLAY_STATE_MODES[number];

/** Lightweight incremental display state (mode, active slide, transaction status). */
export interface CustomerDisplayStateInput {
  readonly mode: CustomerDisplayStateMode;
  readonly activeSlideId?: string;
  readonly transactionStatus?: string;
  readonly lastUpdatedAt: string;
}

/** One customer-display resource written to the pod, echoed back so a caller can locate the record. */
export interface PersistedCustomerDisplayResource {
  readonly iri: string;
  readonly contentType: typeof JSON_LD;
}

/**
 * Persists a rendered customer-display playlist as an ordinary Solid resource through a CSS
 * {@link ResourceStore} (see `databox/solid-cms-plan.md`, §10.3 / §1.6, real-time customer display).
 *
 * The portable renderer ({@link CustomerDisplayRender}) already produces the display's playlist as a
 * plain, portable object; this store is the CSS-enhanced write leg that commits that playlist onto the
 * normal Solid data path so it is WAC-governed, backed up *with* the pod, and — crucially — readable
 * through plain LDP by any Solid client (the portable-core degradation, §1.4). The playlist object does
 * not carry its own resolvable `@id`, so the caller names the canonical display IRI, which must live
 * inside the configured storage space. The playlist is wrapped in a minimal JSON-LD `@context` so the
 * persisted document round-trips as ordinary RDF rather than an invented dialect (the vanilla-Solid
 * invariant); no term is renamed, the wrapper only maps the existing `id` to `@id` and the remaining
 * camel-case keys onto the schema.org vocabulary.
 */
export class CustomerDisplayStore {
  private readonly base: string;

  public constructor(
    private readonly store: ResourceStore,
    baseUrl: string,
  ) {
    this.base = ensureTrailingSlash(new URL(baseUrl).href);
  }

  /** Write a rendered display's playlist at the caller-provided display IRI, returning what was committed. */
  public async persistPlaylist(
    displayIri: string,
    render: CustomerDisplayRender,
  ): Promise<PersistedCustomerDisplayResource> {
    const identifier = this.identifier(displayIri);
    const document = {
      [LD_CONTEXT]: {
        [LD_VOCAB]: SCHEMA,
        solid: SOLID,
        id: LD_ID,
      },
      [LD_TYPE]: 'PresentationDigitalDocument',
      ...render.playlist,
    };
    await this.store.setRepresentation(
      identifier,
      new BasicRepresentation(JSON.stringify(document), JSON_LD),
    );
    return { iri: identifier.path, contentType: JSON_LD };
  }

  /** Read a persisted display playlist back as a serialized string, or `undefined` if it is absent. */
  public async load(iri: string, contentType: string = JSON_LD): Promise<string | undefined> {
    const identifier = this.identifier(iri);
    if (!await this.store.hasResource(identifier)) {
      return undefined;
    }
    const representation = await this.store.getRepresentation(identifier, { type: { [contentType]: 1 }});
    return readableToString(representation.data);
  }

  /**
   * Write a lightweight display-state document at `{displayIri}/state`, representing the current
   * display mode and active slide without requiring a full playlist re-render. This is the
   * incremental update leg — the display client polls or subscribes to this resource to know
   * "transaction view is active, slide X is showing", while the full playlist resource provides
   * the complete deck when the display initializes or needs a refresh.
   */
  public async persistState(
    displayIri: string,
    state: CustomerDisplayStateInput,
  ): Promise<PersistedCustomerDisplayResource> {
    validateDisplayState(state);
    const stateIri = displayIri.endsWith('/') ? `${displayIri}state` : `${displayIri}/state`;
    const identifier = this.identifier(stateIri);
    const document = {
      [LD_CONTEXT]: {
        [LD_VOCAB]: SCHEMA,
        solid: SOLID,
        cms: CMS,
      },
      [LD_TYPE]: 'UpdateAction',
      [LD_ID]: stateIri,
      actionStatus: 'https://schema.org/CompletedActionStatus',
      name: `customer-display-state:${state.mode}`,
      object: { [LD_ID]: displayIri },
      startTime: state.lastUpdatedAt,
      additionalProperty: [
        { [LD_TYPE]: 'PropertyValue', name: 'mode', value: state.mode },
        ...state.activeSlideId === undefined ?
            [] :
            [{ [LD_TYPE]: 'PropertyValue', name: 'activeSlideId', value: state.activeSlideId }],
        ...state.transactionStatus === undefined ?
            [] :
            [{ [LD_TYPE]: 'PropertyValue', name: 'transactionStatus', value: state.transactionStatus }],
      ],
    };
    await this.store.setRepresentation(
      identifier,
      new BasicRepresentation(JSON.stringify(document), JSON_LD),
    );
    return { iri: identifier.path, contentType: JSON_LD };
  }

  /** Read a persisted display state back, or `undefined` if it is absent. */
  public async loadState(displayIri: string, contentType: string = JSON_LD): Promise<string | undefined> {
    const stateIri = displayIri.endsWith('/') ? `${displayIri}state` : `${displayIri}/state`;
    return this.load(stateIri, contentType);
  }

  private identifier(iri: string): ResourceIdentifier {
    let path: string;
    try {
      path = new URL(iri).href;
    } catch {
      throw new BadRequestHttpError(`A customer display IRI must be an absolute URI, received ${iri}.`);
    }
    if (!path.startsWith(this.base)) {
      throw new BadRequestHttpError(
        `A customer display IRI must live inside the pod storage space (${this.base}), received ${path}.`,
      );
    }
    return { path };
  }
}

function validateDisplayState(state: CustomerDisplayStateInput): void {
  if (!(DISPLAY_STATE_MODES as readonly string[]).includes(state.mode)) {
    throw new BadRequestHttpError(
      `A customer display state mode must be one of: ${DISPLAY_STATE_MODES.join(', ')}.`,
    );
  }
  if (typeof state.lastUpdatedAt !== 'string' || state.lastUpdatedAt.trim().length === 0) {
    throw new BadRequestHttpError('A customer display state requires a lastUpdatedAt timestamp.');
  }
  const parsed = new Date(state.lastUpdatedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestHttpError('A customer display state lastUpdatedAt must be a valid date.');
  }
}
