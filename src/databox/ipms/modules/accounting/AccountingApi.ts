import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { AccountingExportInput, AccountingImportInput } from './AccountingBridge';
import { exportToAccounting, importFromAccounting } from './AccountingBridge';

export function registerAccountingRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/accounting/export', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = exportToAccounting(input as AccountingExportInput);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid accounting export request.',
      });
    }
  });

  router.register('POST', '/accounting/import', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = importFromAccounting(input as AccountingImportInput);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid accounting import request.',
      });
    }
  });
}
