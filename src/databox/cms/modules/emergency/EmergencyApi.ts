import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { BreakGlassPolicy, BreakGlassRequest } from './BreakGlass';
import { evaluateBreakGlass } from './BreakGlass';

export function registerEmergencyRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/emergency/break-glass', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ policy: BreakGlassPolicy; request: BreakGlassRequest }>(request);
      const decision = evaluateBreakGlass(input.policy, input.request);
      writeJson(response, 200, decision, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid break-glass request.' });
    }
  });
}
