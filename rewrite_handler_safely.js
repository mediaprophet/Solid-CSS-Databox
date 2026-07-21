const fs = require('fs');
const lines = fs.readFileSync('src/databox/cms/CmsHttpHandler.ts', 'utf8').split('\n');

const imports = `import { registerJobsRoutes } from './modules/jobs/JobsApi';
import { registerPaymentsRoutes } from './modules/payments/PaymentsApi';
import { registerBookingsRoutes } from './modules/bookings/BookingsApi';
import { registerCatalogueRoutes } from './modules/catalogue/CatalogueApi';
import { registerFeedsRoutes } from './modules/feeds/FeedsApi';
import { registerHostingRoutes } from './modules/hosting/HostingApi';
import { registerMenuRoutes } from './modules/menu/MenuApi';
import { registerPosRoutes } from './modules/pos/PosApi';
import { registerReceiptRoutes } from './modules/receipt/ReceiptApi';
import { registerWebsiteRoutes } from './modules/website/WebsiteApi';`;

const registrations = `    // External module routes
    registerJobsRoutes(this.router);
    registerPaymentsRoutes(this.router);
    registerBookingsRoutes(this.router);
    registerCatalogueRoutes(this.router);
    registerFeedsRoutes(this.router);
    registerHostingRoutes(this.router);
    registerMenuRoutes(this.router);
    registerPosRoutes(this.router, this.orderStore, this.cashRegisterStore, this.customerDisplayStore, this.tableSessionStore);
    registerReceiptRoutes(this.router);
    registerWebsiteRoutes(this.router, this.publicWebsiteStore);

    // Dynamic Module Route
    this.router.register('GET', '/modules', async({ response }): Promise<void> => {
      ensureBuiltIns(this.registry);
      writeJson(response, 200, { modules: this.registry.list() });
    });
  }`;

// We replace the imports block at the top
// Let's just insert imports at line 14 (after other imports)
lines.splice(14, 0, imports);

// Now find the start and end of constructor routes
const startIdx = lines.findIndex(l => l.includes("this.router.register('GET', '/modules'"));
const endIdx = lines.findIndex(l => l.includes("public async canHandle"));

// We replace from startIdx to endIdx - 2 (since endIdx - 1 is the closing brace of constructor)
lines.splice(startIdx, (endIdx - 1) - startIdx, registrations);

fs.writeFileSync('src/databox/cms/CmsHttpHandler.ts', lines.join('\n'));
console.log('Safe refactor completed.');
