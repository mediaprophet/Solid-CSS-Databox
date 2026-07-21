const fs = require('fs');
const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('\n');

const posRoutes = lines.slice(178, 350).map(l => l
  .replace(/this\.router\./g, 'router.')
  .replace(/this\.orderStore/g, 'orderStore')
  .replace(/this\.cashRegisterStore/g, 'cashRegisterStore')
  .replace(/this\.customerDisplayStore/g, 'customerDisplayStore')
  .replace(/this\.tableSessionStore/g, 'tableSessionStore')
).join('\n');

const content = `import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { CmsControlHandler } from '../../CmsModuleRouter';
import type { PosOrderStore } from './PosOrderStore';
import type { CashRegisterStore, CashRegisterOpenInput, CashRegisterCloseInput } from './CashRegisterStore';
import { openCashRegisterSession, closeCashRegisterSession } from './CashRegisterStore';
import type { CustomerDisplayStore, CustomerDisplayInput, CustomerDisplayStateInput } from './CustomerDisplayStore';
import { renderCustomerDisplay } from './CustomerDisplayStore';
import type { TableSessionStore, TableSessionInput, TableSessionCloseInput } from './TableSessionStore';
import { openTableSession, closeTableSession, buildStandaloneWifiOnboarding } from './TableSessionStore';
import { buildOrderingFlowFromRequest } from './PosOrdering';
import { readJsonBody, writeJson, errorStatusCode, readPersistedResource, isRecord } from '../../CmsHttpUtils';

export function registerPosRoutes(
  router: CmsModuleRouter<CmsControlHandler>,
  orderStore?: PosOrderStore,
  cashRegisterStore?: CashRegisterStore,
  customerDisplayStore?: CustomerDisplayStore,
  tableSessionStore?: TableSessionStore
): void {
${posRoutes}
}
`;

fs.writeFileSync('src/databox/cms/modules/pos/PosApi.ts', content);
console.log('PosApi.ts recreated successfully.');
