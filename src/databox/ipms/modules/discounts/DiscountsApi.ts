import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { DiscountApplicationInput, DiscountCode, DiscountRecordInput } from './Discounts';
import { applyDiscount, buildDiscountRecord } from './Discounts';

export function registerDiscountsRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/discounts/apply', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const body = await readJsonBody<unknown>(request);
      const { discount, application } = body as { discount: DiscountCode; application: DiscountApplicationInput };
      writeJson(response, 200, applyDiscount(discount, application));
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid discount application request.',
      });
    }
  });

  router.register('POST', '/discounts/record', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildDiscountRecord(input as DiscountRecordInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid discount record request.' });
    }
  });
}
