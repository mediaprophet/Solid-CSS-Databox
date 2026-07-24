import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { DelegationInput } from './Delegation';
import { buildDelegation, isDelegationValid } from './Delegation';

export function registerDelegationRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/delegation/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildDelegation(input as DelegationInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid delegation request.' });
    }
  });

  router.register('POST', '/delegation/validate', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ grant: DelegationInput; action: string; asOfIso: string }>(request);
      const valid = isDelegationValid(input.grant, input.action, input.asOfIso);
      writeJson(response, 200, { valid });
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid delegation validation request.',
      });
    }
  });
}
