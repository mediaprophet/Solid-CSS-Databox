import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { ResourceStore } from '../../storage/ResourceStore';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';
import type {
  CashRegisterSession,
  CashRegisterSessionResult,
} from './modules/pos/CashRegister';

const JSON_LD = 'application/ld+json';

/** One cash register session written to the pod, echoed back so a caller can locate the record. */
export interface PersistedCashRegisterResource {
  readonly iri: string;
  readonly contentType: typeof JSON_LD;
}

/**
 * Persists a POS cash register session as an ordinary Solid resource through a CSS
 * {@link ResourceStore} (see `databox/solid-ipms-plan.md`, §10.4 / §1.6).
 *
 * The portable cash register contract ({@link CashRegisterSession}) already yields a standard
 * schema.org JSON-LD record (`toCashRegisterSessionRecord`); this store is the CSS-enhanced write
 * leg that commits it onto the normal Solid data path so it is WAC-governed, backed up *with* the
 * pod, and — crucially — readable through plain LDP by any Solid client (the portable-core
 * degradation, §1.4). The record keeps its portable `urn:` `@id`, while the document lives at a
 * canonical pod IRI derived from the register and session ids, which must sit inside the configured
 * storage space. A session id is a safe id (not a URL), so the document IRI is composed here rather
 * than taken verbatim; any `#fragment` is dropped since a fragment names a node inside a document.
 */
export class CashRegisterStore {
  private readonly base: string;

  public constructor(
    private readonly store: ResourceStore,
    baseUrl: string,
  ) {
    this.base = ensureTrailingSlash(new URL(baseUrl).href);
  }

  /** Write a built cash register session record as JSON-LD, returning what was committed. */
  public async persistSession(result: CashRegisterSessionResult): Promise<PersistedCashRegisterResource> {
    const identifier = this.identifier(this.sessionDocumentIri(result.session));
    await this.store.setRepresentation(
      identifier,
      new BasicRepresentation([ Buffer.from(JSON.stringify(result.record), 'utf-8') ], JSON_LD),
    );
    return { iri: identifier.path, contentType: JSON_LD };
  }

  /** Read a persisted cash register session back as a serialized string, or `undefined` if absent. */
  public async load(iri: string, contentType: string = JSON_LD): Promise<string | undefined> {
    const identifier = this.identifier(iri);
    if (!await this.store.hasResource(identifier)) {
      return undefined;
    }
    const representation = await this.store.getRepresentation(identifier, { type: { [contentType]: 1 }});
    return readableToString(representation.data);
  }

  /**
   * Compose the canonical pod document IRI for a session. The register groups its sessions in a
   * container so the records are browsable as vanilla LDP; a `#fragment` is never part of a document.
   */
  private sessionDocumentIri(session: CashRegisterSession): string {
    const register = encodeURIComponent(session.registerId);
    const sessionId = encodeURIComponent(session.sessionId.split('#')[0]);
    return `${this.base}pos/registers/${register}/sessions/${sessionId}`;
  }

  private identifier(iri: string): ResourceIdentifier {
    let path: string;
    try {
      path = new URL(iri).href;
    } catch {
      throw new BadRequestHttpError(`A cash register resource IRI must be an absolute URI, received ${iri}.`);
    }
    if (!path.startsWith(this.base)) {
      throw new BadRequestHttpError(
        `A cash register resource IRI must live inside the pod storage space (${this.base}), received ${path}.`,
      );
    }
    return { path };
  }
}
