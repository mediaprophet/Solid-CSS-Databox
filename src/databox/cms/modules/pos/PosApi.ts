import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import type { PosOrderStore } from '../../PosOrderStore';
import type { CashRegisterStore } from '../../CashRegisterStore';
import type { CustomerDisplayStateInput, CustomerDisplayStore } from '../../CustomerDisplayStore';
import { renderCustomerDisplay } from '../website/CustomerDisplayRenderer';
import type { CustomerDisplayInput } from '../website/CustomerDisplayRenderer';
import type { TableSessionStore } from '../../TableSessionStore';
import { errorStatusCode, isRecord, readJsonBody, readPersistedResource, writeJson } from '../../CmsHttpUtils';
import type { CashRegisterCloseInput, CashRegisterOpenInput } from './CashRegister';
import { closeCashRegisterSession, openCashRegisterSession } from './CashRegister';

import type { TableSessionCloseInput, TableSessionInput } from './TableSession';
import { buildStandaloneWifiOnboarding, closeTableSession, openTableSession } from './TableSession';
import { buildCustomerSelfOrderingFlow, buildWaiterOrderingFlow } from './CustomerOrdering';
import type { CustomerOrderingFlowInput } from './CustomerOrdering';

export function registerPosRoutes(
  router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>,
  orderStore?: PosOrderStore,
  cashRegisterStore?: CashRegisterStore,
  customerDisplayStore?: CustomerDisplayStore,
  tableSessionStore?: TableSessionStore,
): void {
  router.register('POST', '/pos/orders', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!orderStore) {
        throw new Error('Persisting POS orders requires a PosOrderStore.');
      }
      const input = await readJsonBody<unknown>(request);
      const flow = buildOrderingFlowFromRequest(input);
      const persisted = await orderStore.persistFlow(flow);
      writeJson(response, 201, {
        channel: flow.channel,
        status: flow.status,
        persisted,
        cart: flow.cart.record,
        order: flow.order.record,
        ticket: flow.ticket.record,
        intent: flow.intent,
      }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid POS order request.',
      });
    }
  });
  router.register('GET', '/pos/orders', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!orderStore) {
        throw new Error('Reading POS orders requires a PosOrderStore.');
      }
      const iri = new URL(request.url ?? '/', 'http://localhost').searchParams.get('iri');
      if (iri === null || iri.length === 0) {
        throw new Error('A POS order read requires an ?iri= query parameter.');
      }
      const record = await orderStore.load(iri);
      if (record === undefined) {
        writeJson(response, 404, { error: 'pos-resource-not-found' });
        return;
      }
      writeJson(response, 200, JSON.parse(record), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid POS order read request.',
      });
    }
  });
  router.register('POST', '/pos/register/sessions', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!cashRegisterStore) {
        throw new Error('Persisting cash register sessions requires a CashRegisterStore.');
      }
      const result = openCashRegisterSession(await readJsonBody<CashRegisterOpenInput>(request));
      const persisted = await cashRegisterStore.persistSession(result);
      writeJson(response, 201, { persisted, session: result.record }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid cash register open request.',
      });
    }
  });
  router.register(
    'POST',
    '/pos/register/sessions/close',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        if (!cashRegisterStore) {
          throw new Error('Persisting cash register sessions requires a CashRegisterStore.');
        }
        const result = closeCashRegisterSession(await readJsonBody<CashRegisterCloseInput>(request));
        const persisted = await cashRegisterStore.persistSession(result);
        writeJson(response, 200, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid cash register close request.',
        });
      }
    },
  );
  router.register('GET', '/pos/register/sessions', async({ request, response }: HttpHandlerInput): Promise<void> => {
    await readPersistedResource(response, cashRegisterStore, request.url, 'CashRegisterStore');
  });
  router.register('POST', '/pos/display', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!customerDisplayStore) {
        throw new Error('Persisting customer displays requires a CustomerDisplayStore.');
      }
      const body = await readJsonBody<{ displayIri?: unknown; input?: unknown }>(request);
      if (typeof body.displayIri !== 'string') {
        throw new TypeError('A customer display request needs a displayIri string.');
      }
      if (!isRecord(body.input)) {
        throw new Error('A customer display request needs an input object.');
      }
      const render = renderCustomerDisplay(body.input as unknown as CustomerDisplayInput);
      const persisted = await customerDisplayStore.persistPlaylist(body.displayIri, render);
      writeJson(response, 201, { persisted, playlist: render.playlist }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid customer display request.',
      });
    }
  });
  router.register('GET', '/pos/display', async({ request, response }: HttpHandlerInput): Promise<void> => {
    await readPersistedResource(response, customerDisplayStore, request.url, 'CustomerDisplayStore');
  });
  router.register('POST', '/pos/display/state', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!customerDisplayStore) {
        throw new Error('Persisting display state requires a CustomerDisplayStore.');
      }
      const body = await readJsonBody<{ displayIri?: unknown; state?: unknown }>(request);
      if (typeof body.displayIri !== 'string') {
        throw new TypeError('A display state request needs a displayIri string.');
      }
      if (!isRecord(body.state)) {
        throw new Error('A display state request needs a state object.');
      }
      const persisted = await customerDisplayStore.persistState(
        body.displayIri,
        body.state as unknown as CustomerDisplayStateInput,
      );
      writeJson(response, 201, { persisted, state: body.state }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid display state request.',
      });
    }
  });
  router.register('POST', '/pos/tables/sessions', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!tableSessionStore) {
        throw new Error('Persisting table sessions requires a TableSessionStore.');
      }
      const result = openTableSession(await readJsonBody<TableSessionInput>(request));
      const persisted = await tableSessionStore.persistSession(result);
      writeJson(response, 201, { persisted, session: result.record }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid table session request.',
      });
    }
  });
  router.register(
    'POST',
    '/pos/tables/sessions/close',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        if (!tableSessionStore) {
          throw new Error('Persisting table sessions requires a TableSessionStore.');
        }
        const result = closeTableSession(await readJsonBody<TableSessionCloseInput>(request));
        const persisted = await tableSessionStore.persistSession(result);
        writeJson(response, 200, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid table session close request.',
        });
      }
    },
  );
  router.register('GET', '/pos/tables/sessions', async({ request, response }: HttpHandlerInput): Promise<void> => {
    await readPersistedResource(response, tableSessionStore, request.url, 'TableSessionStore');
  });
  router.register('POST', '/pos/wifi-onboarding', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!tableSessionStore) {
        throw new Error('Persisting Wi-Fi onboarding requires a TableSessionStore.');
      }
      const body = await readJsonBody<Record<string, unknown>>(request);
      const record = buildStandaloneWifiOnboarding(body as Parameters<typeof buildStandaloneWifiOnboarding>[0]);
      const iri = String(record['@id']);
      const persisted = await tableSessionStore.persistRecord(iri, record);
      writeJson(response, 201, { persisted, record }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid Wi-Fi onboarding request.',
      });
    }
  });
  router.register('GET', '/pos/wifi-onboarding', async({ request, response }: HttpHandlerInput): Promise<void> => {
    await readPersistedResource(response, tableSessionStore, request.url, 'TableSessionStore');
  });
}

function buildOrderingFlowFromRequest(value: unknown): ReturnType<typeof buildWaiterOrderingFlow> {
  if (!isRecord(value)) {
    throw new TypeError('A POS order request must be a JSON object.');
  }
  const { channel, ...rest } = value;
  if (channel !== 'waiter' && channel !== 'customer-self-order') {
    throw new TypeError('A POS order request needs channel waiter or customer-self-order.');
  }
  if (channel === 'waiter') {
    return buildWaiterOrderingFlow(rest as Omit<CustomerOrderingFlowInput, 'channel' | 'requireStaffReview'>);
  }
  return buildCustomerSelfOrderingFlow(rest as Omit<CustomerOrderingFlowInput, 'channel'>);
}
