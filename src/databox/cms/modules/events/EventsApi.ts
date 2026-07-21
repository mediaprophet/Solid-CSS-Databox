import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { buildEvent } from './Event';
import type { EventInput } from './Event';

function assertEventInput(body: unknown): asserts body is EventInput {
  if (
    !isRecord(body) ||
    typeof (body as Record<string, unknown>).id !== 'string' ||
    typeof (body as Record<string, unknown>).name !== 'string' ||
    typeof (body as Record<string, unknown>).startDate !== 'string'
  ) {
    throw new TypeError('An events request needs an id, name, and startDate strings.');
  }

  if ((body as Record<string, unknown>).endDate !== undefined && typeof (body as Record<string, unknown>).endDate !== 'string') {
    throw new TypeError('endDate must be a string if provided.');
  }
  if ((body as Record<string, unknown>).location !== undefined && typeof (body as Record<string, unknown>).location !== 'string') {
    throw new TypeError('location must be a string if provided.');
  }
  if ((body as Record<string, unknown>).organizer !== undefined && typeof (body as Record<string, unknown>).organizer !== 'string') {
    throw new TypeError('organizer must be a string if provided.');
  }
}

export function registerEventsRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/events/event', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertEventInput(body);
      const eventRender = buildEvent(body);
      writeJson(response, 201, eventRender, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid events request.',
      });
    }
  });
}
