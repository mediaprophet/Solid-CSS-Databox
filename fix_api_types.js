const fs = require('fs');
const glob = require('glob');
const files = ['src/databox/cms/modules/**/*.ts'];

const globSync = function (pattern) {
  return fs.readdirSync('src/databox/cms/modules', { recursive: true })
    .filter(f => f.endsWith('Api.ts'))
    .map(f => 'src/databox/cms/modules/' + f.replace(/\\/g, '/'));
}

const apiFiles = globSync();
for (const file of apiFiles) {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/import type \{ CmsControlHandler \} from '..\/..\/CmsModuleRouter';/g, "import type { HttpHandlerInput } from '../../../../server/HttpHandler';");
  
  // replace <CmsControlHandler> with <(input: HttpHandlerInput) => Promise<void>>
  content = content.replace(/CmsModuleRouter<CmsControlHandler>/g, 'CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>');
  
  // replace async({ request, response }) with async({ request, response }: HttpHandlerInput)
  content = content.replace(/async\(\{ request, response \}\)/g, 'async({ request, response }: HttpHandlerInput)');
  
  fs.writeFileSync(file, content);
}
console.log('Fixed types in ' + apiFiles.length + ' files');
