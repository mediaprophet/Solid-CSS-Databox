import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { A11yInput } from './Audit';
import { auditAccessibility } from './Audit';

export function registerA11yRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/a11y/audit', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, auditAccessibility(input as A11yInput));
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid accessibility audit request.',
      });
    }
  });
}
