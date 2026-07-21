const fs = require('fs');
const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('\n');

const websitePreview = lines.slice(169, 179).map(l => l
  .replace(/this\.router\./g, 'router.')
  .replace(/this\.publicWebsiteStore/g, 'publicWebsiteStore')
).join('\n');

const websiteRest = lines.slice(351, 486).map(l => l
  .replace(/this\.router\./g, 'router.')
  .replace(/this\.publicWebsiteStore/g, 'publicWebsiteStore')
).join('\n');

const content = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { PublicWebsiteStore } from './PublicWebsiteStore';
import { renderSeoIndex, writeSeoAssets } from './RobotsSitemap';
import { readJsonBody, writeJson, writeTurtle, errorStatusCode, isRecord } from '../../CmsHttpUtils';

export function registerWebsiteRoutes(router: CmsModuleRouter<CmsControlHandler>, publicWebsiteStore?: PublicWebsiteStore): void {
${websitePreview}
${websiteRest}
}
`;

fs.writeFileSync('src/databox/cms/modules/website/WebsiteApi.ts', content);
console.log('WebsiteApi.ts recreated successfully.');
