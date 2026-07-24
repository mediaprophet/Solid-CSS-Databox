import fetch from 'cross-fetch';
import { WebSocket } from 'ws';
import type { App } from '../../src/init/App';
import { parseModuleManifestIndexRdf } from '../../src/databox/ipms/ModuleManifestDiscovery';
import { parseModuleManifestRdf } from '../../src/databox/ipms/ModuleManifestRdf';
import { getPort } from '../util/Util';
import { getDefaultVariables, getTestConfigPath, instantiateFromConfig } from './Config';

const port = getPort('DataboxIpms');
const baseUrl = `http://localhost:${port}/`;
const controlToken = 'ipms-integration-control-token-00000001';
const modulesRoute = `${baseUrl}.databox/ipms/modules`;
const discoveryRoute = `${baseUrl}.well-known/databox-ipms`;

describe('the Databox IPMS control plane in Community Solid Server', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    const instances = await instantiateFromConfig(
      'urn:solid-server:test:Instances',
      getTestConfigPath('ipms.json'),
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:ipms:variable:controlToken': controlToken,
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
    expect(indexTurtle).not.toContain('urn:solid-server:databox:ipms#enabled');

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
    expect(manifestTurtle).not.toContain('urn:solid-server:databox:ipms#enabled');
    expect(parseModuleManifestRdf(manifestTurtle, { subjectIri: manifestUrl })).toMatchObject({
      id: 'hosting',
      name: 'Hosting',
      routes: expect.arrayContaining([ 'POST /.databox/ipms/hosting/plan' ]),
    });
  });

  it('returns 404 for a missing public module manifest without requiring a control token.', async(): Promise<void> => {
    const response = await fetch(`${discoveryRoute}/modules/not-installed.ttl`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'module-manifest-not-found' });
  });

  it('derives a hosting plan over the protected control plane.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/hosting/plan`, {
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
    const stateResponse = await fetch(`${baseUrl}.databox/ipms/modules/hosting`, {
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

    const worksResponse = await fetch(`${baseUrl}.databox/ipms/works`, {
      headers: { authorization: `Bearer ${controlToken}` },
    });
    expect(worksResponse.status).toBe(200);
    const works = await worksResponse.json();
    expect(works).toMatchObject({
      type: 'DataboxIpmsWorks',
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
    const response = await fetch(`${baseUrl}.databox/ipms/works/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        '@context': {},
        type: 'DataboxIpmsWorks',
        generatedAt: '2026-07-19T00:00:00.000Z',
        portability: {
          canonicalStore: 'Solid LDP/RDF resources',
          cssEnhanced: 'IPMS control plane is an optional interpreter, not the canonical store',
          backendTargets: [ 'Oxigraph SPARQL 1.1 backend' ],
          nonPortableRuntimeWork: [ 'control-plane bearer tokens' ],
        },
        modules: [
          {
            manifest: {
              id: 'jobs',
              name: 'Jobs / Work Orders',
              version: '0.1.0',
              description: 'Production workflows (intake -> queue -> produce -> finish -> ready).',
              capabilities: [ 'ipms:jobs', 'ipms:work-orders' ],
              routes: [ 'POST /.databox/ipms/jobs/advance' ],
              adminUi: { navLabel: 'Jobs', path: '/jobs' },
            },
            enabled: true,
            state: { contentType: 'text/turtle', turtle: '<> <urn:example:imported> "yes" .' },
          },
          {
            manifest: {
              id: 'payments',
              name: 'Payments & Receipts',
              version: '0.1.0',
              description: 'Payment logic including taxes, splits, subscriptions, refunds, and verifiable receipts.',
              capabilities: [ 'ipms:payments', 'ipms:receipts' ],
              routes: [
                'POST /.databox/ipms/payments/receipt/build',
                'POST /.databox/ipms/payments/refund/compute',
                'POST /.databox/ipms/payments/split/compute',
                'POST /.databox/ipms/payments/subscription/next-date',
                'POST /.databox/ipms/payments/subscription/is-due',
                'POST /.databox/ipms/payments/tax/compute',
              ],
              adminUi: { navLabel: 'Payments', path: '/payments' },
            },
            enabled: true,
            state: { contentType: 'text/turtle', turtle: '<> <urn:example:imported> "yes" .' },
          },
          {
            manifest: {
              id: 'bookings',
              name: 'Bookings & Availability',
              version: '0.1.0',
              description: 'Compute free time slots and issue schema.org reservations.',
              capabilities: [ 'ipms:bookings', 'ipms:availability', 'ipms:reservation' ],
              routes: [
                'POST /.databox/ipms/bookings/availability',
                'POST /.databox/ipms/bookings/reservation/build',
              ],
              adminUi: {
                navLabel: 'Bookings',
                path: '/bookings',
              },
            },
            enabled: true,
            state: {
              contentType: 'text/turtle',
              turtle: '<> <urn:example:imported> "yes" .',
            },
          },
          {
            manifest: {
              id: 'catalogue',
              name: 'Catalogue Variants',
              version: '0.1.0',
              description: 'Expand a product\'s options into the full variant / SKU matrix.',
              capabilities: [ 'ipms:catalogue', 'ipms:catalogue-variants' ],
              routes: [ 'POST /.databox/ipms/catalogue/variants/build' ],
              adminUi: {
                navLabel: 'Catalogue',
                path: '/catalogue',
              },
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
    expect(body.type).toBe('DataboxIpmsWorks');
    expect(body.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ manifest: expect.objectContaining({ id: 'jobs' }), enabled: true }),
      expect.objectContaining({ manifest: expect.objectContaining({ id: 'payments' }), enabled: true }),
      expect.objectContaining({
        manifest: expect.objectContaining({ id: 'bookings' }),
        enabled: true,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('urn:example:imported'),
        },
      }),
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
    const createResponse = await fetch(`${baseUrl}.databox/ipms/pos/orders`, {
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
      `${baseUrl}.databox/ipms/pos/orders?iri=${encodeURIComponent(orderId)}`,
      { headers: { authorization: `Bearer ${controlToken}` }},
    );
    expect(readResponse.status).toBe(200);
    expect(readResponse.headers.get('content-type')).toContain('application/ld+json');
    const record = await readResponse.json();
    expect(JSON.stringify(record)).toContain('O-INT-1');

    // The resource lives on the normal Solid data path: a plain LDP GET (no IPMS control token)
    // serves it as ordinary RDF, proving the portable-core / standard-Solid degradation.
    const ldpResponse = await fetch(orderId, { headers: { accept: 'text/turtle' }});
    expect(ldpResponse.status).toBe(200);
    expect(ldpResponse.headers.get('content-type')).toContain('text/turtle');
    await expect(ldpResponse.text()).resolves.toContain('O-INT-1');
  });

  it('opens a cash register session and serves it as ordinary RDF via plain LDP.', async(): Promise<void> => {
    const sessionIri = `${baseUrl}pos/registers/reg-int/sessions/s-int`;
    const openResponse = await fetch(`${baseUrl}.databox/ipms/pos/register/sessions`, {
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
    const response = await fetch(`${baseUrl}.databox/ipms/pos/display`, {
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

  it('updates display clients through CSS/Solid notifications.', async(): Promise<void> => {
    const displayIri = `${baseUrl}pos/display-int`;

    // Initialize the display state first so the resource exists
    const initState = await fetch(`${baseUrl}.databox/ipms/pos/display/state`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        displayIri,
        state: { mode: 'idle', lastUpdatedAt: new Date().toISOString() },
      }),
    });
    if (initState.status !== 201) {
      console.error('INIT_ERROR: ', await initState.text());
    }
    expect(initState.status).toBe(201);

    // Subscribe using the WebSocketChannel2023 endpoint
    const subUrl = new URL('/.notifications/WebSocketChannel2023/', baseUrl).href;
    const subRes = await fetch(subUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/ld+json' },
      body: JSON.stringify({
        '@context': [ 'https://www.w3.org/ns/solid/notification/v1' ],
        type: 'http://www.w3.org/ns/solid/notifications#WebSocketChannel2023',
        topic: `${displayIri}-state`,
      }),
    });
    expect(subRes.status).toBe(200);
    const body = await subRes.json();
    const ws = new WebSocket(body.receiveFrom);

    const notificationPromise = new Promise<Buffer>((resolve): any => ws.once('message', resolve));
    await new Promise<void>((resolve): any => ws.once('open', resolve));

    // Push an incremental state update to trigger the notification
    const stateUpdate = await fetch(`${baseUrl}.databox/ipms/pos/display/state`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        displayIri,
        state: { mode: 'transaction', lastUpdatedAt: new Date().toISOString() },
      }),
    });
    if (stateUpdate.status !== 201) {
      console.error('STATE_ERROR: ', await stateUpdate.text());
    }
    expect(stateUpdate.status).toBe(201);

    // Verify the WebSocket received the update
    const notification = JSON.parse((await notificationPromise).toString());
    ws.close();

    expect(notification.type).toBe('Update');
    expect(notification.object).toBe(`${displayIri}-state`);
  });

  it('publishes public website assets that are served as ordinary resources via plain LDP.', async(): Promise<void> => {
    const publishResponse = await fetch(`${baseUrl}.databox/ipms/website/publish`, {
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
    if (publishResponse.status !== 201) {
      console.error('SEO publish failed: ', await publishResponse.text());
    }
    expect(publishResponse.status).toBe(201);
    const published = (await publishResponse.json()).published;
    expect(published).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'html', iri: `${baseUrl}www-int/index.html` }),
      expect.objectContaining({ role: 'json-ld', iri: `${baseUrl}www-int/data.jsonld` }),
    ]));

    // Fetch the HTML (publicly accessible due to WAC ACL)
    const html = await fetch(`${baseUrl}www-int/index.html`, { headers: { accept: 'text/html' }});
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    await expect(html.text()).resolves.toContain('Test Cafe');

    // Fetch the JSON-LD Feed (publicly accessible)
    const jsonLd = await fetch(`${baseUrl}www-int/data.jsonld`, { headers: { accept: 'application/ld+json' }});
    expect(jsonLd.status).toBe(200);
    expect(jsonLd.headers.get('content-type')).toContain('application/ld+json');

    // Fetch the JSON-LD Feed using content negotiation for Turtle (CSS handles this via representation converters)
    const turtle = await fetch(`${baseUrl}www-int/data.jsonld`, { headers: { accept: 'text/turtle' }});
    expect(turtle.status).toBe(200);
    expect(turtle.headers.get('content-type')).toContain('text/turtle');
    await expect(turtle.text()).resolves.toContain('Test Cafe');
  });

  it('publishes public SEO assets (sitemap, robots) that are served as ordinary resources.', async(): Promise<void> => {
    const publishResponse = await fetch(`${baseUrl}.databox/ipms/website/seo`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        baseIri: `${baseUrl}www-int/`,
        sitemap: { pages: [ `${baseUrl}www-int/`, `${baseUrl}www-int/menu` ]},
        robots: { siteUrl: baseUrl, sitemapUrl: `${baseUrl}www-int/sitemap.xml` },
      }),
    });
    if (publishResponse.status !== 201) {
      console.error('SEO_ERROR: ', await publishResponse.text());
    }
    expect(publishResponse.status).toBe(201);

    // Fetch the Sitemap (publicly accessible)
    const sitemap = await fetch(`${baseUrl}www-int/sitemap.xml`, { headers: { accept: 'application/xml' }});
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get('content-type')).toContain('application/xml');
    await expect(sitemap.text()).resolves.toContain('<loc>http://localhost:');

    // Fetch the Robots.txt (publicly accessible)
    const robots = await fetch(`${baseUrl}www-int/robots.txt`, { headers: { accept: 'text/plain' }});
    expect(robots.status).toBe(200);
    expect(robots.headers.get('content-type')).toContain('text/plain');
    await expect(robots.text()).resolves.toContain('Sitemap: ');
  });

  it('exposes a POST route to expand a product into a SKU matrix (catalogue variants).', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/catalogue/variants/build`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'tshirt',
        options: [
          { name: 'size', values: [ 'S', 'M' ]},
          { name: 'color', values: [ 'red', 'blue' ]},
        ],
      }),
    });
    expect(response.status).toBe(200);
    const variants = await response.json() as any[];
    expect(variants).toHaveLength(4);
    expect(variants[0].sku).toBe('tshirt-S-red');
    expect(variants[3].sku).toBe('tshirt-M-blue');
  });

  it('exposes a POST route to build an RDF syndication feed (schema.org JSON-LD).', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/feeds/products/build`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        products: [
          { id: 'item1', name: 'Coffee', price: 4.5, currency: 'AUD' },
        ],
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/ld+json');
    const feed = await response.json();
    expect(feed['@type']).toBe('ItemList');
    expect(feed.itemListElement[0].item.name).toBe('Coffee');
    expect(feed.itemListElement[0].item.offers.price).toBe('4.50');
  });

  it('exposes a POST route to compute free booking slots (availability).', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/bookings/availability`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        windowStart: 480, // 8:00 AM
        windowEnd: 720, // 12:00 PM
        slotMinutes: 60,
        bookings: [
          { start: 540, end: 600 }, // 9:00 AM - 10:00 AM
        ],
      }),
    });
    expect(response.status).toBe(200);
    const slots = await response.json() as any[];
    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual({ start: 480, end: 540 });
    expect(slots[1]).toEqual({ start: 600, end: 660 });
    expect(slots[2]).toEqual({ start: 660, end: 720 });
  });

  it('exposes a POST route to build a schema.org Reservation.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/bookings/reservation/build`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'https://example.com/res1',
        reservationFor: 'https://example.com/event',
        holder: 'https://example.com/user',
        startTime: '2026-10-10T10:00:00Z',
      }),
    });
    expect(response.status).toBe(200);
    const reservation = await response.json();
    expect(reservation['@type']).toBe('Reservation');
    expect(reservation.startTime).toBe('2026-10-10T10:00:00Z');
  });

  it('exposes a POST route to advance a job state.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/jobs/advance`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ current: 'intake', event: 'queue' }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.state).toBe('queued');
  });

  it('exposes a POST route to build a schema.org Receipt.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/payments/receipt/build`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId: '123',
        seller: 'Test Store',
        currency: 'USD',
        orderDate: '2026-10-10T10:00:00Z',
        items: [{ name: 'Item 1', quantity: 2, unitPrice: 10 }],
      }),
    });
    expect(response.status).toBe(200);
    const receipt = await response.json();
    expect(receipt['@type']).toBe('Order');
    expect(receipt.totalPaymentDue.price).toBe('20.00');
  });

  it('exposes a POST route to compute refunds.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/payments/refund/compute`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ originalTotal: 100, refundAmount: 20 }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.remaining).toBe(80);
  });

  it('exposes a POST route to compute split payments.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/payments/split/compute`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ total: 100, feePercent: 10, payees: [{ id: 'a', share: 50 }, { id: 'b', share: 50 }]}),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.platformFee).toBe(10);
    expect(result.payouts[0].amount).toBe(45);
  });

  it('exposes POST routes for subscription dates.', async(): Promise<void> => {
    const response1 = await fetch(`${baseUrl}.databox/ipms/payments/subscription/next-date`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ lastBilledIso: '2026-01-31', interval: 'monthly' }),
    });
    expect(response1.status).toBe(200);
    expect((await response1.json()).nextDate).toBe('2026-02-28');

    const response2 = await fetch(`${baseUrl}.databox/ipms/payments/subscription/is-due`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ lastBilledIso: '2026-01-31', interval: 'monthly', asOfIso: '2026-03-01' }),
    });
    expect(response2.status).toBe(200);
    expect((await response2.json()).due).toBe(true);
  });

  it('exposes a POST route to compute tax.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.databox/ipms/payments/tax/compute`, {
      method: 'POST',
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 110, ratePercent: 10, inclusive: true }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.tax).toBe(10);
    expect(result.net).toBe(100);
  });

  it('leaves the base Solid server untouched: its OIDC discovery still responds.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.well-known/openid-configuration`);
    expect(response.status).toBe(200);
  });
});
