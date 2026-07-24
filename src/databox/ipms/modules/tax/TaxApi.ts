import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { TaxComputationInput, TaxReportInput } from './Tax';
import { buildTaxReport, computeTax } from './Tax';

export function registerTaxRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/tax/compute', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, computeTax(input as TaxComputationInput));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid tax computation request.' });
    }
  });

  router.register('POST', '/tax/report', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildTaxReport(input as TaxReportInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid tax report request.' });
    }
  });
}
