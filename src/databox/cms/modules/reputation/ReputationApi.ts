import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { aggregateReputation } from './Reputation';
import type { ReputationInput } from './Reputation';

function assertReputationInput(body: unknown): asserts body is ReputationInput {
  if (!isRecord(body) || !Array.isArray((body as Record<string, unknown>).reviews)) {
    throw new TypeError('A reputation request needs a reviews array.');
  }

  for (const review of (body as Record<string, unknown>).reviews as Record<string, unknown>[]) {
    if (!isRecord(review) || typeof review.rating !== 'number') {
      throw new TypeError('Each review needs a rating number.');
    }
  }
}

export function registerReputationRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/reputation/aggregate', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertReputationInput(body);
      const reputation = aggregateReputation(body);
      writeJson(response, 200, reputation);
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid reputation request.',
      });
    }
  });
}
