import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import { negotiateLocale } from './LocaleNegotiation';

export function registerI18nRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/i18n/negotiate', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ acceptLanguage: string; available: string[]; defaultLocale: string }>(request);
      const locale = negotiateLocale(input.acceptLanguage, input.available, input.defaultLocale);
      writeJson(response, 200, { locale });
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid locale negotiation request.' });
    }
  });
}
