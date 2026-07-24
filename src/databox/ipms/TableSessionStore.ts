import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { ResourceStore } from '../../storage/ResourceStore';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';
import type { TableSession, TableSessionResult } from './modules/pos/TableSession';

const JSON_LD = 'application/ld+json';

/** One table session resource written to the pod, echoed back so a caller can locate the record. */
export interface PersistedTableSessionResource {
  readonly iri: string;
  readonly contentType: typeof JSON_LD;
}

/**
 * Persists a POS table session as an ordinary Solid resource through a CSS
 * {@link ResourceStore} (see `databox/solid-ipms-plan.md`, §10.4 / §1.6).
 *
 * The portable table session contract ({@link TableSession}) already yields a standard
 * schema.org JSON-LD record (`FoodEstablishmentReservation`); this store is the CSS-enhanced
 * write leg that commits it onto the normal Solid data path so it is WAC-governed, backed up
 * *with* the pod, and — crucially — readable through plain LDP by any Solid client (the
 * portable-core degradation, §1.4). The record keeps its portable `urn:` `@id`, while the
 * document lives at a canonical pod IRI derived from the table and session ids, which must sit
 * inside the configured storage space. Sessions are grouped in LDP containers per table so
 * they are browsable with vanilla Solid tools.
 */
export class TableSessionStore {
  private readonly base: string;

  public constructor(
    private readonly store: ResourceStore,
    baseUrl: string,
  ) {
    this.base = ensureTrailingSlash(new URL(baseUrl).href);
  }

  /** Write a built table session record as JSON-LD, returning what was committed. */
  public async persistSession(result: TableSessionResult): Promise<PersistedTableSessionResource> {
    const identifier = this.identifier(this.sessionDocumentIri(result.session));
    await this.store.setRepresentation(
      identifier,
      new BasicRepresentation(JSON.stringify(result.record), JSON_LD),
    );
    return { iri: identifier.path, contentType: JSON_LD };
  }

  /** Read a persisted table session back as a serialized string, or `undefined` if absent. */
  public async load(iri: string, contentType: string = JSON_LD): Promise<string | undefined> {
    const identifier = this.identifier(iri);
    if (!await this.store.hasResource(identifier)) {
      return undefined;
    }
    const representation = await this.store.getRepresentation(identifier, { type: { [contentType]: 1 }});
    return readableToString(representation.data);
  }

  /**
   * Write an arbitrary JSON-LD record at a caller-specified IRI inside the pod storage space.
   * Used for standalone Wi-Fi onboarding resources that are table-related but not table sessions.
   */
  public async persistRecord(iri: string, record: Record<string, unknown>): Promise<PersistedTableSessionResource> {
    const identifier = this.identifier(iri);
    await this.store.setRepresentation(
      identifier,
      new BasicRepresentation(JSON.stringify(record), JSON_LD),
    );
    return { iri: identifier.path, contentType: JSON_LD };
  }

  /**
   * Compose the canonical pod document IRI for a table session. Tables group their sessions in
   * an LDP container so the records are browsable as vanilla LDP.
   */
  private sessionDocumentIri(session: TableSession): string {
    const table = encodeURIComponent(session.tableId);
    const sessionId = encodeURIComponent(session.sessionId.split('#')[0]);
    return `${this.base}pos/tables/${table}/sessions/${sessionId}`;
  }

  private identifier(iri: string): ResourceIdentifier {
    let path: string;
    try {
      path = new URL(iri).href;
    } catch {
      throw new BadRequestHttpError(`A table session resource IRI must be an absolute URI, received ${iri}.`);
    }
    if (!path.startsWith(this.base)) {
      throw new BadRequestHttpError(
        `A table session resource IRI must live inside the pod storage space (${this.base}), received ${path}.`,
      );
    }
    return { path };
  }
}
