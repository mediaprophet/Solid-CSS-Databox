import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type {
  DriverMatchInput,
  DriverRegistrationInput,
  JobOfferInput,
  JobStatusUpdateInput,
} from './DriverManagement';
import {
  createJobOffer,
  dispatchMatch,
  registerDriver,
  updateJobStatus,
} from './DriverManagement';

export function registerDriverManagementRoutes(
  router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>,
): void {
  router.register(
    'POST',
    '/delivery/driver/register',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        writeJson(response, 200, registerDriver(input as DriverRegistrationInput), 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid driver registration.' });
      }
    },
  );

  router.register('POST', '/delivery/job/offer', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, createJobOffer(input as JobOfferInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid job offer.' });
    }
  });

  router.register('POST', '/delivery/job/status', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, updateJobStatus(input as JobStatusUpdateInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid job status update.' });
    }
  });

  router.register('POST', '/delivery/dispatch/match', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<DriverMatchInput>(request);
      const results = dispatchMatch(input);
      writeJson(response, 200, { results, count: results.length }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid dispatch match request.' });
    }
  });
}
