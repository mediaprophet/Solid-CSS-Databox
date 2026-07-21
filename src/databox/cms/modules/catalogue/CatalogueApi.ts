import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { buildVariants } from './Variants';
import type { VariantInput } from './Variants';

function assertVariantInput(body: unknown): asserts body is VariantInput {
  if (!isRecord(body) || typeof (body as Record<string, unknown>).productId !== 'string' || !Array.isArray((body as Record<string, unknown>).options)) {
    throw new TypeError('A variants request needs a productId string and an options array.');
  }
  for (const option of (body as Record<string, unknown>).options as Record<string, unknown>[]) {
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

export function registerCatalogueRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/catalogue/variants', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertVariantInput(body);
      const variants = buildVariants(body);
      writeJson(response, 201, { variants });
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid variants request.',
      });
    }
  });
}
