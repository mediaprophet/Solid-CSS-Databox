import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { HostingInput } from './HostingConfig';
import { planHosting } from './HostingConfig';

export function registerHostingRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/hosting/plan', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertHostingInput(input);
      writeJson(response, 200, planHosting(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid hosting plan request.' });
    }
  });
}

function assertHostingInput(value: unknown): asserts value is HostingInput {
  if (!isRecord(value)) {
    throw new TypeError('A hosting plan request must be a JSON object.');
  }
}
