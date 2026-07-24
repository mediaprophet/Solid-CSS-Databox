import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../IpmsHttpUtils';
import { buildDeliveryRequest } from './DeliveryRequest';
import type { DeliveryInput } from './DeliveryRequest';

function assertDeliveryInput(body: unknown): asserts body is DeliveryInput {
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    typeof body.order !== 'string' ||
    typeof body.requestedBy !== 'string' ||
    typeof body.pickup !== 'string' ||
    typeof body.dropoff !== 'string'
  ) {
    throw new TypeError('A delivery request needs id, order, requestedBy, pickup, and dropoff strings.');
  }
}

export function registerDeliveryRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/delivery/request', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertDeliveryInput(body);
      const deliveryRender = buildDeliveryRequest(body);
      writeJson(response, 201, deliveryRender, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid delivery request.',
      });
    }
  });
}
