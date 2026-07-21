import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { ConcessionEligibilityInput, ConcessionPricingInput, ConcessionRecordInput } from './Concessions';
import { evaluateConcessionEligibility, applyConcessionPricing, buildConcessionRecord } from './Concessions';

export function registerConcessionsRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/concessions/eligibility', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, evaluateConcessionEligibility(input as ConcessionEligibilityInput));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid concession eligibility request.' });
    }
  });

  router.register('POST', '/concessions/pricing', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, applyConcessionPricing(input as ConcessionPricingInput));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid concession pricing request.' });
    }
  });

  router.register('POST', '/concessions/record', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildConcessionRecord(input as ConcessionRecordInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid concession record request.' });
    }
  });
}
