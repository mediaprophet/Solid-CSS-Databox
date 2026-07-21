import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { buildNote } from './Note';
import type { NoteInput } from './Note';

function assertNoteInput(body: unknown): asserts body is NoteInput {
  if (
    !isRecord(body) ||
    typeof (body as Record<string, unknown>).id !== 'string' ||
    typeof (body as Record<string, unknown>).author !== 'string' ||
    typeof (body as Record<string, unknown>).content !== 'string' ||
    typeof (body as Record<string, unknown>).published !== 'string'
  ) {
    throw new TypeError('A social note request needs id, author, content, and published strings.');
  }

  if ((body as Record<string, unknown>).inReplyTo !== undefined && typeof (body as Record<string, unknown>).inReplyTo !== 'string') {
    throw new TypeError('inReplyTo must be a string if provided.');
  }
}

export function registerSocialRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/social/note', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      assertNoteInput(body);
      const noteRender = buildNote(body);
      writeJson(response, 201, noteRender, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid social note request.',
      });
    }
  });
}
