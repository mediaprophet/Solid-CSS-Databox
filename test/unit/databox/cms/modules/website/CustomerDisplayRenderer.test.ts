import type {
  CustomerDisplayInput,
  CustomerDisplayRender,
} from '../../../../../../src/databox/cms/modules/website/CustomerDisplayRenderer';
import { renderCustomerDisplay } from '../../../../../../src/databox/cms/modules/website/CustomerDisplayRenderer';

const baseInput: CustomerDisplayInput = {
  business: {
    id: 'https://www.example.org/#business',
    name: 'Corner Cafe',
    url: 'https://www.example.org/',
  },
  transaction: {
    id: 'https://pod.example.org/orders/1001',
    orderNumber: '1001',
    status: 'pending-payment',
    currency: 'AUD',
    lines: [
      {
        name: 'Flat white',
        quantity: 2,
        unitPrice: 4.5,
        sku: 'COFFEE-FW',
      },
      {
        name: 'House muffin',
        quantity: 1,
        unitPrice: 6,
      },
    ],
    subtotal: 15,
    discount: 1,
    tax: 1.4,
    total: 15.4,
    updatedAt: '2026-07-19T10:30:00.000Z',
  },
  links: {
    shopAppInstallUrl: 'https://www.example.org/app/install',
    shopAppDownloadUrl: 'https://www.example.org/app/download',
    solidVaultConnectUrl: 'https://www.example.org/solid/connect?screen=pos',
    digitalReceiptUrl: 'https://pod.example.org/receipts/1001',
  },
  loyalty: {
    programName: 'Corner Club',
    memberLabel: 'Riley',
    pointsBalance: 128,
    callToActionUrl: 'https://www.example.org/loyalty',
    privacyNote: 'Preference sharing stays scoped to this shop.',
  },
  slides: [
    {
      id: 'https://www.example.org/promotions/breakfast',
      title: 'Breakfast deal',
      body: 'Coffee and muffin before 10.',
      image: {
        url: 'https://www.example.org/media/breakfast.jpg',
        alt: 'Coffee beside a fresh muffin',
      },
      action: {
        label: 'View breakfast menu',
        url: 'https://www.example.org/menu/breakfast',
      },
      durationSeconds: 6,
    },
    {
      id: 'https://www.example.org/promotions/vault',
      title: 'Keep receipts in your vault',
      body: 'Connect a Solid vault for portable receipts.',
      durationSeconds: 8,
    },
  ],
  generatedAt: '2026-07-19T10:30:00.000Z',
  publicPath: '/customer-display',
  cacheMaxAgeSeconds: 20,
  assetCacheMaxAgeSeconds: 600,
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function records(value: unknown): Record<string, unknown>[] {
  return value as Record<string, unknown>[];
}

function embeddedJsonLd(html: string): Record<string, unknown> {
  const match = /<script type="application\/ld\+json">([^<]*)<\/script>/u.exec(html);
  if (!match) {
    throw new Error('Missing JSON-LD script.');
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe('renderCustomerDisplay', (): void => {
  it('renders portable customer display HTML, JSON-LD, QR payloads, and cacheable assets.', (): void => {
    const rendered = renderCustomerDisplay(baseInput);

    expect(rendered.publicPath).toBe('/customer-display');
    expect(rendered.controlPlanePath).toBe('/.databox/cms');
    expect(rendered.requiresControlToken).toBe(false);
    expect(rendered.headers).toStrictEqual({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, max-age=20, stale-while-revalidate=300',
      vary: 'accept',
    });
    expect(rendered.jsonLdHeaders).toStrictEqual({
      'content-type': 'application/ld+json; charset=utf-8',
      'cache-control': 'private, max-age=20, stale-while-revalidate=300',
      vary: 'accept',
    });

    expect(rendered.qrPayloads).toStrictEqual([
      {
        kind: 'shop-app-install',
        label: 'Install shop app',
        payload: 'https://www.example.org/app/install',
      },
      {
        kind: 'shop-app-download',
        label: 'Download shop app',
        payload: 'https://www.example.org/app/download',
      },
      {
        kind: 'solid-vault-connect',
        label: 'Connect Solid vault',
        payload: 'https://www.example.org/solid/connect?screen=pos',
      },
      {
        kind: 'digital-receipt',
        label: 'Open digital receipt',
        payload: 'https://pod.example.org/receipts/1001',
      },
    ]);

    expect(rendered.jsonLd['@type']).toBe('schema:WebPage');
    expect(record(rendered.jsonLd['@context']).schema).toBe('https://schema.org/');
    expect(record(rendered.jsonLd['@context']).solid).toBe('http://www.w3.org/ns/solid/terms#');
    expect(record(rendered.jsonLd.provider)['schema:name']).toBe('Corner Cafe');

    const order = record(rendered.jsonLd.mainEntity);
    expect(order).toMatchObject({
      '@type': 'schema:Order',
      '@id': 'https://pod.example.org/orders/1001',
      'schema:orderStatus': 'https://schema.org/OrderPaymentDue',
      'schema:orderNumber': '1001',
    });
    const offers = records(order['schema:acceptedOffer']);
    expect(record(record(offers[0]['schema:itemOffered']))).toMatchObject({
      '@type': 'schema:Product',
      'schema:name': 'Flat white',
      'schema:sku': 'COFFEE-FW',
    });
    expect(offers[0]['schema:price']).toBe('4.50');
    expect(records(order['schema:priceSpecification'])).toContainEqual({
      '@type': 'schema:PriceSpecification',
      'schema:name': 'Total',
      'schema:price': '15.40',
      'schema:priceCurrency': 'AUD',
    });

    const actions = records(rendered.jsonLd.potentialAction);
    expect(actions.map((action): unknown => action['@type'])).toStrictEqual([
      'schema:InstallAction',
      'schema:DownloadAction',
      'schema:AuthorizeAction',
      'schema:ViewAction',
    ]);
    expect(record(record(actions[2]['schema:additionalProperty']))['schema:value'])
      .toBe('https://www.example.org/solid/connect?screen=pos');

    const parts = records(rendered.jsonLd.hasPart);
    const deck = record(parts.find((part): boolean => part['@type'] === 'schema:PresentationDigitalDocument'));
    const playlistSlides = records(deck['schema:hasPart']);
    expect(rendered.playlist).toMatchObject({
      mode: 'slidy-compatible',
      loop: true,
      totalDurationSeconds: 51,
    });
    expect(playlistSlides.map((slide): unknown => slide['schema:genre'])).toStrictEqual([
      'transaction-summary',
      'app-install',
      'solid-vault-connect',
      'loyalty',
      'receipt-qr',
      'advertising',
      'advertising',
    ]);
    expect(record(playlistSlides[3]['schema:potentialAction'])).toMatchObject({
      '@type': 'schema:ViewAction',
      'schema:name': 'Open loyalty',
    });
    expect(record(playlistSlides[4]['schema:additionalProperty'])['schema:value']).toBe('digital-receipt');

    expect(rendered.html).toContain('aria-live="polite"');
    expect(rendered.html).toContain('aria-roledescription="carousel"');
    expect(rendered.html).toContain('data-playlist-mode="slidy-compatible"');
    expect(rendered.html).toContain('data-display-kind="advertising"');
    expect(rendered.html).toContain('data-duration-ms="6000"');
    expect(rendered.html).toContain('<h1>1001</h1>');
    expect(rendered.html).toContain('Corner Club for Riley');
    expect(rendered.html).toContain('AUD 15.40');
    expect(rendered.html).toContain('data-qr-kind="solid-vault-connect"');
    expect(embeddedJsonLd(rendered.html)['@type']).toBe('schema:WebPage');
    expect(rendered.html).not.toContain('cmsControlToken');
    expect(rendered.html).not.toContain('/.databox/cms');

    expect(rendered.assets.css.publicPath).toBe('/customer-display.css');
    expect(rendered.assets.css.headers).toStrictEqual({
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=86400',
      vary: 'accept',
    });
    expect(rendered.assets.script.content).toContain('prefers-reduced-motion: reduce');
    expect(rendered.assets.script.content).toContain('data-display-deck');
    expect(rendered.assets.serviceWorker?.content).toContain('customer-display.json');
  });

  it('escapes display HTML while preserving JSON-LD values.', (): void => {
    const rendered = renderCustomerDisplay({
      ...baseInput,
      business: {
        id: 'https://www.example.org/#business',
        name: 'A&B <Cafe>',
      },
      transaction: {
        ...baseInput.transaction,
        lines: [
          {
            name: 'Muffin <special>',
            quantity: 1,
            unitPrice: 6,
          },
        ],
      },
      slides: [
        {
          id: 'https://www.example.org/promotions/one',
          title: 'Save <today>',
          body: 'A&B only.',
        },
      ],
    });

    expect(record(rendered.jsonLd.provider)['schema:name']).toBe('A&B <Cafe>');
    expect(rendered.html).toContain('A&amp;B &lt;Cafe&gt;');
    expect(rendered.html).toContain('Muffin &lt;special&gt;');
    expect(rendered.html).toContain('Save &lt;today&gt;');
    expect(rendered.html).toContain('A&amp;B only.');
  });

  it('filters inactive promotions from the automated slide deck.', (): void => {
    const rendered = renderCustomerDisplay({
      ...baseInput,
      slides: [
        {
          id: 'https://www.example.org/promotions/expired',
          title: 'Yesterday',
          validUntil: '2026-07-18T23:59:59.000Z',
        },
        {
          id: 'https://www.example.org/promotions/current',
          title: 'Today',
          validFrom: '2026-07-19T00:00:00.000Z',
          validUntil: '2026-07-20T00:00:00.000Z',
        },
        {
          id: 'https://www.example.org/promotions/future',
          title: 'Tomorrow',
          validFrom: '2026-07-20T00:00:01.000Z',
        },
      ],
    });

    const parts = records(rendered.jsonLd.hasPart);
    const deck = record(parts.find((part): boolean => part['@type'] === 'schema:PresentationDigitalDocument'));
    const playlistSlides = records(deck['schema:hasPart']);
    expect(playlistSlides.filter((slide): boolean => slide['schema:genre'] === 'advertising')).toHaveLength(1);
    expect(playlistSlides.map((slide): unknown => slide['schema:genre'])).toContain('transaction-summary');
    expect(rendered.html).toContain('Today');
    expect(rendered.html).not.toContain('Yesterday');
    expect(rendered.html).not.toContain('Tomorrow');
  });

  it('can disable the offline service worker asset.', (): void => {
    const rendered = renderCustomerDisplay({
      ...baseInput,
      enableOffline: false,
    });

    expect(rendered.assets.serviceWorker).toBeUndefined();
    expect(rendered.html).not.toContain('serviceWorker.register');
  });

  it('rejects a protected display route.', (): void => {
    expect((): CustomerDisplayRender => renderCustomerDisplay({
      ...baseInput,
      publicPath: '/.databox/cms/customer-display',
    })).toThrow('must not be under the protected CMS control plane');
  });

  it('rejects a protected asset route.', (): void => {
    expect((): CustomerDisplayRender => renderCustomerDisplay({
      ...baseInput,
      assetPaths: {
        cssPath: '/.databox/cms/customer-display.css',
      },
    })).toThrow('CSS path must not be under the protected CMS control plane');
  });

  it('rejects too many advertising slides.', (): void => {
    expect((): CustomerDisplayRender => renderCustomerDisplay({
      ...baseInput,
      slides: Array.from({ length: 21 }, (_, index): CustomerDisplayInput['slides'][number] => ({
        id: `https://www.example.org/promotions/${index}`,
        title: `Promotion ${index}`,
      })),
    })).toThrow('must not exceed 20 slides');
  });

  it('rejects a slide image without alt text.', (): void => {
    expect((): CustomerDisplayRender => renderCustomerDisplay({
      ...baseInput,
      slides: [
        {
          id: 'https://www.example.org/promotions/image',
          title: 'Image promo',
          image: {
            url: 'https://www.example.org/media/promo.jpg',
            alt: '  ',
          },
        },
      ],
    })).toThrow('image alt text must be a non-empty string');
  });

  it('rejects a deck where every slide is inactive.', (): void => {
    expect((): CustomerDisplayRender => renderCustomerDisplay({
      ...baseInput,
      playlist: {
        includeGeneratedSlides: false,
      },
      slides: [
        {
          id: 'https://www.example.org/promotions/expired',
          title: 'Yesterday',
          validUntil: '2026-07-18T23:59:59.000Z',
        },
      ],
    })).toThrow('no currently active slides');
  });
});
