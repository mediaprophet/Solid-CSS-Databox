const fs = require('fs');
const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('\n');

const routes = lines.slice(226, 281).map(l => l.replace(/this\.router\./g, 'router.')).join('\n');
const assertsStr = [
  'assertReceiptInput',
  'assertRefundInput',
  'assertSplitInput',
  'assertSubscriptionInput',
  'assertTaxInput'
].map(name => {
  const start = lines.findIndex(l => l.startsWith(`function ${name}`));
  let end = start;
  while(lines[end] && lines[end] !== '}') end++;
  return lines.slice(start, end + 1).join('\n');
}).join('\n\n');

const content = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { ReceiptInput } from './Receipt';
import { buildReceipt } from './Receipt';
import type { RefundInput } from './Refund';
import { computeRefund } from './Refund';
import type { SplitInput } from './Split';
import { splitPayment } from './Split';
import type { BillingInterval } from './Subscription';
import { isDue, nextBillingDate } from './Subscription';
import type { TaxInput } from './Tax';
import { computeTax } from './Tax';
import { readJsonBody, writeJson, isRecord } from '../../CmsHttpUtils';

export function registerPaymentsRoutes(router: CmsModuleRouter<CmsControlHandler>): void {
${routes}
}

${assertsStr}
`;

fs.writeFileSync('src/databox/cms/modules/payments/PaymentsApi.ts', content);
console.log('PaymentsApi.ts created.');
