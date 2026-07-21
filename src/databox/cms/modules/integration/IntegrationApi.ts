import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { PortableConnectorManifest, PortableConnectorJob } from './ConnectorContract';
import { validatePortableConnectorManifest, validatePortableConnectorJob } from './ConnectorContract';

export function registerIntegrationRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/integration/manifest/validate', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, validatePortableConnectorManifest(input as PortableConnectorManifest));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid connector manifest.' });
    }
  });

  router.register('POST', '/integration/job/validate', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<PortableConnectorJob>(request);
      writeJson(response, 200, validatePortableConnectorJob(input));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid connector job.' });
    }
  });
}
