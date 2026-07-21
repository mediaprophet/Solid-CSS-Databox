const fs = require('fs');
const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('\n');

const preview = lines.slice(168, 178).map(l => l.replace(/this\.router\./g, 'router.')).join('\n');
const rest = lines.slice(350, 484).map(l => l.replace(/this\.router\./g, 'router.').replace(/this\.publicWebsiteStore/g, 'publicWebsiteStore')).join('\n');

const content = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { PublicWebsiteStore } from './PublicWebsiteStore';
import { renderSeoIndex, writeSeoAssets } from './RobotsSitemap';
import { readJsonBody, writeJson, writeTurtle, errorStatusCode, isRecord } from '../../CmsHttpUtils';
import { renderPublicWebsiteFeedPreview, renderPublicWebsiteFeedFromRdf } from './PublicFeedRenderer';
import type { PublicWebsiteFeedRdfInput } from './PublicFeedRenderer';

export function registerWebsiteRoutes(router: CmsModuleRouter<CmsControlHandler>, publicWebsiteStore?: PublicWebsiteStore): void {
${preview}
${rest}
}
`;
fs.writeFileSync('src/databox/cms/modules/website/WebsiteApi.ts', content);
