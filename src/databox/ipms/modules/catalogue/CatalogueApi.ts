import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../IpmsHttpUtils';
import { buildVariants } from './Variants';
import type { VariantInput } from './Variants';

function assertVariantInput(body: unknown): asserts body is VariantInput {
  if (!isRecord(body) || typeof body.productId !== 'string' || !Array.isArray(body.options)) {
    throw new TypeError('A variants request needs a productId string and an options array.');
  }
  for (const option of body.options as Record<string, unknown>[]) {
    if (!isRecord(option) || typeof option.name !== 'string' || !Array.isArray(option.values)) {
      throw new TypeError('Each option needs a name string and a values array.');
    }
    for (const value of option.values) {
      if (typeof value !== 'string') {
        throw new TypeError('Option values must be strings.');
      }
    }
  }
}

export function registerCatalogueRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/catalogue/variants/build', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertVariantInput(body);
      writeJson(response, 200, buildVariants(body));
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid variants request.',
      });
    }
  });
}
