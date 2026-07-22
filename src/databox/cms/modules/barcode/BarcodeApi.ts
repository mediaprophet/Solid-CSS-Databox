import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { BarcodeScanInput } from './BarcodeScanner';
import { lookupProductByGtin, processBarcodeScan } from './BarcodeScanner';

export function registerBarcodeRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/barcode/scan', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = processBarcodeScan(input as BarcodeScanInput);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid barcode scan request.' });
    }
  });

  router.register('POST', '/barcode/lookup', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{
        gtin: string;
        catalogue: { productId: string; gtin?: string; name: string }[];
      }>(request);
      const result = lookupProductByGtin(input.gtin, input.catalogue);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid product lookup request.' });
    }
  });
}
