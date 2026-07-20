import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { CustomerDisplayStore } from '../../../../src/databox/cms/CustomerDisplayStore';
import type { CustomerDisplayInput } from '../../../../src/databox/cms/modules/website/CustomerDisplayRenderer';
import { renderCustomerDisplay } from '../../../../src/databox/cms/modules/website/CustomerDisplayRenderer';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const baseUrl = 'http://localhost:3000/';
const displayIri = `${baseUrl}pos/display`;

function displayInput(overrides: Partial<CustomerDisplayInput> = {}): CustomerDisplayInput {
  return {
    business: { id: `${baseUrl}profile/card#org`, name: 'Corner Cafe' },
    transaction: {
      id: `${baseUrl}pos/orders/o-1`,
      orderNumber: 'O-1',
      status: 'pending-payment',
      currency: 'AUD',
      lines: [{ name: 'Flat white', quantity: 2, unitPrice: 4.8 }],
      subtotal: 9.6,
      total: 9.6,
    },
    links: {
      shopAppInstallUrl: 'https://apps.example/shop',
      solidVaultConnectUrl: 'https://vault.example/connect',
    },
    slides: [{ id: `${baseUrl}ads/welcome#slide`, title: 'Welcome' }],
    generatedAt: '2026-07-19T11:00:00.000Z',
    ...overrides,
  };
}

describe('A CustomerDisplayStore', (): void => {
  let data: Map<string, { content: string; contentType: string }>;
  let store: CustomerDisplayStore;

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
    store = new CustomerDisplayStore(resourceStore, baseUrl);
  });

  it('persists a rendered playlist as a JSON-LD resource at the given display IRI.', async(): Promise<void> => {
    const render = renderCustomerDisplay(displayInput());
    const persisted = await store.persistPlaylist(displayIri, render);

    expect(persisted).toEqual({ iri: displayIri, contentType: 'application/ld+json' });
    expect(data.get(displayIri)?.contentType).toBe('application/ld+json');
    const stored = JSON.parse(data.get(displayIri)?.content ?? '{}');
    expect(stored['@context']['@vocab']).toBe('https://schema.org/');
    expect(stored['@type']).toBe('PresentationDigitalDocument');
    expect(stored.id).toBe(render.playlist.id);
    expect(stored.slides).toHaveLength(render.playlist.slides.length);
  });

  it('loads a persisted playlist back as a serialized string.', async(): Promise<void> => {
    const render = renderCustomerDisplay(displayInput());
    await store.persistPlaylist(displayIri, render);
    const loaded = await store.load(displayIri);
    expect(loaded).toContain(render.playlist.title);
  });

  it('returns undefined when loading a display that was never written.', async(): Promise<void> => {
    await expect(store.load(`${baseUrl}pos/display-absent`)).resolves.toBeUndefined();
  });

  it('rejects a display IRI outside the pod storage space.', async(): Promise<void> => {
    const render = renderCustomerDisplay(displayInput());
    await expect(store.persistPlaylist('https://elsewhere.example/display', render))
      .rejects.toThrow('must live inside the pod storage space');
  });

  it('rejects a non-absolute display IRI on load.', async(): Promise<void> => {
    await expect(store.load('/pos/display')).rejects.toThrow('must be an absolute URI');
  });
});
