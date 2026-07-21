import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { EftposTransactionInput, EftposTerminalConfig } from './EftposTerminal';
import { processEftposTransaction, processEftposSettlement, queryTerminalStatus } from './EftposTerminal';

export function registerEftposRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/eftpos/transaction', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ transaction: EftposTransactionInput; config: EftposTerminalConfig }>(request);
      const result = processEftposTransaction(input.transaction, input.config);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid EFTPOS transaction request.' });
    }
  });

  router.register('POST', '/eftpos/settlement', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ terminalId: string; config: EftposTerminalConfig }>(request);
      const result = processEftposSettlement(input.terminalId, input.config);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid EFTPOS settlement request.' });
    }
  });

  router.register('POST', '/eftpos/status', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ terminalId: string; config: EftposTerminalConfig }>(request);
      const result = queryTerminalStatus(input.terminalId, input.config);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid EFTPOS status request.' });
    }
  });
}
