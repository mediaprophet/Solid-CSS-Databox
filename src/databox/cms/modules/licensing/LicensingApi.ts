import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { buildLicence, isActionPermitted } from './Licence';
import type { LicenceInput } from './Licence';

function assertLicenceInput(body: unknown): asserts body is LicenceInput {
  if (
    !isRecord(body) ||
    typeof (body as Record<string, unknown>).id !== 'string' ||
    typeof (body as Record<string, unknown>).asset !== 'string' ||
    typeof (body as Record<string, unknown>).assignee !== 'string' ||
    !Array.isArray((body as Record<string, unknown>).permittedActions)
  ) {
    throw new TypeError('A licensing request needs id, asset, assignee strings, and permittedActions array.');
  }

  for (const action of (body as Record<string, unknown>).permittedActions as unknown[]) {
    if (typeof action !== 'string') throw new TypeError('Each permitted action must be a string.');
  }

  if ((body as Record<string, unknown>).prohibitedActions !== undefined) {
    if (!Array.isArray((body as Record<string, unknown>).prohibitedActions)) {
      throw new TypeError('prohibitedActions must be an array if provided.');
    }
    for (const action of (body as Record<string, unknown>).prohibitedActions as unknown[]) {
      if (typeof action !== 'string') throw new TypeError('Each prohibited action must be a string.');
    }
  }
}

export function registerLicensingRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/licensing/licence', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertLicenceInput(body);
      const licenceRender = buildLicence(body);
      writeJson(response, 201, licenceRender, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid licensing request.',
      });
    }
  });

  router.register('POST', '/licensing/permit', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      if (!isRecord(body) || typeof (body as Record<string, unknown>).action !== 'string' || !isRecord((body as Record<string, unknown>).licence)) {
        throw new TypeError('A permit request needs a licence object and an action string.');
      }
      const licence = (body as Record<string, unknown>).licence as unknown;
      assertLicenceInput(licence);
      
      const permitted = isActionPermitted(licence, (body as Record<string, unknown>).action as string);
      writeJson(response, 200, { permitted });
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid permit check request.',
      });
    }
  });
}
