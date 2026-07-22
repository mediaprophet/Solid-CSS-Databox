const fs = require('node:fs');

const content = `import type { HttpHandlerInput } from '../../server/HttpHandler';
import { HttpHandler } from '../../server/HttpHandler';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import { ensureBuiltIns } from './BuiltInModules';
import type { ModuleConfigStore } from './ModuleConfigStore';
import { DEFAULT_CMS_DISCOVERY_PATH } from './CmsDiscoveryHandler';
import { CmsModuleRouter } from './CmsModuleRouter';
import type { PosOrderStore } from './PosOrderStore';
import type { CashRegisterStore } from './CashRegisterStore';
import type { CustomerDisplayStore } from './CustomerDisplayStore';
import type { PublicWebsiteStore } from './PublicWebsiteStore';
import type { TableSessionStore } from './TableSessionStore';

import { registerPosRoutes } from './modules/pos/PosApi';
import { registerWebsiteRoutes } from './modules/website/WebsiteApi';
import { registerPaymentsRoutes } from './modules/payments/PaymentsApi';
import { registerJobsRoutes } from './modules/jobs/JobsApi';
import { registerBookingsRoutes } from './modules/bookings/BookingsApi';
import { registerCatalogueRoutes } from './modules/catalogue/CatalogueApi';
import { registerFeedsRoutes } from './modules/feeds/FeedsApi';
import { registerHostingRoutes } from './modules/hosting/HostingApi';
import { registerReceiptRoutes } from './modules/receipt/ReceiptApi';
import { registerMenuRoutes } from './modules/menu/MenuApi';
import { readJsonBody, writeJson, writeTurtle } from './CmsHttpUtils';

type CmsControlHandler = (input: HttpHandlerInput) => Promise<void>;

function normalizeRouteBase(value: string): string {
  if (value.length === 0 || value === '/') {
    return '';
  }
  const withSlash = value.startsWith('/') ? value : \`/\${value}\`;
  return withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

export class CmsHttpHandler extends HttpHandler {
  private readonly routeBase: string;
  private readonly discoveryPath: string;
  private readonly token: Buffer;
  private readonly router: CmsModuleRouter<CmsControlHandler>;

  public constructor(
    private readonly registry: DataboxModuleRegistry,
    controlToken: string,
    routeBase = '/.databox/cms',
    private readonly configStore?: ModuleConfigStore,
    discoveryPath = DEFAULT_CMS_DISCOVERY_PATH,
    private readonly orderStore?: PosOrderStore,
    private readonly cashRegisterStore?: CashRegisterStore,
    private readonly customerDisplayStore?: CustomerDisplayStore,
    private readonly publicWebsiteStore?: PublicWebsiteStore,
    private readonly tableSessionStore?: TableSessionStore,
  ) {
    super();
    if (typeof controlToken !== 'string' || Buffer.byteLength(controlToken, 'utf8') < 32) {
      throw new TypeError('The Databox CMS control plane requires a control token of at least 32 bytes.');
    }
    ensureBuiltIns(this.registry);
    this.routeBase = normalizeRouteBase(routeBase);
    this.discoveryPath = normalizeRouteBase(discoveryPath);
    this.token = Buffer.from(controlToken, 'utf8');
    this.router = new CmsModuleRouter<CmsControlHandler>(this.routeBase);

    this.registerCoreRoutes();
    registerHostingRoutes(this.router);
    registerReceiptRoutes(this.router);
    registerMenuRoutes(this.router);
    registerBookingsRoutes(this.router);
    registerJobsRoutes(this.router);
    registerPaymentsRoutes(this.router);
    registerCatalogueRoutes(this.router);
    registerFeedsRoutes(this.router);
    registerWebsiteRoutes(this.router, this.publicWebsiteStore);
    registerPosRoutes(
      this.router,
      this.orderStore,
      this.cashRegisterStore,
      this.customerDisplayStore,
      this.tableSessionStore
    );
  }

  private registerCoreRoutes(): void {
    this.router.register('GET', '/modules', async({ response }): Promise<void> => {
      try {
        writeJson(response, 200, { modules: this.registry.getAll() });
      } catch (error: unknown) {
        writeJson(response, 400, { error: 'Failed to read modules.' });
      }
    });

    this.router.register('GET', '/works', async({ response }): Promise<void> => {
      try {
        const bundle = await this.registry.exportWorks();
        writeJson(response, 200, bundle, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, { error: 'Failed to export works.' });
      }
    });

    this.router.register('POST', '/works/import', async({ request, response }): Promise<void> => {
      try {
        const bundle = await readJsonBody<unknown>(request);
        await this.registry.importWorks(bundle);
        writeJson(response, 200, { success: true });
      } catch (error: unknown) {
        writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid import request.' });
      }
    });

    this.router.register('GET', '/vertical-profiles', async({ response }): Promise<void> => {
      try {
        const profiles = this.registry.getVerticalProfiles();
        writeJson(response, 200, { profiles });
      } catch (error: unknown) {
        writeJson(response, 400, { error: 'Failed to list vertical profiles.' });
      }
    });
  }

  public async handle(input: HttpHandlerInput): Promise<void> {
    const { request, response } = input;
    const authHeader = request.headers.authorization ?? '';
    const token = authHeader.replace(/^Bearer\\s+/i, '').trim();

    if (token !== this.token.toString('utf8')) {
      writeJson(response, 401, { error: 'unauthorized' });
      return;
    }

    const handler = this.router.resolve(request.method ?? 'GET', request.url ?? '/');
    if (!handler) {
      writeJson(response, 404, { error: 'not-found' });
      return;
    }
    await handler(input);
  }
}
`;

fs.writeFileSync('src/databox/cms/CmsHttpHandler.ts', content);
console.log('CmsHttpHandler.ts refactored!');
