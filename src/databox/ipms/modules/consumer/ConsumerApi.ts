import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { AccessRequestInput } from './AccessRequest';
import { buildAccessRequest } from './AccessRequest';
import type { CorrectionInput } from './CorrectionRequest';
import { buildCorrectionRequest } from './CorrectionRequest';

export function registerConsumerRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/consumer/access-request', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildAccessRequest(input as AccessRequestInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid access request.' });
    }
  });

  router.register(
    'POST',
    '/consumer/correction-request',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        writeJson(response, 200, buildCorrectionRequest(input as CorrectionInput), 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid correction request.' });
      }
    },
  );
}
