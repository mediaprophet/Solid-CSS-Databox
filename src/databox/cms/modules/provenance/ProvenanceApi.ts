import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { buildProvenance } from './Provenance';
import type { ProvenanceInput } from './Provenance';

function assertProvenanceInput(body: unknown): asserts body is ProvenanceInput {
  if (
    !isRecord(body) ||
    typeof body.product !== 'string' ||
    typeof body.origin !== 'string' ||
    !Array.isArray(body.steps)
  ) {
    throw new TypeError('A provenance request needs a product string, an origin string, and a steps array.');
  }

  for (const step of body.steps as Record<string, unknown>[]) {
    if (!isRecord(step) || typeof step.actor !== 'string' ||
      typeof step.action !== 'string' || typeof step.date !== 'string') {
      throw new TypeError('Each provenance step needs an actor string, an action string, and a date string.');
    }
  }

  if (body.certifications !== undefined) {
    if (!Array.isArray(body.certifications)) {
      throw new TypeError('certifications must be an array of strings if provided.');
    }
    for (const cert of body.certifications as unknown[]) {
      if (typeof cert !== 'string') {
        throw new TypeError('Each certification must be a string.');
      }
    }
  }
}

export function registerProvenanceRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/provenance', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertProvenanceInput(body);
      const provenanceRender = buildProvenance(body);
      writeJson(response, 201, provenanceRender, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid provenance request.',
      });
    }
  });
}
