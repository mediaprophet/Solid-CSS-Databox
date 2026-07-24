import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { buildWaiterOrderingFlow } from '../../../../src/databox/ipms/modules/pos/CustomerOrdering';
import { PosOrderStore } from '../../../../src/databox/ipms/PosOrderStore';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const baseUrl = 'http://localhost:3000/';

function flowInput(overrides: Record<string, unknown> = {}): Parameters<typeof buildWaiterOrderingFlow>[0] {
  return {
    cartId: `${baseUrl}pos/carts/c-1`,
    orderId: `${baseUrl}pos/orders/o-1`,
    ticketId: `${baseUrl}pos/tickets/t-1`,
    orderNumber: 'O-1',
    ticketNumber: 'T-1',
    seller: `${baseUrl}profile/card#org`,
    currency: 'AUD',
    createdAt: '2026-07-19T11:00:00.000Z',
    lines: [{
      lineId: 'line-1',
      product: `${baseUrl}catalogue/flat-white#item`,
      name: 'Flat white',
      quantity: 2,
      unitPrice: 4.8,
    }],
    serviceMode: 'table',
    ...overrides,
  };
}

describe('A PosOrderStore', (): void => {
  let data: Map<string, { content: string; contentType: string }>;
  let store: PosOrderStore;

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
    store = new PosOrderStore(resourceStore, baseUrl);
  });

  it('persists the cart, order and ticket of a flow as JSON-LD resources.', async(): Promise<void> => {
    const flow = buildWaiterOrderingFlow(flowInput());
    const persisted = await store.persistFlow(flow);

    expect(persisted.map((resource): string => resource.role)).toEqual([ 'cart', 'order', 'ticket' ]);
    expect(persisted.every((resource): boolean => resource.contentType === 'application/ld+json')).toBe(true);
    expect(data.get(`${baseUrl}pos/orders/o-1`)?.contentType).toBe('application/ld+json');
    expect(data.get(`${baseUrl}pos/orders/o-1`)?.content).toContain('"O-1"');
    for (const resource of persisted) {
      const stored = JSON.parse(data.get(resource.iri)?.content ?? '{}');
      expect(stored['@context']).toEqual({ '@vocab': 'https://schema.org/' });
    }
  });

  it('loads a persisted resource back as a serialized string.', async(): Promise<void> => {
    const flow = buildWaiterOrderingFlow(flowInput());
    await store.persistFlow(flow);
    const loaded = await store.load(`${baseUrl}pos/orders/o-1`);
    expect(loaded).toContain('O-1');
  });

  it('returns undefined when loading a resource that was never written.', async(): Promise<void> => {
    await expect(store.load(`${baseUrl}pos/orders/absent`)).resolves.toBeUndefined();
  });

  it('does not write fragment resources (e.g. a customer-vault-connection) as standalone resources.', async():
  Promise<void> => {
    const flow = buildWaiterOrderingFlow(flowInput({
      customer: { mode: 'solid-vault-linked', customerWebId: `${baseUrl}alice/profile/card#me` },
    }));
    const persisted = await store.persistFlow(flow);
    expect(persisted.some((resource): boolean => resource.iri.includes('#'))).toBe(false);
    expect([ ...data.keys() ].some((key): boolean => key.includes('#'))).toBe(false);
  });

  it('rejects a resource IRI outside the pod storage space.', async(): Promise<void> => {
    const flow = buildWaiterOrderingFlow(flowInput({ orderId: 'https://elsewhere.example/orders/o-1' }));
    await expect(store.persistFlow(flow)).rejects.toThrow('must live inside the pod storage space');
  });

  it('rejects a non-absolute resource IRI on load.', async(): Promise<void> => {
    await expect(store.load('/pos/orders/o-1')).rejects.toThrow('must be an absolute URI');
  });
});
