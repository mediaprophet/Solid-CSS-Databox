import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { ReceiptInput } from './Receipt';
import { buildReceipt } from './Receipt';
import type { RefundInput } from './Refund';
import { computeRefund } from './Refund';
import type { SplitInput } from './Split';
import { splitPayment } from './Split';
import type { BillingInterval } from './Subscription';
import { isDue, nextBillingDate } from './Subscription';
import type { TaxInput } from './Tax';
import { computeTax } from './Tax';

export function registerPaymentsRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/payments/receipt/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertReceiptInput(input);
      writeJson(response, 200, buildReceipt(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid receipt request.' });
    }
  });

  router.register('POST', '/payments/refund/compute', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertRefundInput(input);
      writeJson(response, 200, computeRefund(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid refund request.' });
    }
  });

  router.register('POST', '/payments/split/compute', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertSplitInput(input);
      writeJson(response, 200, splitPayment(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid split request.' });
    }
  });

  router.register('POST', '/payments/subscription/dates', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertSubscriptionInput(input);
      const asOfIso = input.asOfIso || new Date().toISOString();
      writeJson(response, 200, {
        isDue: isDue(input.lastBilledIso, input.interval, asOfIso),
        nextBillingDate: nextBillingDate(input.lastBilledIso, input.interval),
      }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid subscription dates request.' });
    }
  });

  router.register('POST', '/payments/tax/compute', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertTaxInput(input);
      writeJson(response, 200, computeTax(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid tax request.' });
    }
  });
}

function assertReceiptInput(value: unknown): asserts value is ReceiptInput {
  if (!isRecord(value) || typeof value.orderId !== 'string' || typeof value.seller !== 'string' || typeof value.currency !== 'string' || typeof value.orderDate !== 'string') {
    throw new TypeError('A receipt build request needs orderId, seller, currency, and orderDate strings.');
  }
  if (!Array.isArray(value.items)) {
    throw new TypeError('A receipt build request needs an items array.');
  }
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
      throw new TypeError('Receipt items need name, quantity, and unitPrice.');
    }
  }
  if (value.customer !== undefined && typeof value.customer !== 'string') {
    throw new TypeError('Customer must be a string if provided.');
  }
}

function assertRefundInput(value: unknown): asserts value is RefundInput {
  if (!isRecord(value) || typeof value.originalTotal !== 'number' || typeof value.refundAmount !== 'number') {
    throw new TypeError('A refund request needs numeric originalTotal and refundAmount.');
  }
}

function assertSplitInput(value: unknown): asserts value is SplitInput {
  if (!isRecord(value) || typeof value.total !== 'number' || typeof value.feePercent !== 'number') {
    throw new TypeError('A split request needs numeric total and feePercent.');
  }
  if (!Array.isArray(value.payees)) {
    throw new TypeError('A split request needs a payees array.');
  }
  for (const p of value.payees) {
    if (!isRecord(p) || typeof p.id !== 'string' || typeof p.share !== 'number') {
      throw new TypeError('Payees need id and share.');
    }
  }
}

function assertSubscriptionInput(value: unknown): asserts value is { lastBilledIso: string; interval: BillingInterval; asOfIso?: string } {
  if (!isRecord(value) || typeof value.lastBilledIso !== 'string' || typeof value.interval !== 'string') {
    throw new TypeError('A subscription request needs lastBilledIso and interval strings.');
  }
}

function assertTaxInput(value: unknown): asserts value is TaxInput {
  if (!isRecord(value) || typeof value.amount !== 'number' || typeof value.ratePercent !== 'number' || typeof value.inclusive !== 'boolean') {
    throw new TypeError('A tax request needs numeric amount and ratePercent, and boolean inclusive.');
  }
}
