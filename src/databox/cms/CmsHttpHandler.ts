import { timingSafeEqual } from 'node:crypto';
import type { HttpHandlerInput } from '../../server/HttpHandler';
import { HttpHandler } from '../../server/HttpHandler';
import { HttpError } from '../../util/errors/HttpError';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';
import type { CashRegisterStore } from './CashRegisterStore';
import { CmsModuleRouter } from './CmsModuleRouter';
import type { CustomerDisplayStateInput, CustomerDisplayStore } from './CustomerDisplayStore';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import type { ModuleConfigStore } from './ModuleConfigStore';
import { setModuleEnabledFlag } from './ModuleConfigStore';
import {
  DEFAULT_CMS_DISCOVERY_PATH,
  isModuleManifestDiscoveryPath,
  isModuleManifestIndexPath,
  parseModuleManifestResourcePath,
  serializeDiscoveredModuleManifestToTurtle,
  serializeModuleManifestIndexToTurtle,
} from './ModuleManifestDiscovery';
import type { HostingInput } from './modules/hosting/HostingConfig';
import { planHosting } from './modules/hosting/HostingConfig';
import type { MenuInput } from './modules/menu/Menu';
import { buildMenu, MENU_MODULE_MANIFEST } from './modules/menu/Menu';
import {
  CASH_REGISTER_MODULE_MANIFEST,
  closeCashRegisterSession,
  openCashRegisterSession,
} from './modules/pos/CashRegister';
import type { CashRegisterCloseInput, CashRegisterOpenInput } from './modules/pos/CashRegister';
import {
  buildCustomerSelfOrderingFlow,
  buildWaiterOrderingFlow,
} from './modules/pos/CustomerOrdering';
import type { CustomerOrderingFlowInput } from './modules/pos/CustomerOrdering';
import { NATIVE_POS_DEVICE_MODULE_MANIFEST } from './modules/pos/NativePosDeviceContract';
import {
  buildStandaloneWifiOnboarding,
  closeTableSession,
  openTableSession,
  TABLE_SESSION_MODULE_MANIFEST,
} from './modules/pos/TableSession';
import type { TableSessionCloseInput, TableSessionInput } from './modules/pos/TableSession';
import type { ReceiptDocInput } from './modules/receipt/ReceiptDoc';
import { buildReceiptDoc } from './modules/receipt/ReceiptDoc';
import { renderCustomerDisplay } from './modules/website/CustomerDisplayRenderer';
import type { CustomerDisplayInput } from './modules/website/CustomerDisplayRenderer';
import {
  renderPublicWebsiteFeed,
  renderPublicWebsiteFeedFromRdf,
  renderPublicWebsiteFeedPreview,
  WEBSITE_SEO_MODULE_MANIFEST,
} from './modules/website/PublicFeedRenderer';
import type {
  PublicWebsiteFeedInput,
  PublicWebsiteFeedRdfInput,
} from './modules/website/PublicFeedRenderer';
import { exportPortableCmsWorks, importPortableCmsWorks } from './PortableCmsWorks';
import type { PosOrderStore } from './PosOrderStore';
import type { PublicWebsiteStore } from './PublicWebsiteStore';
import type { TableSessionStore } from './TableSessionStore';
import type { SolidModuleManifest } from './SolidModuleManifest';
import type { VerticalProfileManifest, VerticalProfileModuleReference } from './VerticalProfile';
import {
  applyVerticalProfileBundle,
  LIGHTHOUSE_VERTICAL_PROFILES,
  validateVerticalProfileBundle,
} from './VerticalProfile';

/** A control-plane handler for one CMS route, given the raw HTTP input. */
export type CmsControlHandler = (input: HttpHandlerInput) => Promise<void>;

/**
 * Mounts the Databox CMS control plane in a live CSS process (see `databox/solid-cms-plan.md`, §5.1).
 *
 * It claims only paths at or under `routeBase` (default `/.databox/cms`), requires a bearer control
 * token of at least 32 bytes (constant-time compared), and dispatches authorized requests through a
 * {@link CmsModuleRouter} — the shared table modules register their routes into. It ships one built-in
 * route (`GET /modules`, the enabled-module list) so the framework is exercisable end-to-end. This
 * single-process control token is a demonstration boundary, not production operator IAM.
 */
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
    this.router.register('GET', '/modules', async({ response }): Promise<void> => {
      writeJson(response, 200, await Promise.all(this.registry.list()
        .map(async(manifest): Promise<SolidModuleManifest & { enabled: boolean; capabilityMode: string }> => ({
          ...manifest,
          enabled: await this.enabled(manifest),
          capabilityMode: manifest.routes.length > 0 ? 'css-enhanced' : 'portable-core',
        }))));
    });
    this.router.register('GET', '/works', async({ response }): Promise<void> => {
      writeJson(response, 200, await exportPortableCmsWorks(this.registry, this.configStore), 'application/ld+json');
    });
    this.router.register('POST', '/works/import', async({ request, response }): Promise<void> => {
      try {
        const bundle = await readJsonBody<unknown>(request);
        writeJson(
          response,
          200,
          await importPortableCmsWorks(bundle, this.registry, this.configStore),
          'application/ld+json',
        );
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid CMS works import request.',
        });
      }
    });
    this.router.register('GET', '/vertical-profiles', async({ response }): Promise<void> => {
      writeJson(response, 200, await this.verticalProfileSummaries());
    });
    this.router.register('POST', '/hosting/plan', async({ request, response }): Promise<void> => {
      try {
        const input = await readJsonBody<HostingInput>(request);
        writeJson(response, 200, planHosting(input));
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid hosting plan request.',
        });
      }
    });
    this.router.register('POST', '/receipt/build', async({ request, response }): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        assertReceiptDocInput(input);
        writeJson(response, 200, buildReceiptDoc(input));
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid receipt build request.',
        });
      }
    });
    this.router.register('POST', '/menu/build', async({ request, response }): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        assertMenuInput(input);
        writeJson(response, 200, buildMenu(input), 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid menu build request.',
        });
      }
    });
    this.router.register('POST', '/website/preview', async({ request, response }): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        writeJson(response, 200, renderPublicWebsiteFeedPreview(input));
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid website preview request.',
        });
      }
    });
    this.router.register('POST', '/pos/orders', async({ request, response }): Promise<void> => {
      try {
        if (!this.orderStore) {
          throw new Error('Persisting POS orders requires a PosOrderStore.');
        }
        const input = await readJsonBody<unknown>(request);
        const flow = buildOrderingFlowFromRequest(input);
        const persisted = await this.orderStore.persistFlow(flow);
        writeJson(response, 201, {
          channel: flow.channel,
          status: flow.status,
          persisted,
          cart: flow.cart.record,
          order: flow.order.record,
          ticket: flow.ticket.record,
          intent: flow.intent,
        }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid POS order request.',
        });
      }
    });
    this.router.register('GET', '/pos/orders', async({ request, response }): Promise<void> => {
      try {
        if (!this.orderStore) {
          throw new Error('Reading POS orders requires a PosOrderStore.');
        }
        const iri = new URL(request.url ?? '/', 'http://localhost').searchParams.get('iri');
        if (iri === null || iri.length === 0) {
          throw new Error('A POS order read requires an ?iri= query parameter.');
        }
        const record = await this.orderStore.load(iri);
        if (record === undefined) {
          writeJson(response, 404, { error: 'pos-resource-not-found' });
          return;
        }
        writeJson(response, 200, JSON.parse(record), 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid POS order read request.',
        });
      }
    });
    this.router.register('POST', '/pos/register/sessions', async({ request, response }): Promise<void> => {
      try {
        if (!this.cashRegisterStore) {
          throw new Error('Persisting cash register sessions requires a CashRegisterStore.');
        }
        const result = openCashRegisterSession(await readJsonBody<CashRegisterOpenInput>(request));
        const persisted = await this.cashRegisterStore.persistSession(result);
        writeJson(response, 201, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid cash register open request.',
        });
      }
    });
    this.router.register('POST', '/pos/register/sessions/close', async({ request, response }): Promise<void> => {
      try {
        if (!this.cashRegisterStore) {
          throw new Error('Persisting cash register sessions requires a CashRegisterStore.');
        }
        const result = closeCashRegisterSession(await readJsonBody<CashRegisterCloseInput>(request));
        const persisted = await this.cashRegisterStore.persistSession(result);
        writeJson(response, 200, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid cash register close request.',
        });
      }
    });
    this.router.register('GET', '/pos/register/sessions', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.cashRegisterStore, request.url, 'CashRegisterStore');
    });
    this.router.register('POST', '/pos/display', async({ request, response }): Promise<void> => {
      try {
        if (!this.customerDisplayStore) {
          throw new Error('Persisting customer displays requires a CustomerDisplayStore.');
        }
        const body = await readJsonBody<{ displayIri?: unknown; input?: unknown }>(request);
        if (typeof body.displayIri !== 'string') {
          throw new TypeError('A customer display request needs a displayIri string.');
        }
        if (!isRecord(body.input)) {
          throw new Error('A customer display request needs an input object.');
        }
        const render = renderCustomerDisplay(body.input as unknown as CustomerDisplayInput);
        const persisted = await this.customerDisplayStore.persistPlaylist(body.displayIri, render);
        writeJson(response, 201, { persisted, playlist: render.playlist }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid customer display request.',
        });
      }
    });
    this.router.register('GET', '/pos/display', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.customerDisplayStore, request.url, 'CustomerDisplayStore');
    });
    this.router.register('POST', '/pos/display/state', async({ request, response }): Promise<void> => {
      try {
        if (!this.customerDisplayStore) {
          throw new Error('Persisting display state requires a CustomerDisplayStore.');
        }
        const body = await readJsonBody<{ displayIri?: unknown; state?: unknown }>(request);
        if (typeof body.displayIri !== 'string') {
          throw new TypeError('A display state request needs a displayIri string.');
        }
        if (!isRecord(body.state)) {
          throw new Error('A display state request needs a state object.');
        }
        const persisted = await this.customerDisplayStore.persistState(
          body.displayIri,
          body.state as unknown as CustomerDisplayStateInput,
        );
        writeJson(response, 201, { persisted, state: body.state }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid display state request.',
        });
      }
    });
    this.router.register('POST', '/pos/tables/sessions', async({ request, response }): Promise<void> => {
      try {
        if (!this.tableSessionStore) {
          throw new Error('Persisting table sessions requires a TableSessionStore.');
        }
        const result = openTableSession(await readJsonBody<TableSessionInput>(request));
        const persisted = await this.tableSessionStore.persistSession(result);
        writeJson(response, 201, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid table session request.',
        });
      }
    });
    this.router.register('POST', '/pos/tables/sessions/close', async({ request, response }): Promise<void> => {
      try {
        if (!this.tableSessionStore) {
          throw new Error('Persisting table sessions requires a TableSessionStore.');
        }
        const result = closeTableSession(await readJsonBody<TableSessionCloseInput>(request));
        const persisted = await this.tableSessionStore.persistSession(result);
        writeJson(response, 200, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid table session close request.',
        });
      }
    });
    this.router.register('GET', '/pos/tables/sessions', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.tableSessionStore, request.url, 'TableSessionStore');
    });
    this.router.register('POST', '/pos/wifi-onboarding', async({ request, response }): Promise<void> => {
      try {
        if (!this.tableSessionStore) {
          throw new Error('Persisting Wi-Fi onboarding requires a TableSessionStore.');
        }
        const body = await readJsonBody<Record<string, unknown>>(request);
        const record = buildStandaloneWifiOnboarding(body as Parameters<typeof buildStandaloneWifiOnboarding>[0]);
        const iri = String(record['@id']);
        const persisted = await this.tableSessionStore.persistRecord(iri, record);
        writeJson(response, 201, { persisted, record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid Wi-Fi onboarding request.',
        });
      }
    });
    this.router.register('GET', '/pos/wifi-onboarding', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.tableSessionStore, request.url, 'TableSessionStore');
    });
    this.router.register('POST', '/website/publish', async({ request, response }): Promise<void> => {
      try {
        if (!this.publicWebsiteStore) {
          throw new Error('Publishing the public website requires a PublicWebsiteStore.');
        }
        const body = await readJsonBody<{ baseIri?: unknown; feed?: unknown }>(request);
        if (typeof body.baseIri !== 'string') {
          throw new TypeError('A website publish request needs a baseIri string.');
        }
        if (!isRecord(body.feed)) {
          throw new Error('A website publish request needs a feed object.');
        }
        const render = typeof body.feed.turtle === 'string' ?
            renderPublicWebsiteFeedFromRdf(body.feed as unknown as PublicWebsiteFeedRdfInput) :
            renderPublicWebsiteFeed(body.feed as unknown as PublicWebsiteFeedInput);
        const published = await this.publicWebsiteStore.publish(body.baseIri, render);
        writeJson(response, 201, { published }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid website publish request.',
        });
      }
    });
  }

  public async canHandle({ request }: HttpHandlerInput): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!isModuleManifestDiscoveryPath(path, this.discoveryPath) &&
      path !== this.routeBase &&
      !path.startsWith(`${this.routeBase}/`)) {
      throw new NotImplementedHttpError('Not a Databox CMS route.');
    }
  }

  public async handle({ request, response }: HttpHandlerInput): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (isModuleManifestDiscoveryPath(path, this.discoveryPath)) {
      await this.handleManifestDiscovery({ request, response }, path);
      return;
    }

    if (!this.authorized(request.headers.authorization)) {
      response.statusCode = 401;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('www-authenticate', 'Bearer realm="databox-cms"');
      response.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    response.setHeader('cache-control', 'no-store');
    const moduleRequest = parseModuleStateRoute(this.routeBase, request.method ?? 'GET', request.url ?? '/');
    if (moduleRequest) {
      await this.handleModuleState(moduleRequest, { request, response });
      return;
    }
    const verticalProfileRequest = parseVerticalProfileRoute(
      this.routeBase,
      request.method ?? 'GET',
      request.url ?? '/',
    );
    if (verticalProfileRequest) {
      await this.handleVerticalProfile(verticalProfileRequest, { response });
      return;
    }
    const handler = this.router.resolve(request.method ?? 'GET', request.url ?? '/');
    if (!handler) {
      writeJson(response, 404, { error: 'not-found' });
      return;
    }
    await handler({ request, response });
  }

  private async handleManifestDiscovery({ request, response }: HttpHandlerInput, path: string): Promise<void> {
    if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
      writeJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    const baseUrl = requestBaseUrl(request);
    try {
      if (isModuleManifestIndexPath(path, this.discoveryPath)) {
        writeTurtle(response, 200, await serializeModuleManifestIndexToTurtle(this.registry.list(), {
          baseUrl,
          discoveryPath: this.discoveryPath,
        }));
        return;
      }

      const id = parseModuleManifestResourcePath(path, this.discoveryPath);
      const manifest = id ? this.registry.get(id) : undefined;
      if (!manifest) {
        writeJson(response, 404, { error: 'module-manifest-not-found' });
        return;
      }

      writeTurtle(response, 200, await serializeDiscoveredModuleManifestToTurtle(manifest, {
        baseUrl,
        discoveryPath: this.discoveryPath,
      }));
    } catch (error: unknown) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : 'CMS module manifest discovery failed.',
      });
    }
  }

  private async handleModuleState(
    { method, id }: { method: string; id: string },
    { request, response }: HttpHandlerInput,
  ): Promise<void> {
    const manifest = this.registry.get(id);
    if (!manifest) {
      writeJson(response, 404, { error: 'module-not-found' });
      return;
    }

    if (method === 'GET') {
      writeJson(response, 200, await this.moduleState(manifest));
      return;
    }

    if (method !== 'PUT' && method !== 'PATCH') {
      writeJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    try {
      const body = await readJsonBody<{ enabled?: unknown; configTurtle?: unknown }>(request);
      if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
        throw new Error('Module enabled state must be a boolean.');
      }
      if (body.configTurtle !== undefined && typeof body.configTurtle !== 'string') {
        throw new Error('Module configTurtle must be a Turtle string.');
      }
      if (!this.configStore && body.configTurtle !== undefined) {
        throw new Error('Persistent module config requires a ModuleConfigStore.');
      }

      if (body.enabled !== undefined) {
        this.registry.setEnabled(id, body.enabled);
      }
      if (this.configStore) {
        let turtle = body.configTurtle ?? await this.configStore.load(id) ?? '';
        if (body.enabled !== undefined) {
          turtle = await setModuleEnabledFlag(this.moduleStateIri(id), turtle, body.enabled);
        }
        if (body.configTurtle !== undefined || body.enabled !== undefined) {
          await this.configStore.save(id, turtle);
        }
      }

      writeJson(response, 200, await this.moduleState(manifest));
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid module state request.',
      });
    }
  }

  private async handleVerticalProfile(
    { method, id, action }: { method: string; id: string; action?: string },
    { response }: Pick<HttpHandlerInput, 'response'>,
  ): Promise<void> {
    const profile = LIGHTHOUSE_VERTICAL_PROFILES.find((candidate): boolean => candidate.id === id);
    if (!profile) {
      writeJson(response, 404, { error: 'vertical-profile-not-found' });
      return;
    }

    if (method === 'GET' && action === undefined) {
      writeJson(response, 200, await this.verticalProfileSummary(profile));
      return;
    }
    if (method !== 'POST' || (action !== 'preview' && action !== 'apply')) {
      writeJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    try {
      if (action === 'apply') {
        if (!this.configStore && profile.modules.some((module): boolean => module.defaultConfig !== undefined)) {
          throw new Error(`Vertical profile ${profile.id} needs a ModuleConfigStore to apply RDF defaults.`);
        }
        await applyVerticalProfileBundle(profile, this.registry, this.configStore);
      }
      writeJson(response, 200, {
        ...await this.verticalProfileSummary(profile),
        operation: action,
        persisted: action === 'apply',
        defaults: profile.modules.map((module): VerticalProfileDefaultPreview => ({
          moduleId: module.moduleId,
          enabled: module.enabledByDefault,
          contentType: module.defaultConfig?.contentType ?? 'text/turtle',
          configTurtle: module.defaultConfig?.turtle ?? '',
        })),
      });
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : `Invalid vertical profile ${action} request.`,
      });
    }
  }

  private async moduleState(manifest: SolidModuleManifest):
  Promise<SolidModuleManifest & { enabled: boolean; capabilityMode: string; configTurtle?: string }> {
    const configTurtle = await this.configStore?.load(manifest.id);
    return {
      ...manifest,
      enabled: await this.enabled(manifest, configTurtle),
      capabilityMode: manifest.routes.length > 0 ? 'css-enhanced' : 'portable-core',
      ...configTurtle === undefined ? {} : { configTurtle },
    };
  }

  private async enabled(manifest: SolidModuleManifest, loadedState?: string): Promise<boolean> {
    if (!this.configStore) {
      return this.registry.isEnabled(manifest.id);
    }
    if (loadedState === undefined && await this.configStore.load(manifest.id) === undefined) {
      return this.registry.isEnabled(manifest.id);
    }
    return this.configStore.isEnabled(manifest.id);
  }

  private moduleStateIri(id: string): string {
    return `urn:solid-server:databox:cms:module:${encodeURIComponent(id)}`;
  }

  private async verticalProfileSummaries(): Promise<VerticalProfileSummary[]> {
    return Promise.all(LIGHTHOUSE_VERTICAL_PROFILES.map(
      async(profile): Promise<VerticalProfileSummary> => this.verticalProfileSummary(profile),
    ));
  }

  private async verticalProfileSummary(profile: VerticalProfileManifest): Promise<VerticalProfileSummary> {
    const validation = validateVerticalProfileBundle(profile, this.registry);
    const modules = await Promise.all(validation.profile.modules.map(
      async(module): Promise<VerticalProfileModuleSummary> => this.verticalProfileModuleSummary(module),
    ));
    const needsConfigStore = validation.profile.modules.some((module): boolean => module.defaultConfig !== undefined);
    const canApply = validation.missingModules.length === 0 && (!needsConfigStore || this.configStore !== undefined);
    return {
      ...validation.profile,
      capabilityMode: 'css-enhanced',
      controlPlaneAvailable: true,
      canApply,
      missingModules: validation.missingModules,
      unavailableModules: modules
        .filter((module): boolean => !module.available)
        .map((module): string => module.moduleId),
      degradationReason: verticalProfileDegradationReason(canApply, validation.missingModules),
      modules,
    };
  }

  private async verticalProfileModuleSummary(module: VerticalProfileModuleReference):
  Promise<VerticalProfileModuleSummary> {
    const manifest = this.registry.get(module.moduleId);
    if (!manifest) {
      return {
        ...module,
        available: false,
        enabled: false,
        capabilityMode: 'unavailable',
        unavailableReason: 'This horizontal module is not installed in the active CMS registry.',
      };
    }
    return {
      ...module,
      available: true,
      enabled: await this.enabled(manifest),
      capabilityMode: manifest.routes.length > 0 ? 'css-enhanced' : 'portable-core',
      manifest,
    };
  }

  private authorized(header: string | undefined): boolean {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return false;
    }
    const presented = Buffer.from(header.slice('Bearer '.length), 'utf8');
    return presented.length === this.token.length && timingSafeEqual(presented, this.token);
  }
}

function normalizeRouteBase(value: string): string {
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

function ensureBuiltIns(registry: DataboxModuleRegistry): void {
  if (!registry.get('hosting')) {
    registry.register({
      id: 'hosting',
      name: 'Hosting',
      version: '0.1.0',
      description: 'Guided domain, DNS and launch-configuration planning for the CMS profile.',
      capabilities: [ 'cms:hosting', 'cms:dns-plan' ],
      routes: [ 'POST /.databox/cms/hosting/plan' ],
      adminUi: {
        navLabel: 'Hosting',
        path: '/hosting',
      },
    });
  }
  if (!registry.get('receipt')) {
    registry.register({
      id: 'receipt',
      name: 'Receipt Writer',
      version: '0.1.0',
      description: 'Printable receipt documents with QR links to the consumer RDF/VC receipt in the pod.',
      capabilities: [
        'cms:receipt-document',
        'cms:portable-core-receipt-doc',
        'cms:css-enhanced-receipt-build-route',
        'cms:native-edge-print-job-descriptor',
      ],
      routes: [ 'POST /.databox/cms/receipt/build' ],
      adminUi: {
        navLabel: 'Receipts',
        path: '/receipts',
      },
    });
  }
  if (!registry.get('pos.ordering')) {
    registry.register({
      id: 'pos.ordering',
      name: 'Point of Sale',
      version: '0.1.0',
      description:
        'Portable POS cart, order, ticket, waiter, customer self-order, payment-handoff and receipt-intent records.',
      capabilities: [
        'pos:cart',
        'pos:order-record',
        'pos:ticket-state',
        'pos:waiter-order',
        'pos:customer-self-order',
        'pos:payment-handoff',
        'cms:portable-core-pos-ordering',
        'cms:css-enhanced-pos-order-store',
      ],
      routes: [ 'POST /.databox/cms/pos/orders', 'GET /.databox/cms/pos/orders' ],
      adminUi: {
        navLabel: 'POS Terminal',
        path: '/pos',
      },
    });
  }
  if (!registry.get('pos.promotions-display')) {
    registry.register({
      id: 'pos.promotions-display',
      name: 'Promotions and Customer Display',
      version: '0.1.0',
      description:
        'Portable promotion rules, customer-facing transaction summaries, app/vault links, ' +
        'and automated display decks.',
      capabilities: [
        'pos:promotion-offer',
        'pos:customer-display',
        'pos:display-deck',
        'pos:shop-app-install-link',
        'pos:solid-vault-connect-link',
        'cms:portable-core-customer-display',
        'cms:css-enhanced-customer-display-store',
      ],
      routes: [ 'POST /.databox/cms/pos/display', 'GET /.databox/cms/pos/display' ],
      adminUi: {
        navLabel: 'Display Preview',
        path: '/pos/display',
      },
    });
  }
  if (!registry.get(NATIVE_POS_DEVICE_MODULE_MANIFEST.id)) {
    registry.register(NATIVE_POS_DEVICE_MODULE_MANIFEST);
  }
  if (!registry.get(CASH_REGISTER_MODULE_MANIFEST.id)) {
    registry.register(CASH_REGISTER_MODULE_MANIFEST);
  }
  if (!registry.get(MENU_MODULE_MANIFEST.id)) {
    registry.register(MENU_MODULE_MANIFEST);
  }
  if (!registry.get(WEBSITE_SEO_MODULE_MANIFEST.id)) {
    registry.register(WEBSITE_SEO_MODULE_MANIFEST);
  }
  if (!registry.get(TABLE_SESSION_MODULE_MANIFEST.id)) {
    registry.register(TABLE_SESSION_MODULE_MANIFEST);
  }
  if (!registry.isEnabled('hosting')) {
    registry.setEnabled('hosting', true);
  }
  if (!registry.isEnabled('receipt')) {
    registry.setEnabled('receipt', true);
  }
  if (!registry.isEnabled('pos.ordering')) {
    registry.setEnabled('pos.ordering', true);
  }
  if (!registry.isEnabled('pos.promotions-display')) {
    registry.setEnabled('pos.promotions-display', true);
  }
  if (!registry.isEnabled(NATIVE_POS_DEVICE_MODULE_MANIFEST.id)) {
    registry.setEnabled(NATIVE_POS_DEVICE_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(CASH_REGISTER_MODULE_MANIFEST.id)) {
    registry.setEnabled(CASH_REGISTER_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(MENU_MODULE_MANIFEST.id)) {
    registry.setEnabled(MENU_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(WEBSITE_SEO_MODULE_MANIFEST.id)) {
    registry.setEnabled(WEBSITE_SEO_MODULE_MANIFEST.id, true);
  }
  if (!registry.isEnabled(TABLE_SESSION_MODULE_MANIFEST.id)) {
    registry.setEnabled(TABLE_SESSION_MODULE_MANIFEST.id, true);
  }
}

function writeJson(
  response: HttpHandlerInput['response'],
  statusCode: number,
  body: unknown,
  contentType = 'application/json',
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', `${contentType}; charset=utf-8`);
  response.end(JSON.stringify(body));
}

function writeTurtle(
  response: HttpHandlerInput['response'],
  statusCode: number,
  body: string,
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'text/turtle; charset=utf-8');
  response.setHeader('cache-control', 'public, max-age=60');
  response.setHeader('vary', 'host, x-forwarded-proto');
  response.end(body);
}

function requestBaseUrl(request: HttpHandlerInput['request']): string {
  const absolute = absoluteRequestBaseUrl(request.url);
  if (absolute) {
    return absolute;
  }

  const host = firstHeader(request.headers.host) ?? 'localhost';
  const proto = firstHeader(request.headers['x-forwarded-proto']) ?? 'http';
  return `${proto}://${host}/`;
}

function absoluteRequestBaseUrl(url: string | undefined): string | undefined {
  if (url === undefined) {
    return;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {}
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseModuleStateRoute(
  routeBase: string,
  method: string,
  url: string,
): { method: string; id: string } | undefined {
  const path = new URL(url, 'http://localhost').pathname;
  const prefix = `${routeBase}/modules/`;
  if (!path.startsWith(prefix)) {
    return;
  }
  const encoded = path.slice(prefix.length);
  if (encoded.length === 0 || encoded.includes('/')) {
    return;
  }
  try {
    return { method: method.toUpperCase(), id: decodeURIComponent(encoded) };
  } catch {}
}

function parseVerticalProfileRoute(
  routeBase: string,
  method: string,
  url: string,
): { method: string; id: string; action?: string } | undefined {
  const path = new URL(url, 'http://localhost').pathname;
  const prefix = `${routeBase}/vertical-profiles/`;
  if (!path.startsWith(prefix)) {
    return;
  }
  const parts = path.slice(prefix.length).split('/');
  if (parts.length === 0 || parts.length > 2 || parts[0].length === 0) {
    return;
  }
  try {
    return {
      method: method.toUpperCase(),
      id: decodeURIComponent(parts[0]),
      ...parts[1] === undefined ? {} : { action: parts[1] },
    };
  } catch {}
}

interface VerticalProfileDefaultPreview {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly contentType: 'text/turtle';
  readonly configTurtle: string;
}

interface VerticalProfileModuleSummary extends VerticalProfileModuleReference {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly capabilityMode: string;
  readonly manifest?: SolidModuleManifest;
  readonly unavailableReason?: string;
}

interface VerticalProfileSummary extends VerticalProfileManifest {
  readonly capabilityMode: 'css-enhanced';
  readonly controlPlaneAvailable: true;
  readonly canApply: boolean;
  readonly missingModules: readonly string[];
  readonly unavailableModules: readonly string[];
  readonly degradationReason?: string;
  readonly modules: readonly VerticalProfileModuleSummary[];
}

function verticalProfileDegradationReason(canApply: boolean, missingModules: readonly string[]): string | undefined {
  if (canApply) {
    return;
  }
  if (missingModules.length > 0) {
    return `Missing horizontal modules: ${missingModules.join(', ')}.`;
  }
  return 'Applying RDF defaults requires a ModuleConfigStore.';
}

async function readJsonBody<T>(request: HttpHandlerInput['request']): Promise<T> {
  let body = '';
  for await (const chunk of request) {
    body += requestChunkToString(chunk);
    if (Buffer.byteLength(body, 'utf8') > 65_536) {
      throw new Error('CMS request body is too large.');
    }
  }
  if (body.trim().length === 0) {
    throw new Error('CMS request body must be JSON.');
  }
  return JSON.parse(body) as T;
}

function requestChunkToString(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString('utf8');
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString('utf8');
  }
  throw new TypeError('CMS request body contained an unsupported chunk type.');
}

function errorStatusCode(error: unknown): number {
  return error instanceof HttpError && typeof error.statusCode === 'number' ? error.statusCode : 400;
}

/**
 * Shared read-back for a JSON-LD-backed CMS store: resolves the `?iri=` query parameter and returns the
 * persisted resource, or a safe error. Every persisted resource is also readable through plain LDP; this
 * is the CSS-enhanced convenience leg for the admin control plane.
 */
async function readPersistedResource(
  response: HttpHandlerInput['response'],
  store: { load: (iri: string, contentType?: string) => Promise<string | undefined> } | undefined,
  url: string | undefined,
  storeName: string,
): Promise<void> {
  try {
    if (!store) {
      throw new Error(`Reading persisted resources requires a ${storeName}.`);
    }
    const iri = new URL(url ?? '/', 'http://localhost').searchParams.get('iri');
    if (iri === null || iri.length === 0) {
      throw new Error('A persisted-resource read requires an ?iri= query parameter.');
    }
    const record = await store.load(iri);
    if (record === undefined) {
      writeJson(response, 404, { error: 'cms-resource-not-found' });
      return;
    }
    writeJson(response, 200, JSON.parse(record), 'application/ld+json');
  } catch (error: unknown) {
    writeJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Invalid persisted-resource read request.',
    });
  }
}

function buildOrderingFlowFromRequest(value: unknown): ReturnType<typeof buildWaiterOrderingFlow> {
  if (!isRecord(value)) {
    throw new TypeError('A POS order request must be a JSON object.');
  }
  const { channel, ...rest } = value;
  if (channel !== 'waiter' && channel !== 'customer-self-order') {
    throw new TypeError('A POS order request needs channel "waiter" or "customer-self-order".');
  }
  // The flow builders perform full field validation (throwing BadRequestHttpError on bad input).
  if (channel === 'waiter') {
    return buildWaiterOrderingFlow(rest as Omit<CustomerOrderingFlowInput, 'channel' | 'requireStaffReview'>);
  }
  return buildCustomerSelfOrderingFlow(rest as Omit<CustomerOrderingFlowInput, 'channel'>);
}

function assertReceiptDocInput(value: unknown): asserts value is ReceiptDocInput {
  if (!isRecord(value)) {
    throw new TypeError('A receipt build request must be a JSON object.');
  }
  if (!isRecord(value.org) || typeof value.org.name !== 'string') {
    throw new TypeError('A receipt build request needs org.name.');
  }
  if (typeof value.receiptId !== 'string') {
    throw new TypeError('A receipt build request needs receiptId.');
  }
  if (typeof value.date !== 'string') {
    throw new TypeError('A receipt build request needs date.');
  }
  if (typeof value.currency !== 'string') {
    throw new TypeError('A receipt build request needs currency.');
  }
  if (typeof value.digitalReceiptUrl !== 'string') {
    throw new TypeError('A receipt build request needs digitalReceiptUrl.');
  }
  if (!Array.isArray(value.lines)) {
    throw new TypeError('A receipt build request needs lines.');
  }
  for (const line of value.lines) {
    if (!isRecord(line) ||
      typeof line.name !== 'string' ||
      typeof line.quantity !== 'number' ||
      typeof line.unitPrice !== 'number') {
      throw new TypeError('Each receipt line needs name, quantity, and unitPrice.');
    }
  }
  if (value.taxPercent !== undefined && typeof value.taxPercent !== 'number') {
    throw new TypeError('A receipt taxPercent must be a number.');
  }
}

function assertMenuInput(value: unknown): asserts value is MenuInput {
  if (!isRecord(value)) {
    throw new TypeError('A menu build request must be a JSON object.');
  }
  if (typeof value.id !== 'string') {
    throw new TypeError('A menu build request needs id.');
  }
  if (typeof value.name !== 'string') {
    throw new TypeError('A menu build request needs name.');
  }
  if (typeof value.currency !== 'string') {
    throw new TypeError('A menu build request needs currency.');
  }
  if (!Array.isArray(value.sections)) {
    throw new TypeError('A menu build request needs sections.');
  }
  for (const section of value.sections) {
    if (!isRecord(section) || typeof section.name !== 'string' || !Array.isArray(section.items)) {
      throw new TypeError('Each menu section needs name and items.');
    }
    for (const item of section.items) {
      if (!isRecord(item) || typeof item.name !== 'string' || typeof item.price !== 'number') {
        throw new TypeError('Each menu item needs name and price.');
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
