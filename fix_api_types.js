const fs = require('node:fs');

function globSync() {
  return fs.readdirSync('src/databox/cms/modules', { recursive: true })
    .filter(f => f.endsWith('Api.ts'))
    .map(f => `src/databox/cms/modules/${f.replaceAll('\\', '/')}`);
}

const apiFiles = globSync();
for (const file of apiFiles) {
  let content = fs.readFileSync(file, 'utf8');

  content = content.replaceAll(/import type \{ CmsControlHandler \} from '..\/..\/CmsModuleRouter';/gu, 'import type { HttpHandlerInput } from \'../../../../server/HttpHandler\';');

  // Replace <CmsControlHandler> with <(input: HttpHandlerInput) => Promise<void>>
  content = content.replaceAll('CmsModuleRouter<CmsControlHandler>', 'CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>');

  // Replace async({ request, response }) with async({ request, response }: HttpHandlerInput)
  content = content.replaceAll('async({ request, response })', 'async({ request, response }: HttpHandlerInput)');

  fs.writeFileSync(file, content);
}
console.log(`Fixed types in ${apiFiles.length} files`);
