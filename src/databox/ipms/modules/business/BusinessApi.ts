import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { DayHours, OpeningHoursInput } from './OpeningHours';
import { buildOpeningHours, isOpen } from './OpeningHours';

export function registerBusinessRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/business/hours/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildOpeningHours(input as OpeningHoursInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid opening hours request.' });
    }
  });

  router.register('POST', '/business/hours/check', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ hours: DayHours[]; day: string; time: string }>(request);
      writeJson(response, 200, { open: isOpen(input.hours, input.day, input.time) });
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid hours check request.' });
    }
  });
}
