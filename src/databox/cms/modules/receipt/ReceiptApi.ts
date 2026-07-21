import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { ReceiptDocInput } from './ReceiptDoc';
import { buildReceiptDoc } from './ReceiptDoc';

export function registerReceiptRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/receipt/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertReceiptDocInput(input);
      writeJson(response, 200, buildReceiptDoc(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid receipt document build request.',
      });
    }
  });
}

function assertReceiptDocInput(value: unknown): asserts value is ReceiptDocInput {
  if (!isRecord(value)) {
    throw new TypeError('A receipt build request must be a JSON object.');
  }
  if (!isRecord(value.org) || typeof value.org.name !== 'string') {
    throw new TypeError('A receipt build request needs org.name.');
  }
  if (typeof value.receiptId !== 'string') {
    throw new TypeError('A receipt build request needs receiptId.');
  }
  if (typeof value.date !== 'string') {
    throw new TypeError('A receipt build request needs date.');
  }
  if (typeof value.currency !== 'string') {
    throw new TypeError('A receipt build request needs currency.');
  }
  if (typeof value.digitalReceiptUrl !== 'string') {
    throw new TypeError('A receipt build request needs digitalReceiptUrl.');
  }
  if (!Array.isArray(value.lines)) {
    throw new TypeError('A receipt build request needs lines.');
  }
  for (const line of value.lines) {
    if (!isRecord(line) ||
      typeof line.name !== 'string' ||
      typeof line.quantity !== 'number' ||
      typeof line.unitPrice !== 'number') {
      throw new TypeError('Each receipt line needs name, quantity, and unitPrice.');
    }
  }
  if (value.taxPercent !== undefined && typeof value.taxPercent !== 'number') {
    throw new TypeError('A receipt taxPercent must be a number.');
  }
}
