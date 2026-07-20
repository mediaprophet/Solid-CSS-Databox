import fetch from 'cross-fetch';
import type { App } from '../../src/init/App';
import { parseModuleManifestIndexRdf } from '../../src/databox/cms/ModuleManifestDiscovery';
import { parseModuleManifestRdf } from '../../src/databox/cms/ModuleManifestRdf';
import { getPort } from '../util/Util';
import { getDefaultVariables, getTestConfigPath, instantiateFromConfig } from './Config';

const port = getPort('DataboxCms');
const baseUrl = `http://localhost:${port}/`;
const controlToken = 'cms-integration-control-token-00000001';
const modulesRoute = `${baseUrl}.databox/cms/modules`;
const discoveryRoute = `${baseUrl}.well-known/databox-cms`;

describe('the Databox CMS control plane in Community Solid Server', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    const instances = await instantiateFromConfig(
      'urn:solid-server:test:Instances',
      getTestConfigPath('cms.json'),
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:cms:variable:controlToken': controlToken,
      },
    ) as { app: App };
    ({ app } = instances);
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    await app.stop();
  });

  it('protects the control plane: no bearer token yields 401.', async(): Promise<void> => {
    const response = await fetch(modulesRoute);
    expect(response.status).toBe(401);
  });

  it('serves the built-in modules route with a valid control token.', async(): Promise<void> => {
    const response = await fetch(modulesRoute, { headers: { authorization: `Bearer ${controlToken}` }});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'hosting',
        enabled: true,
        adminUi: expect.objectContaining({
          navLabel: 'Hosting',
          path: '/hosting',
        }),
      }),
    ]));
  });

  it('publishes installed module manifests through public standard-Solid discovery.', async(): Promise<void> => {
    const indexResponse = await fetch(discoveryRoute);
    expect(indexResponse.status).toBe(200);
    expect(indexResponse.headers.get('content-type')).toContain('text/turtle');
    const indexTurtle = await indexResponse.text();
    expect(indexTurtle).toContain('ldp:contains');
    expect(indexTurtle).not.toContain('urn:solid-server:databox:cms#enabled');

    const index = parseModuleManifestIndexRdf(indexTurtle, discoveryRoute);
    expect(index).toMatchObject({
      indexIri: discoveryRoute,
      manifestUrls: expect.arrayContaining([
        `${discoveryRoute}/modules/hosting.ttl`,
        `${discoveryRoute}/modules/receipt.ttl`,
      ]),
    });

    const manifestUrl = index.manifestUrls.find((url): boolean => url.endsWith('/modules/hosting.ttl'));
    expect(manifestUrl).toBeDefined();
    const manifestResponse = await fetch(manifestUrl!);
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers.get('content-type')).toContain('text/turtle');
    const manifestTurtle = await manifestResponse.text();
    expect(manifestTurtle).not.toContain('urn:solid-server:databox:cms#enabled');
    expect(parseModuleManifestRdf(manifestTurtle, { subjectIri: manifestUrl })).toMatchObject({
      id: 'hosting',
      name: 'Hosting',
      routes: [ 'POST /.databox/cms/hosting/plan' ],
    });
  });

  it('returns 404 for a missing public module manifest without requiring a control token.', async(): Promise<void> => {
    const response = await fetch(`${discoveryRoute}/modules/not-installed.ttl`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'module-manifest-not-found' });
  });

  it('derives a hosting plan over the protected control plane.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/cms/hosting/plan`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        apexDomain: 'example.org',
        originTarget: 'databox-origin.example.net',
        wwwEnabled: true,
      }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      databoxHost: 'databox.example.org',
      wwwHost: 'www.example.org',
      devicesHost: 'devices.example.org',
      baseUrl: 'https://databox.example.org/',
      dnsRecords: [
        { type: 'CNAME', name: 'databox.example.org', content: 'databox-origin.example.net', proxied: true },
        { type: 'CNAME', name: 'devices.example.org', content: 'databox-origin.example.net', proxied: false },
        { type: 'CNAME', name: 'www.example.org', content: 'databox-origin.example.net', proxied: true },
      ],
    });
  });

  it('persists module state as RDF and exports it in the portable works bundle.', async(): Promise<void> => {
    const stateResponse = await fetch(`${baseUrl}.databox/cms/modules/hosting`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        enabled: false,
        configTurtle: '<> <urn:example:hostingMode> "operator-planned" .',
      }),
    });
    expect(stateResponse.status).toBe(200);
    await expect(stateResponse.json()).resolves.toMatchObject({
      id: 'hosting',
      enabled: false,
      configTurtle: expect.stringContaining('operator-planned'),
    });

    const worksResponse = await fetch(`${baseUrl}.databox/cms/works`, {
      headers: { authorization: `Bearer ${controlToken}` },
    });
    expect(worksResponse.status).toBe(200);
    const works = await worksResponse.json();
    expect(works).toMatchObject({
      type: 'DataboxCmsWorks',
      portability: {
        backendTargets: expect.arrayContaining([ 'Oxigraph SPARQL 1.1 backend' ]),
      },
    });
    expect(works.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        manifest: expect.objectContaining({ id: 'hosting' }),
        enabled: false,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('operator-planned'),
        },
      }),
    ]));
  });

  it('imports a portable works bundle over the protected control plane.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/cms/works/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.type).toBe('DataboxCmsWorks');
    expect(body.modules).toEqual(expect.arrayContaining([
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

  it('persists a waiter POS order flow through the ResourceStore and reads the canonical RDF back.', async():
  Promise<void> => {
    const orderId = `${baseUrl}pos/orders/o-int-1`;
    const createResponse = await fetch(`${baseUrl}.databox/cms/pos/orders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'waiter',
        cartId: `${baseUrl}pos/carts/c-int-1`,
        orderId,
        ticketId: `${baseUrl}pos/tickets/t-int-1`,
        orderNumber: 'O-INT-1',
        ticketNumber: 'T-INT-1',
        seller: `${baseUrl}profile/card#org`,
        currency: 'AUD',
        createdAt: '2026-07-19T11:00:00.000Z',
        lines: [{
          lineId: 'line-1',
          product: `${baseUrl}catalogue/flat-white#item`,
          name: 'Flat white',
          quantity: 2,
          unitPrice: 4.8,
        }],
        serviceMode: 'table',
        waiterWebId: `${baseUrl}staff/alice#me`,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      channel: 'waiter',
      status: 'ready-for-fulfilment',
      persisted: expect.arrayContaining([
        expect.objectContaining({ role: 'order', iri: orderId }),
        expect.objectContaining({ role: 'cart', iri: `${baseUrl}pos/carts/c-int-1` }),
        expect.objectContaining({ role: 'ticket', iri: `${baseUrl}pos/tickets/t-int-1` }),
      ]),
    });

    // Read the canonical resource back: it was stored as RDF (parsed to quads) and is
    // re-serialized here through standard content negotiation — proof it is ordinary Solid RDF.
    const readResponse = await fetch(
      `${baseUrl}.databox/cms/pos/orders?iri=${encodeURIComponent(orderId)}`,
      { headers: { authorization: `Bearer ${controlToken}` }},
    );
    expect(readResponse.status).toBe(200);
    expect(readResponse.headers.get('content-type')).toContain('application/ld+json');
    const record = await readResponse.json();
    expect(JSON.stringify(record)).toContain('O-INT-1');

    // The resource lives on the normal Solid data path: a plain LDP GET (no CMS control token)
    // serves it as ordinary RDF, proving the portable-core / standard-Solid degradation.
    const ldpResponse = await fetch(orderId, { headers: { accept: 'text/turtle' }});
    expect(ldpResponse.status).toBe(200);
    expect(ldpResponse.headers.get('content-type')).toContain('text/turtle');
    await expect(ldpResponse.text()).resolves.toContain('O-INT-1');
  });

  it('opens a cash register session and serves it as ordinary RDF via plain LDP.', async(): Promise<void> => {
    const sessionIri = `${baseUrl}pos/registers/reg-int/sessions/s-int`;
    const openResponse = await fetch(`${baseUrl}.databox/cms/pos/register/sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 's-int',
        registerId: 'reg-int',
        registerName: 'Front register',
        operatorSession: {
          sessionId: 'op-int',
          webId: 'https://op.example/profile/card#me',
          roleIri: 'https://op.example/roles/cashier',
          startedAt: '2026-07-19T10:00:00.000Z',
        },
        openedAt: '2026-07-19T11:00:00.000Z',
        currency: 'AUD',
        openingFloat: 100,
      }),
    });
    expect(openResponse.status).toBe(201);
    await expect(openResponse.json()).resolves.toMatchObject({ persisted: { iri: sessionIri }});

    const ldp = await fetch(sessionIri, { headers: { accept: 'text/turtle' }});
    expect(ldp.status).toBe(200);
    expect(ldp.headers.get('content-type')).toContain('text/turtle');
    await expect(ldp.text()).resolves.toContain('Front register');
  });

  it('renders and publishes a customer display playlist, readable via plain LDP.', async(): Promise<void> => {
    const displayIri = `${baseUrl}pos/display-int`;
    const response = await fetch(`${baseUrl}.databox/cms/pos/display`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        displayIri,
        input: {
          business: { id: `${baseUrl}profile/card#org`, name: 'Corner Cafe' },
          transaction: {
            id: `${baseUrl}pos/orders/o-disp`,
            orderNumber: 'O-DISP',
            status: 'pending-payment',
            currency: 'AUD',
            lines: [{ name: 'Flat white', quantity: 1, unitPrice: 4.8 }],
            subtotal: 4.8,
            total: 4.8,
          },
          links: {
            shopAppInstallUrl: 'https://apps.example/shop',
            solidVaultConnectUrl: 'https://vault.example/connect',
          },
          slides: [{ id: `${baseUrl}ads/welcome#slide`, title: 'Welcome' }],
          generatedAt: '2026-07-19T11:00:00.000Z',
        },
      }),
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ persisted: { iri: displayIri }});

    const ldp = await fetch(displayIri, { headers: { accept: 'text/turtle' }});
    expect(ldp.status).toBe(200);
    expect(ldp.headers.get('content-type')).toContain('text/turtle');
  });

  it('publishes public website assets that are served as ordinary resources via plain LDP.', async():
  Promise<void> => {
    const publishResponse = await fetch(`${baseUrl}.databox/cms/website/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        baseIri: `${baseUrl}www-int/`,
        feed: {
          business: { id: `${baseUrl}profile/card#org`, name: 'Test Cafe', url: baseUrl },
          catalogue: [{ id: `${baseUrl}catalogue/flat-white#item`, name: 'Flat white', price: 4.8, currency: 'AUD' }],
        },
      }),
    });
    expect(publishResponse.status).toBe(201);
    const published = (await publishResponse.json()).published;
    expect(published).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'html', iri: `${baseUrl}www-int/index.html` }),
    ]));

    const html = await fetch(`${baseUrl}www-int/index.html`, { headers: { accept: 'text/html' }});
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    await expect(html.text()).resolves.toContain('Test Cafe');
  });

  it('leaves the base Solid server untouched: its OIDC discovery still responds.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.well-known/openid-configuration`);
    expect(response.status).toBe(200);
  });
});
