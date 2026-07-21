import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { buildRecordEntry } from './RecordEntry';
import type { RecordEntryInput } from './RecordEntry';

function assertRecordEntryInput(body: unknown): asserts body is RecordEntryInput {
  if (
    !isRecord(body) ||
    typeof (body as Record<string, unknown>).id !== 'string' ||
    typeof (body as Record<string, unknown>).subject !== 'string' ||
    typeof (body as Record<string, unknown>).recordedAt !== 'string' ||
    !isRecord((body as Record<string, unknown>).payload)
  ) {
    throw new TypeError('A records request needs id, subject, recordedAt strings, and a payload object.');
  }

  if ((body as Record<string, unknown>).previous !== undefined && typeof (body as Record<string, unknown>).previous !== 'string') {
    throw new TypeError('previous must be a string if provided.');
  }
}

export function registerRecordsRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/records/entry', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertRecordEntryInput(body);
      const entryRender = buildRecordEntry(body);
      writeJson(response, 201, entryRender, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid records request.',
      });
    }
  });
}
