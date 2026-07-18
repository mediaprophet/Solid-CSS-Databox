import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface FeedProduct {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly currency: string;
}

export interface FeedInput {
  readonly products: readonly FeedProduct[];
}

/**
 * Build a product feed as a schema.org `ItemList` JSON-LD document (see
 * `databox/solid-cms-plan.md`, §10.8). Pure and deterministic.
 */
export function buildProductFeed(input: FeedInput): Record<string, unknown> {
  if (input.products.length === 0) {
    throw new BadRequestHttpError('A product feed needs at least one product.');
  }

  const itemListElement = input.products.map((product, index): Record<string, unknown> => ({
    [LD_TYPE]: 'ListItem',
    position: index + 1,
    item: {
      [LD_TYPE]: 'Product',
      [LD_ID]: product.id,
      name: product.name,
      offers: {
        [LD_TYPE]: 'Offer',
        price: product.price.toFixed(2),
        priceCurrency: product.currency,
      },
    },
  }));

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'ItemList',
    itemListElement,
  };
}
