import { Readable } from 'node:stream';
import type { HttpHandlerInput } from '../../../../src/server/HttpHandler';
import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { CmsHttpHandler } from '../../../../src/databox/cms/CmsHttpHandler';
import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/cms/DataboxModuleRegistry';
import { ModuleConfigStore } from '../../../../src/databox/cms/ModuleConfigStore';
import { CashRegisterStore } from '../../../../src/databox/cms/CashRegisterStore';
import { openCashRegisterSession } from '../../../../src/databox/cms/modules/pos/CashRegister';
import { CustomerDisplayStore } from '../../../../src/databox/cms/CustomerDisplayStore';
import { parseModuleManifestIndexRdf } from '../../../../src/databox/cms/ModuleManifestDiscovery';
import { parseModuleManifestRdf } from '../../../../src/databox/cms/ModuleManifestRdf';
import { PosOrderStore } from '../../../../src/databox/cms/PosOrderStore';
import { PublicWebsiteStore } from '../../../../src/databox/cms/PublicWebsiteStore';
import { TableSessionStore } from '../../../../src/databox/cms/TableSessionStore';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const token = 'cms-control-token-0123456789012345';
const sameLengthWrong = 'cms-control-token-9999999999999999';

class MockResponse {
  public statusCode = 0;
  public readonly headers: Record<string, string> = {};
  public body = '';
  public setHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  public end(body?: string): void {
    this.body = body ?? '';
  }
}

function input(
  res: MockResponse,
  opts: { url?: string; method?: string; auth?: string; body?: string; host?: string },
): HttpHandlerInput {
  const request = opts.body === undefined ? {} : Readable.from([ opts.body ]);
  Object.assign(request, {
    url: opts.url,
    method: opts.method,
    headers: { authorization: opts.auth, host: opts.host },
  });
  return {
    request,
    response: res,
  } as unknown as HttpHandlerInput;
}

function posOrderBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    channel: 'waiter',
    cartId: 'http://localhost:3000/pos/carts/c-1',
    orderId: 'http://localhost:3000/pos/orders/o-1',
    ticketId: 'http://localhost:3000/pos/tickets/t-1',
    orderNumber: 'O-1',
    ticketNumber: 'T-1',
    seller: 'http://localhost:3000/profile/card#org',
    currency: 'AUD',
    createdAt: '2026-07-19T11:00:00.000Z',
    lines: [{
      lineId: 'line-1',
      product: 'http://localhost:3000/catalogue/flat-white#item',
      name: 'Flat white',
      quantity: 2,
      unitPrice: 4.8,
    }],
    serviceMode: 'table',
    ...overrides,
  });
}

function cashRegisterOpenBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sessionId: 's-1',
    registerId: 'reg-1',
    registerName: 'Front register',
    operatorSession: {
      sessionId: 'op-1',
      webId: 'https://op.example/profile/card#me',
      roleIri: 'https://op.example/roles/cashier',
      startedAt: '2026-07-19T10:00:00.000Z',
    },
    openedAt: '2026-07-19T11:00:00.000Z',
    currency: 'AUD',
    openingFloat: 100,
    ...overrides,
  });
}

function customerDisplayBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    displayIri: 'http://localhost:3000/pos/display',
    input: {
      business: { id: 'http://localhost:3000/profile/card#org', name: 'Corner Cafe' },
      transaction: {
        id: 'http://localhost:3000/pos/orders/o-1',
        orderNumber: 'O-1',
        status: 'pending-payment',
        currency: 'AUD',
        lines: [{ name: 'Flat white', quantity: 2, unitPrice: 4.8 }],
        subtotal: 9.6,
        total: 9.6,
      },
      links: {
        shopAppInstallUrl: 'https://apps.example/shop',
        solidVaultConnectUrl: 'https://vault.example/connect',
      },
      slides: [{ id: 'http://localhost:3000/ads/welcome#slide', title: 'Welcome' }],
      generatedAt: '2026-07-19T11:00:00.000Z',
    },
    ...overrides,
  });
}

function websitePublishBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    baseIri: 'http://localhost:3000/www/',
    feed: {
      business: { id: 'http://localhost:3000/profile/card#org', name: 'Test Cafe', url: 'http://localhost:3000/' },
      catalogue: [{
        id: 'http://localhost:3000/catalogue/flat-white#item',
        name: 'Flat white',
        price: 4.8,
        currency: 'AUD',
      }],
    },
    ...overrides,
  });
}

function websiteSeoBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    baseIri: 'http://localhost:3000/www/',
    sitemap: { pages: ['http://localhost:3000/www/'] },
    robots: { siteUrl: 'http://localhost:3000/', sitemapUrl: 'http://localhost:3000/www/sitemap.xml' },
    ...overrides,
  });
}

function websiteSitemapBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    baseIri: 'http://localhost:3000/www/',
    businessUrl: 'http://localhost:3000/',
    catalogueItemIds: ['http://localhost:3000/catalogue/flat-white#item'],
    ...overrides,
  });
}

describe('A CmsHttpHandler', (): void => {
  let registry: InMemoryDataboxModuleRegistry;
  let handler: CmsHttpHandler;
  let storeData: Map<string, string>;
  let configStore: ModuleConfigStore;
  let orderStore: PosOrderStore;
  let cashRegisterStore: CashRegisterStore;
  let customerDisplayStore: CustomerDisplayStore;
  let publicWebsiteStore: PublicWebsiteStore;
  let tableSessionStore: TableSessionStore;

  beforeEach((): void => {
    registry = new InMemoryDataboxModuleRegistry();
    storeData = new Map<string, string>();
    const store = {
      hasResource: async(id: ResourceIdentifier): Promise<boolean> => storeData.has(id.path),
      getRepresentation: async(id: ResourceIdentifier): Promise<Representation> =>
        new BasicRepresentation(storeData.get(id.path) ?? '', 'text/turtle'),
      setRepresentation: async(id: ResourceIdentifier, representation: Representation): Promise<void> => {
        storeData.set(id.path, await readableToString(representation.data));
      },
    } as unknown as ResourceStore;
    configStore = new ModuleConfigStore(store, 'http://localhost:3000/');
    orderStore = new PosOrderStore(store, 'http://localhost:3000/');
    cashRegisterStore = new CashRegisterStore(store, 'http://localhost:3000/');
    customerDisplayStore = new CustomerDisplayStore(store, 'http://localhost:3000/');
    publicWebsiteStore = new PublicWebsiteStore(store, 'http://localhost:3000/');
    tableSessionStore = new TableSessionStore(store, 'http://localhost:3000/');
    handler = new CmsHttpHandler(registry, token);
  });

  function posStoresHandler(): CmsHttpHandler {
    return new CmsHttpHandler(
      registry,
      token,
      '/.databox/cms',
      configStore,
      undefined,
      orderStore,
      cashRegisterStore,
      customerDisplayStore,
      publicWebsiteStore,
      tableSessionStore,
    );
  }

  it('rejects a control token shorter than 32 bytes.', (): void => {
    expect((): CmsHttpHandler => new CmsHttpHandler(registry, 'too-short'))
      .toThrow('at least 32 bytes');
  });

  describe('canHandle()', (): void => {
    it('accepts the exact base and sub-paths.', async(): Promise<void> => {
      await expect(handler.canHandle(input(new MockResponse(), { url: '/.databox/cms' }))).resolves.toBeUndefined();
      await expect(handler.canHandle(input(new MockResponse(), { url: '/.databox/cms/modules' })))
        .resolves.toBeUndefined();
    });

    it('accepts the public .well-known manifest discovery resources.', async(): Promise<void> => {
      await expect(handler.canHandle(input(new MockResponse(), { url: '/.well-known/databox-cms' })))
        .resolves.toBeUndefined();
      await expect(handler.canHandle(input(new MockResponse(), {
        url: '/.well-known/databox-cms/modules/hosting.ttl',
      }))).resolves.toBeUndefined();
    });

    it('rejects other paths, including a missing URL.', async(): Promise<void> => {
      await expect(handler.canHandle(input(new MockResponse(), { url: '/other' })))
        .rejects.toThrow('Not a Databox CMS route.');
      await expect(handler.canHandle(input(new MockResponse(), {})))
        .rejects.toThrow('Not a Databox CMS route.');
    });

    it('normalises a custom route base without a leading and with a trailing slash.', async(): Promise<void> => {
      const custom = new CmsHttpHandler(registry, token, 'databox/cms/');
      await expect(custom.canHandle(input(new MockResponse(), { url: '/databox/cms/x' })))
        .resolves.toBeUndefined();
      await expect(custom.canHandle(input(new MockResponse(), { url: '/other' })))
        .rejects.toThrow('Not a Databox CMS route.');
    });
  });

  describe('handle()', (): void => {
    it('publishes a public .well-known manifest index without module state.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore);
      await configStore.setEnabled('hosting', false);

      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.well-known/databox-cms',
        method: 'GET',
        host: 'databox.example',
      }));

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/turtle');
      expect(res.headers['cache-control']).toContain('public');
      expect(res.body).toContain('ldp:contains');
      expect(res.body).not.toContain('enabled');
      expect(parseModuleManifestIndexRdf(res.body)).toMatchObject({
        indexIri: 'http://databox.example/.well-known/databox-cms',
        manifestUrls: expect.arrayContaining([
          'http://databox.example/.well-known/databox-cms/modules/hosting.ttl',
          'http://databox.example/.well-known/databox-cms/modules/receipt.ttl',
        ]),
      });
    });

    it('publishes a public per-module Turtle manifest that round-trips through the RDF parser.', async():
    Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.well-known/databox-cms/modules/hosting.ttl',
        method: 'GET',
        host: 'databox.example',
      }));

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/turtle');
      expect(res.body).not.toContain('urn:solid-server:databox:cms#enabled');
      expect(parseModuleManifestRdf(res.body, {
        subjectIri: 'http://databox.example/.well-known/databox-cms/modules/hosting.ttl',
      })).toMatchObject({
        id: 'hosting',
        name: 'Hosting',
        routes: expect.arrayContaining([
          'POST /.databox/cms/hosting/plan',
          'POST /.databox/cms/hosting/apply',
          'POST /.databox/cms/hosting/persist',
          'POST /.databox/cms/hosting/bind',
          'POST /.databox/cms/hosting/artifacts',
        ]),
      });
    });

    it('returns 404 for a missing public module manifest resource.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.well-known/databox-cms/modules/not-installed.ttl',
        method: 'GET',
      }));

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'module-manifest-not-found' });
    });

    it('fails closed instead of publishing malformed registered manifests.', async(): Promise<void> => {
      registry.register({
        id: 'bad',
        name: '',
        version: '0.1.0',
        description: 'Malformed on purpose.',
        capabilities: [],
        routes: [],
      });

      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.well-known/databox-cms/modules/bad.ttl',
        method: 'GET',
      }));

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({
        error: 'CMS module manifest name must be a non-empty string.',
      });
    });

    it('returns 401 without, or with an invalid, bearer token.', async(): Promise<void> => {
      const invalidAuths = [
        undefined,
        'Basic abc',
        'Bearer short',
        `Bearer ${sameLengthWrong}`,
      ];
      for (const auth of invalidAuths) {
        const res = new MockResponse();
        await handler.handle(input(res, { url: '/.databox/cms/modules', method: 'GET', auth }));
        expect(res.statusCode).toBe(401);
      }
    });

    it('lists module manifests for the built-in route with a valid token.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, { url: '/.databox/cms/modules', auth: `Bearer ${token}` }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'hosting',
          name: 'Hosting',
          enabled: true,
          capabilityMode: 'css-enhanced',
          adminUi: {
            navLabel: 'Hosting',
            path: '/hosting',
          },
        }),
        expect.objectContaining({
          id: 'receipt',
          name: 'Receipt Writer',
          enabled: true,
          capabilityMode: 'css-enhanced',
          capabilities: expect.arrayContaining([
            'cms:receipt-document',
            'cms:portable-core-receipt-doc',
            'cms:css-enhanced-receipt-build-route',
          ]),
          routes: [ 'POST /.databox/cms/receipt/build' ],
        }),
        expect.objectContaining({
          id: 'menu',
          name: 'Menu',
          enabled: true,
          capabilityMode: 'css-enhanced',
          capabilities: expect.arrayContaining([
            'cms:portable-core-schema-org-menu',
            'cms:css-enhanced-menu-build-route',
          ]),
          routes: [ 'POST /.databox/cms/menu/build' ],
        }),
        expect.objectContaining({
          id: 'website-seo',
          name: 'Website SEO and Public Feed',
          enabled: true,
          capabilityMode: 'css-enhanced',
          capabilities: expect.arrayContaining([
            'cms:portable-core-schema-org-rdf',
            'cms:standard-solid-rdf-input',
            'cms:css-enhanced-public-preview-route',
          ]),
          routes: [ 'POST /.databox/cms/website/preview', 'POST /.databox/cms/website/publish' ],
        }),
      ]));
    });

    it('lists lighthouse vertical profiles with missing horizontal module detail.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, { url: '/.databox/cms/vertical-profiles', auth: `Bearer ${token}` }));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'food.restaurant',
          name: 'Food / Restaurant',
          capabilityMode: 'css-enhanced',
          controlPlaneAvailable: true,
          canApply: false,
          missingModules: expect.arrayContaining([ 'catalogue', 'payments' ]),
          modules: expect.arrayContaining([
            expect.objectContaining({
              moduleId: 'receipt',
              available: true,
              enabled: true,
              capabilityMode: 'css-enhanced',
            }),
            expect.objectContaining({
              moduleId: 'menu',
              available: true,
              enabled: true,
              capabilityMode: 'css-enhanced',
            }),
            expect.objectContaining({
              moduleId: 'website-seo',
              available: true,
              enabled: true,
              capabilityMode: 'css-enhanced',
            }),
          ]),
        }),
        expect.objectContaining({
          id: 'health.privacy-consent',
          missingModules: expect.arrayContaining([ 'access-request', 'break-glass' ]),
        }),
      ]));
    });

    it('previews vertical profile defaults without mutating module state.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore);

      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/vertical-profiles/food.restaurant/preview',
        method: 'POST',
        auth: `Bearer ${token}`,
      }));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        id: 'food.restaurant',
        operation: 'preview',
        persisted: false,
        defaults: expect.arrayContaining([
          expect.objectContaining({
            moduleId: 'catalogue',
            enabled: true,
            configTurtle: expect.stringContaining('https://schema.org/itemListOrder'),
          }),
        ]),
      });
      await expect(configStore.load('catalogue')).resolves.toBeUndefined();
    });

    it('applies a vertical profile only when every referenced module is installed.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore);

      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/vertical-profiles/food.restaurant/apply',
        method: 'POST',
        auth: `Bearer ${token}`,
      }));

      expect(res.statusCode).toBe(400);
      const parsed = JSON.parse(res.body) as { error: string };
      expect(parsed.error).toContain('Vertical profile food.restaurant references missing modules');
      expect(parsed.error).toContain('catalogue, stock, payments');
      expect(parsed.error).toContain('opening-hours');
      expect(parsed.error).toContain('barcode');
      expect(parsed.error).toContain('accounting');
    });

    it('reads and writes module state through the portable RDF config store.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore);

      const write = new MockResponse();
      await handler.handle(input(write, {
        url: '/.databox/cms/modules/hosting',
        method: 'PUT',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          enabled: false,
          configTurtle: '<> <urn:example:theme> "high-contrast" .',
        }),
      }));
      expect(write.statusCode).toBe(200);
      expect(JSON.parse(write.body)).toMatchObject({
        id: 'hosting',
        enabled: false,
        configTurtle: expect.stringContaining('urn:example:theme'),
      });
      expect(storeData.get('http://localhost:3000/.databox/cms/modules/hosting'))
        .toContain('urn:solid-server:databox:cms#enabled');

      const read = new MockResponse();
      await handler.handle(input(read, {
        url: '/.databox/cms/modules/hosting',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(read.statusCode).toBe(200);
      expect(JSON.parse(read.body)).toMatchObject({
        id: 'hosting',
        enabled: false,
        configTurtle: expect.stringContaining('high-contrast'),
      });
    });

    it('exports a portable CMS works bundle with module manifests and RDF state.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore);
      await configStore.setEnabled('hosting', true);

      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/works',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/ld+json');
      const bundle = JSON.parse(res.body);
      expect(bundle).toMatchObject({
        type: 'DataboxCmsWorks',
        portability: {
          canonicalStore: 'Solid LDP/RDF resources',
          backendTargets: expect.arrayContaining([ 'Oxigraph SPARQL 1.1 backend' ]),
        },
      });
      expect(bundle.modules).toEqual(expect.arrayContaining([
        expect.objectContaining({
          manifest: expect.objectContaining({ id: 'hosting' }),
          enabled: true,
          state: {
            contentType: 'text/turtle',
            turtle: expect.stringContaining('urn:solid-server:databox:cms#enabled'),
          },
        }),
        expect.objectContaining({
          manifest: expect.objectContaining({ id: 'receipt' }),
          enabled: true,
        }),
      ]));
    });

    it('imports a portable CMS works bundle through the control plane.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore);
      const bundle = {
        '@context': {},
        type: 'DataboxCmsWorks',
        generatedAt: '2026-07-19T00:00:00.000Z',
        portability: {
          canonicalStore: 'Solid LDP/RDF resources',
          cssEnhanced: 'CMS control plane is an optional interpreter, not the canonical store',
          backendTargets: [ 'Oxigraph SPARQL 1.1 backend' ],
          nonPortableRuntimeWork: [ 'control-plane bearer tokens' ],
        },
        modules: [
          {
            manifest: {
              id: 'catalogue',
              name: 'Catalogue',
              version: '0.1.0',
              description: 'Product catalogue.',
              capabilities: [ 'cms:catalogue' ],
              routes: [],
            },
            enabled: true,
            state: {
              contentType: 'text/turtle',
              turtle: '<> <urn:example:imported> "yes" .',
            },
          },
        ],
      };

      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/works/import',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify(bundle),
      }));

      expect(res.statusCode).toBe(200);
      expect(registry.get('catalogue')).toMatchObject({ id: 'catalogue' });
      const parsed = JSON.parse(res.body);
      expect(parsed).toMatchObject({
        type: 'DataboxCmsWorks',
      });
      expect(parsed.modules).toEqual(expect.arrayContaining([
        expect.objectContaining({
          manifest: expect.objectContaining({ id: 'catalogue' }),
          enabled: true,
          state: {
            contentType: 'text/turtle',
            turtle: expect.stringContaining('urn:example:imported'),
          },
        }),
      ]));
    });

    it('derives a hosting plan from authorized JSON input.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/hosting/plan',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          apexDomain: 'example.org',
          originTarget: '203.0.113.10',
          wwwEnabled: true,
        }),
      }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        databoxHost: 'databox.example.org',
        wwwHost: 'www.example.org',
        devicesHost: 'devices.example.org',
        baseUrl: 'https://databox.example.org/',
        dnsRecords: [
          { type: 'A', name: 'databox.example.org', proxied: true },
          { type: 'A', name: 'devices.example.org', proxied: false },
          { type: 'A', name: 'www.example.org', proxied: true },
        ],
      });
    });

    it('returns a safe 400 for invalid hosting input.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/hosting/plan',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({ apexDomain: 'localhost', originTarget: '' }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'A hosting plan needs an apex domain such as "acme.org".' });
    });

    it('builds a printable receipt document from authorized JSON input.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/receipt/build',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          org: { name: 'Acme Pty Ltd', abn: '12 345 678 901' },
          receiptId: 'R-100',
          date: '2026-07-19',
          lines: [
            { name: 'Widget', quantity: 2, unitPrice: 5 },
            { name: 'Gadget', quantity: 1, unitPrice: 9.99 },
          ],
          currency: 'AUD',
          taxPercent: 10,
          digitalReceiptUrl: 'https://pod.example.org/receipts/r-100',
        }),
      }));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        receiptId: 'R-100',
        subtotal: '19.99',
        tax: '2.00',
        total: '21.99',
        qr: {
          payload: 'https://pod.example.org/receipts/r-100',
          caption: 'Scan for your digital receipt',
        },
        nativeEdgePrintJob: {
          capability: 'native-edge:thermal-receipt-print',
          status: 'unavailable',
          unavailableReason: 'No Rust/native-edge printer connector is attached to this CMS control plane.',
          boundary: {
            hardwareIo: 'native-edge-only',
            browserAction: 'generate-descriptor-only',
          },
        },
      });
    });

    it('builds menu JSON-LD through the protected menu module route.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/menu/build',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          id: 'https://www.example.org/menu/lunch',
          name: 'Lunch Menu',
          currency: 'AUD',
          sections: [
            {
              name: 'Mains',
              items: [
                { name: 'Burger', price: 12.5 },
              ],
            },
          ],
        }),
      }));

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/ld+json');
      expect(JSON.parse(res.body)).toMatchObject({
        '@context': 'https://schema.org/',
        '@type': 'Menu',
        '@id': 'https://www.example.org/menu/lunch',
        name: 'Lunch Menu',
      });
    });

    it('previews public website output from Solid Turtle state through the protected website module route.', async():
    Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/website/preview',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          state: {
            contentType: 'text/turtle',
            baseIri: 'https://www.example.org/public.ttl',
            turtle: `
              @prefix schema: <https://schema.org/> .

              <#business> a schema:LocalBusiness ;
                schema:name "Corner Cafe" ;
                schema:url <https://www.example.org/> .

              <menu/breakfast> a schema:Menu ;
                schema:name "Breakfast Menu" ;
                schema:hasMenuSection [
                  a schema:MenuSection ;
                  schema:name "Coffee" ;
                  schema:hasMenuItem [
                    a schema:MenuItem ;
                    schema:name "Flat white" ;
                    schema:offers [
                      a schema:Offer ;
                      schema:price "4.50" ;
                      schema:priceCurrency "AUD"
                    ]
                  ]
                ] .
            `,
          },
          publicPath: '/menu',
          cacheMaxAgeSeconds: 120,
        }),
      }));

      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed).toMatchObject({
        publicPath: '/menu',
        requiresControlToken: false,
        jsonLd: {
          '@context': 'https://schema.org/',
          '@type': 'WebPage',
        },
      });
      expect(parsed.html).toContain('<h1>Corner Cafe</h1>');
      expect(parsed.html).toContain('Flat white');
      expect(parsed.html).not.toContain('/.databox/cms');
    });

    it('returns a safe 400 for invalid receipt build input.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/receipt/build',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          org: { name: 'Acme Pty Ltd' },
          receiptId: 'R-101',
          date: '2026-07-19',
          lines: [
            { name: 'Widget', quantity: 1, unitPrice: 1 },
          ],
          currency: 'AUD',
          digitalReceiptUrl: 'not-a-uri',
        }),
      }));

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({
        error: 'A receipt digitalReceiptUrl must be an absolute URI.',
      });
    });

    it('persists a waiter POS order flow through the ResourceStore and reads it back.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore, undefined, orderStore);

      const write = new MockResponse();
      await handler.handle(input(write, {
        url: '/.databox/cms/pos/orders',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: posOrderBody(),
      }));
      expect(write.statusCode).toBe(201);
      expect(write.headers['content-type']).toContain('application/ld+json');
      const created = JSON.parse(write.body);
      expect(created).toMatchObject({
        channel: 'waiter',
        status: 'ready-for-fulfilment',
        persisted: expect.arrayContaining([
          expect.objectContaining({ role: 'order', iri: 'http://localhost:3000/pos/orders/o-1' }),
        ]),
      });
      expect(storeData.get('http://localhost:3000/pos/orders/o-1')).toContain('O-1');

      const read = new MockResponse();
      await handler.handle(input(read, {
        url: '/.databox/cms/pos/orders?iri=http%3A%2F%2Flocalhost%3A3000%2Fpos%2Forders%2Fo-1',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(read.statusCode).toBe(200);
      expect(read.headers['content-type']).toContain('application/ld+json');
      expect(JSON.parse(read.body)).toMatchObject({ '@type': 'Order' });
    });

    it('holds a customer self-order for staff review.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore, undefined, orderStore);
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: posOrderBody({ channel: 'customer-self-order' }),
      }));
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body)).toMatchObject({
        channel: 'customer-self-order',
        status: 'requires-staff-review',
      });
    });

    it('returns a safe 400 for an invalid POS order channel.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore, undefined, orderStore);
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: posOrderBody({ channel: 'nope' }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('channel');
    });

    it('propagates the flow builder status code for an out-of-pod resource IRI.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore, undefined, orderStore);
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: posOrderBody({ orderId: 'https://elsewhere.example/orders/o-1' }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('pod storage space');
    });

    it('returns 400 when persisting a POS order without a configured order store.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: posOrderBody(),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('requires a PosOrderStore');
    });

    it('returns 404 when reading a POS order resource that does not exist.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore, undefined, orderStore);
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders?iri=http%3A%2F%2Flocalhost%3A3000%2Fpos%2Forders%2Fabsent',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'pos-resource-not-found' });
    });

    it('returns 400 when reading a POS order without an iri query parameter.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore, undefined, orderStore);
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('?iri=');
    });

    it('returns 400 when reading a POS order without a configured order store.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders?iri=http%3A%2F%2Flocalhost%3A3000%2Fpos%2Forders%2Fo-1',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('requires a PosOrderStore');
    });

    it('returns a safe 400 when a POS order request body is not a JSON object.', async(): Promise<void> => {
      handler = new CmsHttpHandler(registry, token, '/.databox/cms', configStore, undefined, orderStore);
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/orders',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify([ 'not', 'an', 'object' ]),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('must be a JSON object');
    });

    it('opens and persists a cash register session, then reads it back.', async(): Promise<void> => {
      handler = posStoresHandler();

      const open = new MockResponse();
      await handler.handle(input(open, {
        url: '/.databox/cms/pos/register/sessions',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: cashRegisterOpenBody(),
      }));
      expect(open.statusCode).toBe(201);
      const opened = JSON.parse(open.body);
      expect(opened.persisted).toMatchObject({
        iri: 'http://localhost:3000/pos/registers/reg-1/sessions/s-1',
        contentType: 'application/ld+json',
      });

      const read = new MockResponse();
      await handler.handle(input(read, {
        url: '/.databox/cms/pos/register/sessions?iri=http%3A%2F%2Flocalhost%3A3000%2Fpos%2Fregisters%2Freg-1%2F' +
          'sessions%2Fs-1',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(read.statusCode).toBe(200);
      expect(JSON.parse(read.body)).toMatchObject({ '@type': 'SaleEvent' });
    });

    it('closes a cash register session with a counted total.', async(): Promise<void> => {
      handler = posStoresHandler();
      const { session } = openCashRegisterSession(JSON.parse(cashRegisterOpenBody()));
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/register/sessions/close',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          session,
          closedAt: '2026-07-19T18:00:00.000Z',
          closedBy: 'https://op.example/profile/card#me',
          closeReason: 'end-of-shift',
          cashSalesTotal: 40,
          countedCash: 140,
        }),
      }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).persisted).toMatchObject({
        iri: 'http://localhost:3000/pos/registers/reg-1/sessions/s-1',
      });
    });

    it('returns 400 when persisting a cash register session without a store.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/register/sessions',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: cashRegisterOpenBody(),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('requires a CashRegisterStore');
    });

    it('renders and persists a customer display playlist, then reads it back.', async(): Promise<void> => {
      handler = posStoresHandler();

      const write = new MockResponse();
      await handler.handle(input(write, {
        url: '/.databox/cms/pos/display',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: customerDisplayBody(),
      }));
      expect(write.statusCode).toBe(201);
      expect(JSON.parse(write.body).persisted).toMatchObject({
        iri: 'http://localhost:3000/pos/display',
        contentType: 'application/ld+json',
      });

      const read = new MockResponse();
      await handler.handle(input(read, {
        url: '/.databox/cms/pos/display?iri=http%3A%2F%2Flocalhost%3A3000%2Fpos%2Fdisplay',
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(read.statusCode).toBe(200);
      expect(JSON.parse(read.body)).toMatchObject({ '@type': 'PresentationDigitalDocument' });
    });

    it('returns 400 for a customer display request missing displayIri.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/display',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: customerDisplayBody({ displayIri: undefined }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('displayIri');
    });

    it('publishes rendered public website assets through the ResourceStore.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/website/publish',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: websitePublishBody(),
      }));
      expect(res.statusCode).toBe(201);
      const published = JSON.parse(res.body).published;
      expect(published).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'html', iri: 'http://localhost:3000/www/index.html' }),
        expect.objectContaining({ role: 'json-ld', iri: 'http://localhost:3000/www/data.jsonld' }),
      ]));
    });

    it('returns 400 for a website publish request missing a feed object.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/website/publish',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({ baseIri: 'http://localhost:3000/www/' }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('feed object');
    });

    it('publishes rendered SEO assets (sitemap and robots) through the ResourceStore.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/website/seo',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: websiteSeoBody(),
      }));
      expect(res.statusCode).toBe(201);
      const published = JSON.parse(res.body).published;
      expect(published).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'sitemap', iri: 'http://localhost:3000/www/sitemap.xml' }),
        expect.objectContaining({ role: 'robots', iri: 'http://localhost:3000/www/robots.txt' }),
      ]));
    });

    it('returns 400 for a website seo request missing a pages array.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/website/seo',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          baseIri: 'http://localhost:3000/www/',
          sitemap: { lastmod: '2026-07-20T00:00:00.000Z' },
        }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('pages array');
    });

    it('publishes a sitemap derived from business parameters through the ResourceStore.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/website/sitemap',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: websiteSitemapBody(),
      }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.published).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'sitemap', iri: 'http://localhost:3000/www/sitemap.xml' }),
      ]));
      expect(body.sitemap.xml).toContain('http://localhost:3000/catalogue/flat-white#item');
    });

    it('returns 400 for a website sitemap request missing a businessUrl.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/website/sitemap',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({ baseIri: 'http://localhost:3000/www/' }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('businessUrl');
    });

    it('returns 404 for an unknown authorized route (including a missing URL).', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, { url: '/.databox/cms/nope', method: 'GET', auth: `Bearer ${token}` }));
      expect(res.statusCode).toBe(404);

      const res2 = new MockResponse();
      await handler.handle(input(res2, { auth: `Bearer ${token}` }));
      expect(res2.statusCode).toBe(404);
    });

    it('creates a table session through the ResourceStore.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/tables/sessions',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          sessionId: 'ts-1',
          tableId: 'table-5',
          tableLabel: 'Table 5',
          state: 'occupied',
          shopId: 'http://localhost:3000/profile/card#org',
          startedAt: '2026-07-19T11:00:00.000Z',
        }),
      }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.persisted.iri).toContain('table-5/sessions/ts-1');
      expect(body.session['@type']).toBe('FoodEstablishmentReservation');
    });

    it('closes a table session through the ResourceStore.', async(): Promise<void> => {
      handler = posStoresHandler();
      const session = {
        sessionId: 'ts-1',
        tableId: 'table-5',
        tableLabel: 'Table 5',
        state: 'occupied' as const,
        shopId: 'http://localhost:3000/profile/card#org',
        startedAt: '2026-07-19T11:00:00.000Z',
        linkedOrderIds: [],
      };
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/tables/sessions/close',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({ session, endedAt: '2026-07-19T12:00:00.000Z' }),
      }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.session['@type']).toBe('FoodEstablishmentReservation');
    });

    it('reads a table session back via GET.', async(): Promise<void> => {
      handler = posStoresHandler();
      const createRes = new MockResponse();
      await handler.handle(input(createRes, {
        url: '/.databox/cms/pos/tables/sessions',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          sessionId: 'ts-2',
          tableId: 'table-3',
          tableLabel: 'Table 3',
          state: 'ordering',
          shopId: 'http://localhost:3000/profile/card#org',
          startedAt: '2026-07-19T11:00:00.000Z',
        }),
      }));
      expect(createRes.statusCode).toBe(201);
      const iri = JSON.parse(createRes.body).persisted.iri;

      const readRes = new MockResponse();
      await handler.handle(input(readRes, {
        url: `/.databox/cms/pos/tables/sessions?iri=${encodeURIComponent(iri)}`,
        method: 'GET',
        auth: `Bearer ${token}`,
      }));
      expect(readRes.statusCode).toBe(200);
      expect(JSON.parse(readRes.body)['@type']).toBe('FoodEstablishmentReservation');
    });

    it('pushes incremental display state updates.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/display/state',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          displayIri: 'http://localhost:3000/pos/display',
          state: {
            mode: 'transaction',
            activeSlideId: 'slide-1',
            transactionStatus: 'pending-payment',
            lastUpdatedAt: '2026-07-19T11:05:00.000Z',
          },
        }),
      }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.persisted.iri).toContain('display-state');
      expect(body.state.mode).toBe('transaction');
    });

    it('creates a standalone Wi-Fi onboarding resource.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/wifi-onboarding',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          id: 'http://localhost:3000/wifi/onboarding-1',
          tableSession: 'http://localhost:3000/pos/tables/table-5/sessions/ts-1',
          landingUrl: 'http://localhost:3000/wifi/landing',
          qrUrl: 'http://localhost:3000/wifi/qr',
          networkSsid: 'CafeGuest',
        }),
      }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.record['@type']).toBe('EntryPoint');
      expect(body.persisted.iri).toBe('http://localhost:3000/wifi/onboarding-1');
    });

    it('returns 400 for a display state request with an invalid mode.', async(): Promise<void> => {
      handler = posStoresHandler();
      const res = new MockResponse();
      await handler.handle(input(res, {
        url: '/.databox/cms/pos/display/state',
        method: 'POST',
        auth: `Bearer ${token}`,
        body: JSON.stringify({
          displayIri: 'http://localhost:3000/pos/display',
          state: {
            mode: 'invalid-mode',
            lastUpdatedAt: '2026-07-19T11:05:00.000Z',
          },
        }),
      }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('mode must be one of');
    });
  });
});
