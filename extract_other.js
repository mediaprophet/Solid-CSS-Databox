const fs = require('fs');
const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('n');

function extractAssert(name) {
  const start = lines.findIndex(l => l.startsWith(`function ${name}`));
  if (start === -1) return '';
  let end = start;
  while(lines[end] !== '}') end++;
  return lines.slice(start, end + 1).join('n');
}

// CatalogueApi
const catalogueRoutes = lines.slice(281, 292).map(l => l.replace(/this.router./g, 'router.')).join('n');
const catalogueContent = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { VariantInput } from './Variants';
import { buildVariants } from './Variants';
import { readJsonBody, writeJson, isRecord } from '../../CmsHttpUtils';

export function registerCatalogueRoutes(router: CmsModuleRouter<CmsControlHandler>): void {
${catalogueRoutes}
}

${extractAssert('assertVariantInput')}
`;
fs.writeFileSync('src/databox/cms/modules/catalogue/CatalogueApi.ts', catalogueContent);
console.log('CatalogueApi.ts created.');

// FeedsApi
const feedsRoutes = lines.slice(292, 303).map(l => l.replace(/this.router./g, 'router.')).join('n');
const feedsContent = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { FeedInput } from './ProductFeed';
import { buildProductFeed } from './ProductFeed';
import { readJsonBody, writeJson, isRecord } from '../../CmsHttpUtils';

export function registerFeedsRoutes(router: CmsModuleRouter<CmsControlHandler>): void {
${feedsRoutes}
}

${extractAssert('assertFeedInput')}
`;
fs.writeFileSync('src/databox/cms/modules/feeds/FeedsApi.ts', feedsContent);
console.log('FeedsApi.ts created.');

// WebsiteApi
const websitePreview = lines.slice(303, 313).map(l => l.replace(/this.router./g, 'router.').replace(/this.publicWebsiteStore/g, 'publicWebsiteStore')).join('n');
const websiteRest = lines.slice(484, 619).map(l => l.replace(/this.router./g, 'router.').replace(/this.publicWebsiteStore/g, 'publicWebsiteStore')).join('n');
const websiteContent = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { PublicWebsiteStore } from './PublicWebsiteStore';
import { renderSeoIndex, writeSeoAssets } from './RobotsSitemap';
import { readJsonBody, writeJson, writeTurtle, errorStatusCode, isRecord } from '../../CmsHttpUtils';

export function registerWebsiteRoutes(router: CmsModuleRouter<CmsControlHandler>, publicWebsiteStore?: PublicWebsiteStore): void {
${websitePreview}
${websiteRest}
}
`;
fs.writeFileSync('src/databox/cms/modules/website/WebsiteApi.ts', websiteContent);
console.log('WebsiteApi.ts created.');
