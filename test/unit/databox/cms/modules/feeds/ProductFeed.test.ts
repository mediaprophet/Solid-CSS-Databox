import { buildProductFeed } from '../../../../../../src/databox/cms/modules/feeds/ProductFeed';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildProductFeed', (): void => {
  it('builds a schema.org ItemList with a ListItem per product.', (): void => {
    const feed = buildProductFeed({
      products: [
        { id: 'p1', name: 'Widget', price: 5, currency: 'AUD' },
        { id: 'p2', name: 'Gadget', price: 3.5, currency: 'AUD' },
      ],
    });

    expect(feed['@context']).toBe('https://schema.org/');
    expect(feed['@type']).toBe('ItemList');

    const elements = feed.itemListElement as unknown[];
    expect(elements).toHaveLength(2);

    const first = record(elements[0]);
    expect(first['@type']).toBe('ListItem');
    expect(first.position).toBe(1);

    const firstItem = record(first.item);
    expect(firstItem['@type']).toBe('Product');
    expect(firstItem['@id']).toBe('p1');
    expect(firstItem.name).toBe('Widget');

    const firstOffer = record(firstItem.offers);
    expect(firstOffer['@type']).toBe('Offer');
    expect(firstOffer.price).toBe('5.00');
    expect(firstOffer.priceCurrency).toBe('AUD');

    const second = record(elements[1]);
    expect(second.position).toBe(2);
    const secondItem = record(second.item);
    expect(secondItem['@id']).toBe('p2');
    const secondOffer = record(secondItem.offers);
    expect(secondOffer.price).toBe('3.50');
  });

  it('rejects an empty product list.', (): void => {
    expect((): unknown => buildProductFeed({ products: []})).toThrow('at least one product');
  });
});
