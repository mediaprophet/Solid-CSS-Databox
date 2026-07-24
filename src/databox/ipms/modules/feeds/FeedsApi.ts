import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../IpmsHttpUtils';
import { buildProductFeed } from './ProductFeed';
import type { FeedInput } from './ProductFeed';

function assertFeedInput(body: unknown): asserts body is FeedInput {
  if (!isRecord(body) || !Array.isArray(body.products)) {
    throw new TypeError('A feeds request needs a products array.');
  }
  for (const product of body.products as Record<string, unknown>[]) {
    if (!isRecord(product) || typeof product.id !== 'string' ||
      typeof product.name !== 'string' || typeof product.price !== 'number' ||
      typeof product.currency !== 'string') {
      throw new TypeError('Each product needs an id string, a name string, a price number, and a currency string.');
    }
  }
}

export function registerFeedsRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/feeds/products/build', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertFeedInput(body);
      const feed = buildProductFeed(body);
      writeJson(response, 200, feed, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid feeds request.',
      });
    }
  });
}
