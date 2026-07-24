import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type {
  InterOrgPrintJobInput,
  PrintJobInput,
  PrintJobStatusUpdateInput,
  PrintServiceInput,
} from './PrintShop';
import {
  createInterOrgPrintJob,
  createPrintJob,
  createPrintService,
  updatePrintJobStatus,
} from './PrintShop';

export function registerPrintShopRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/print/service/create', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, createPrintService(input as PrintServiceInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid print service request.' });
    }
  });

  router.register('POST', '/print/job/create', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, createPrintJob(input as PrintJobInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid print job request.' });
    }
  });

  router.register('POST', '/print/job/status', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, updatePrintJobStatus(input as PrintJobStatusUpdateInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid print job status update.' });
    }
  });

  router.register('POST', '/print/inter-org/submit', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, createInterOrgPrintJob(input as InterOrgPrintJobInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid inter-org print job request.',
      });
    }
  });
}
