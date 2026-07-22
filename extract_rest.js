const fs = require('node:fs');

const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('\n');

function extractAssert(name) {
  const start = lines.findIndex(l => l.startsWith(`function ${name}`));
  if (start === -1) {
    return '';
  }
  let end = start;
  while (lines[end] && lines[end] !== '}') {
    end++;
  }
  return lines.slice(start, end + 1).join('\\n');
}

// HostingApi
const hostingRoutes = lines.slice(164, 174).map(l => l.replaceAll('this.router.', 'router.')).join('\n');
const hostingContent = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { HostingInput } from './HostingConfig';
import { planHosting } from './HostingConfig';
import { readJsonBody, writeJson, isRecord } from '../../CmsHttpUtils';

export function registerHostingRoutes(router: CmsModuleRouter<CmsControlHandler>): void {
${hostingRoutes}
}

${extractAssert('assertHostingInput')}
`;
fs.writeFileSync('src/databox/cms/modules/hosting/HostingApi.ts', hostingContent);

// ReceiptApi
const receiptRoutes = lines.slice(174, 185).map(l => l.replaceAll('this.router.', 'router.')).join('\n');
const receiptContent = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import { readJsonBody, writeJson, isRecord } from '../../CmsHttpUtils';
import type { ReceiptDocumentInput } from './ReceiptDocument';
import { buildReceiptDocument } from './ReceiptDocument';

export function registerReceiptRoutes(router: CmsModuleRouter<CmsControlHandler>): void {
${receiptRoutes}
}

${extractAssert('assertReceiptDocumentInput')}
`;
fs.writeFileSync('src/databox/cms/modules/receipt/ReceiptApi.ts', receiptContent);

// MenuApi
const menuRoutes = lines.slice(185, 196).map(l => l.replaceAll('this.router.', 'router.')).join('\n');
const menuContent = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { MenuInput } from './Menu';
import { buildMenu } from './Menu';
import { readJsonBody, writeJson, isRecord } from '../../CmsHttpUtils';

export function registerMenuRoutes(router: CmsModuleRouter<CmsControlHandler>): void {
${menuRoutes}
}

${extractAssert('assertMenuInput')}
`;
fs.writeFileSync('src/databox/cms/modules/menu/MenuApi.ts', menuContent);

console.log('Rest of APIs created.');
