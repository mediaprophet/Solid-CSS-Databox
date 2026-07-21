import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { MenuInput } from './Menu';
import { buildMenu } from './Menu';

export function registerMenuRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/menu/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertMenuInput(input);
      writeJson(response, 200, buildMenu(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid menu build request.',
      });
    }
  });
}

function assertMenuInput(value: unknown): asserts value is MenuInput {
  if (!isRecord(value)) {
    throw new TypeError('A menu build request must be a JSON object.');
  }
  if (typeof value.id !== 'string') {
    throw new TypeError('A menu build request needs id.');
  }
  if (typeof value.name !== 'string') {
    throw new TypeError('A menu build request needs name.');
  }
  if (typeof value.currency !== 'string') {
    throw new TypeError('A menu build request needs currency.');
  }
  if (!Array.isArray(value.sections)) {
    throw new TypeError('A menu build request needs sections.');
  }
  for (const section of value.sections) {
    if (!isRecord(section) || typeof section.name !== 'string' || !Array.isArray(section.items)) {
      throw new TypeError('Each menu section needs name and items.');
    }
    for (const item of section.items) {
      if (!isRecord(item) || typeof item.name !== 'string' || typeof item.price !== 'number') {
        throw new TypeError('Each menu item needs name and price.');
      }
    }
  }
}
