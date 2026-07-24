import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { TableSessionStore } from '../../../../src/databox/ipms/TableSessionStore';
import { openTableSession } from '../../../../src/databox/ipms/modules/pos/TableSession';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const baseUrl = 'http://localhost:3000/';
const sessionIri = `${baseUrl}pos/tables/table-5/sessions/ts-1`;

function openInput(overrides: Record<string, unknown> = {}): Parameters<typeof openTableSession>[0] {
  return {
    sessionId: 'ts-1',
    tableId: 'table-5',
    tableLabel: 'Table 5 (window)',
    state: 'occupied',
    shopId: 'http://localhost:3000/profile/card#org',
    startedAt: '2026-07-19T11:00:00.000Z',
    ...overrides,
  };
}

describe('A TableSessionStore', (): void => {
  let data: Map<string, { content: string; contentType: string }>;
  let store: TableSessionStore;

  beforeEach((): void => {
    data = new Map<string, { content: string; contentType: string }>();
    const resourceStore = {
      hasResource: async(id: ResourceIdentifier): Promise<boolean> => data.has(id.path),
      getRepresentation: async(id: ResourceIdentifier): Promise<Representation> => {
        const entry = data.get(id.path);
        return new BasicRepresentation(entry?.content ?? '', entry?.contentType ?? 'application/ld+json');
      },
      setRepresentation: async(id: ResourceIdentifier, representation: Representation): Promise<void> => {
        data.set(id.path, {
          content: await readableToString(representation.data),
          contentType: representation.metadata.contentType ?? 'application/ld+json',
        });
      },
    } as unknown as ResourceStore;
    store = new TableSessionStore(resourceStore, baseUrl);
  });

  it('persists a session record as a JSON-LD resource at its canonical pod IRI.', async(): Promise<void> => {
    const result = openTableSession(openInput());
    const persisted = await store.persistSession(result);

    expect(persisted.iri).toBe(sessionIri);
    expect(persisted.contentType).toBe('application/ld+json');
    expect(data.get(sessionIri)?.contentType).toBe('application/ld+json');
    expect(data.get(sessionIri)?.content).toContain('Table 5 (window)');
    expect(data.get(sessionIri)?.content)
      .toContain('urn:solid-server:databox:ipms:pos:table-session:ts-1');
  });

  it('loads a persisted session back as a serialized string.', async(): Promise<void> => {
    await store.persistSession(openTableSession(openInput()));
    const loaded = await store.load(sessionIri);
    expect(loaded).toContain('Table 5 (window)');
  });

  it('returns undefined when loading a session that was never written.', async(): Promise<void> => {
    await expect(store.load(`${baseUrl}pos/tables/table-5/sessions/absent`)).resolves.toBeUndefined();
  });

  it('rejects a session IRI outside the pod storage space.', async(): Promise<void> => {
    await expect(store.load('https://elsewhere.example/pos/tables/table-5/sessions/ts-1'))
      .rejects.toThrow('must live inside the pod storage space');
  });

  it('rejects a non-absolute session IRI on load.', async(): Promise<void> => {
    await expect(store.load('/pos/tables/table-5/sessions/ts-1')).rejects.toThrow('must be an absolute URI');
  });

  it('persists an arbitrary record via persistRecord.', async(): Promise<void> => {
    const iri = `${baseUrl}pos/wifi/onboarding-1`;
    const record = { '@type': 'EntryPoint', '@id': iri, name: 'test' };
    const persisted = await store.persistRecord(iri, record);
    expect(persisted.iri).toBe(iri);
    expect(data.get(iri)?.content).toContain('EntryPoint');
  });

  it('rejects a persistRecord IRI outside the pod space.', async(): Promise<void> => {
    await expect(store.persistRecord('https://elsewhere.example/wifi/x', { name: 'bad' }))
      .rejects.toThrow('must live inside the pod storage space');
  });
});
