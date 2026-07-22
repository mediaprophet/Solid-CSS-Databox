import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type {
  DonationCampaign,
  DonationInput,
  DonationReceiptInput,
  DonationTransparencyReportInput,
} from './Donations';
import { buildDonationReceipt, buildTransparencyReport, processDonation } from './Donations';

export function registerDonationsRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/donations/process', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const body = await readJsonBody<unknown>(request);
      const { campaign, donation } = body as { campaign: DonationCampaign; donation: DonationInput };
      writeJson(response, 200, processDonation(campaign, donation));
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid donation request.' });
    }
  });

  router.register('POST', '/donations/receipt', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildDonationReceipt(input as DonationReceiptInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid donation receipt request.' });
    }
  });

  router.register('POST', '/donations/transparency', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildTransparencyReport(
        input as DonationTransparencyReportInput,
      ), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid donation transparency report request.',
      });
    }
  });
}
