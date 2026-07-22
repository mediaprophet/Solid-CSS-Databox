const fs = require('node:fs');

const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('\n');

const posRoutes = lines.slice(178, 350).map(l => l
  .replaceAll('this.router.', 'router.')
  .replaceAll('this.orderStore', 'orderStore')
  .replaceAll('this.cashRegisterStore', 'cashRegisterStore')
  .replaceAll('this.customerDisplayStore', 'customerDisplayStore')
  .replaceAll('this.tableSessionStore', 'tableSessionStore')).join('\n');

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
