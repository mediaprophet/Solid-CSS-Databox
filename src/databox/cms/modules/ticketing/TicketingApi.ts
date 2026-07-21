import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { buildTicket } from './Ticket';
import type { TicketInput } from './Ticket';

function assertTicketInput(body: unknown): asserts body is TicketInput {
  if (
    !isRecord(body) ||
    typeof (body as Record<string, unknown>).id !== 'string' ||
    typeof (body as Record<string, unknown>).event !== 'string' ||
    typeof (body as Record<string, unknown>).holder !== 'string'
  ) {
    throw new TypeError('A ticketing request needs an id, event, and holder strings.');
  }

  if ((body as Record<string, unknown>).seat !== undefined && typeof (body as Record<string, unknown>).seat !== 'string') {
    throw new TypeError('seat must be a string if provided.');
  }
}

export function registerTicketingRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/ticketing/ticket', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertTicketInput(body);
      const ticketRender = buildTicket(body);
      writeJson(response, 201, ticketRender, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid ticketing request.',
      });
    }
  });
}
