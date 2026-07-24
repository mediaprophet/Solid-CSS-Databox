import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { CashRegisterStore } from '../../../../src/databox/ipms/CashRegisterStore';
import { openCashRegisterSession } from '../../../../src/databox/ipms/modules/pos/CashRegister';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const baseUrl = 'http://localhost:3000/';
const sessionIri = `${baseUrl}pos/registers/reg-1/sessions/s-1`;

function openInput(overrides: Record<string, unknown> = {}): Parameters<typeof openCashRegisterSession>[0] {
  return {
    sessionId: 's-1',
    registerId: 'reg-1',
    registerName: 'Front register',
    registerLocation: 'Counter A',
    operatorSession: {
      sessionId: 'op-1',
      webId: 'https://op.example/profile/card#me',
      roleIri: 'https://op.example/roles/cashier',
      startedAt: '2026-07-19T10:00:00.000Z',
    },
    openedAt: '2026-07-19T11:00:00.000Z',
    currency: 'AUD',
    openingFloat: 100,
    ...overrides,
  };
}

describe('A CashRegisterStore', (): void => {
  let data: Map<string, { content: string; contentType: string }>;
  let store: CashRegisterStore;

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
    store = new CashRegisterStore(resourceStore, baseUrl);
  });

  it('persists a session record as a JSON-LD resource at its canonical pod IRI.', async(): Promise<void> => {
    const result = openCashRegisterSession(openInput());
    const persisted = await store.persistSession(result);

    expect(persisted.iri).toBe(sessionIri);
    expect(persisted.contentType).toBe('application/ld+json');
    expect(data.get(sessionIri)?.contentType).toBe('application/ld+json');
    expect(data.get(sessionIri)?.content).toContain('Front register');
    expect(data.get(sessionIri)?.content)
      .toContain('urn:solid-server:databox:ipms:pos:cash-register-session:s-1');
  });

  it('loads a persisted session back as a serialized string.', async(): Promise<void> => {
    await store.persistSession(openCashRegisterSession(openInput()));
    const loaded = await store.load(sessionIri);
    expect(loaded).toContain('Front register');
  });

  it('returns undefined when loading a session that was never written.', async(): Promise<void> => {
    await expect(store.load(`${baseUrl}pos/registers/reg-1/sessions/absent`)).resolves.toBeUndefined();
  });

  it('rejects a session IRI outside the pod storage space.', async(): Promise<void> => {
    await expect(store.load('https://elsewhere.example/pos/registers/reg-1/sessions/s-1'))
      .rejects.toThrow('must live inside the pod storage space');
  });

  it('rejects a non-absolute session IRI on load.', async(): Promise<void> => {
    await expect(store.load('/pos/registers/reg-1/sessions/s-1')).rejects.toThrow('must be an absolute URI');
  });
});
