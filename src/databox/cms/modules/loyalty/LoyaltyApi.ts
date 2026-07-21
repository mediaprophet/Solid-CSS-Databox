import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { LoyaltyInput, LoyaltyRecordInput } from './Loyalty';
import { applyLoyalty, buildLoyaltyRecord } from './Loyalty';

export function registerLoyaltyRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/loyalty/apply', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, applyLoyalty(input as LoyaltyInput));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid loyalty request.' });
    }
  });

  router.register('POST', '/loyalty/record', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildLoyaltyRecord(input as LoyaltyRecordInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid loyalty record request.' });
    }
  });
}
