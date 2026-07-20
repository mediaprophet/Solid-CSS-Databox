import type {
  PublicWebsiteFeedInput,
  PublicWebsiteFeedRender,
} from '../../../../../../src/databox/cms/modules/website/PublicFeedRenderer';
import {
  renderPublicWebsiteFeed,
  renderPublicWebsiteFeedFromRdf,
  renderPublicWebsiteFeedPreview,
  WEBSITE_SEO_MODULE_MANIFEST,
} from '../../../../../../src/databox/cms/modules/website/PublicFeedRenderer';

const baseInput: PublicWebsiteFeedInput = {
  business: {
    id: 'https://www.example.org/#business',
    name: 'Corner Cafe',
    url: 'https://www.example.org/',
    description: 'Local breakfast and pantry goods.',
    telephone: '+61 2 5550 0100',
    openingHours: [ 'Mo-Fr 07:00-15:00' ],
  },
  catalogue: [
    {
      id: 'https://www.example.org/catalogue/jam',
      name: 'House Jam',
      description: 'Small-batch berry jam.',
      sku: 'JAM-250',
      price: 8.5,
      currency: 'AUD',
      availability: 'https://schema.org/InStock',
    },
  ],
  menus: [
    {
      id: 'https://www.example.org/menu/breakfast',
      name: 'Breakfast Menu',
      sections: [
        {
          name: 'Coffee',
          items: [
            { name: 'Flat white', price: 4.5, currency: 'AUD' },
          ],
        },
      ],
    },
  ],
  generatedAt: '2026-07-19T00:00:00.000Z',
  publicPath: '/',
  cacheMaxAgeSeconds: 600,
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

describe('renderPublicWebsiteFeed', (): void => {
  it('advertises a CMS module manifest for the portable public feed renderer.', (): void => {
    expect(WEBSITE_SEO_MODULE_MANIFEST).toMatchObject({
      id: 'website-seo',
      name: 'Website SEO and Public Feed',
      capabilities: expect.arrayContaining([
        'cms:portable-core-schema-org-rdf',
        'cms:standard-solid-rdf-input',
        'cms:css-enhanced-public-preview-route',
      ]),
      routes: [ 'POST /.databox/cms/website/preview', 'POST /.databox/cms/website/publish' ],
    });
  });

  it('renders cacheable public HTML and schema.org JSON-LD for business, catalogue, and menu content.', ():
  void => {
    const rendered = renderPublicWebsiteFeed(baseInput);

    expect(rendered.publicPath).toBe('/');
    expect(rendered.controlPlanePath).toBe('/.databox/cms');
    expect(rendered.requiresControlToken).toBe(false);
    expect(rendered.headers).toStrictEqual({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=86400',
      vary: 'accept',
    });
    expect(rendered.jsonLdHeaders).toStrictEqual({
      'content-type': 'application/ld+json; charset=utf-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=86400',
      vary: 'accept',
    });

    expect(rendered.jsonLd['@context']).toBe('https://schema.org/');
    expect(rendered.jsonLd['@type']).toBe('WebPage');
    expect(rendered.jsonLd.dateModified).toBe('2026-07-19T00:00:00.000Z');

    const business = record(rendered.jsonLd.mainEntity);
    expect(business['@type']).toBe('LocalBusiness');
    expect(business['@id']).toBe('https://www.example.org/#business');
    expect(business.name).toBe('Corner Cafe');
    expect(business.url).toBe('https://www.example.org/');
    expect(business.openingHours).toStrictEqual([ 'Mo-Fr 07:00-15:00' ]);

    const hasPart = records(rendered.jsonLd.hasPart);
    const catalogue = hasPart.find((part): boolean => part['@type'] === 'ItemList');
    expect(catalogue).toMatchObject({ name: 'Catalogue' });
    const product = record(record(records(catalogue?.itemListElement)[0]).item);
    expect(product).toMatchObject({
      '@type': 'Product',
      '@id': 'https://www.example.org/catalogue/jam',
      name: 'House Jam',
      sku: 'JAM-250',
    });
    expect(record(product.offers)).toMatchObject({
      '@type': 'Offer',
      price: '8.50',
      priceCurrency: 'AUD',
      availability: 'https://schema.org/InStock',
    });

    const menu = hasPart.find((part): boolean => part['@type'] === 'Menu');
    expect(menu).toMatchObject({
      '@id': 'https://www.example.org/menu/breakfast',
      name: 'Breakfast Menu',
    });
    const section = record(records(menu?.hasMenuSection)[0]);
    const item = record(records(section.hasMenuItem)[0]);
    expect(item).toMatchObject({ '@type': 'MenuItem', name: 'Flat white' });
    expect(record(item.offers)).toMatchObject({ price: '4.50', priceCurrency: 'AUD' });

    expect(rendered.html).toContain('<script type="application/ld+json">');
    expect(embeddedJsonLd(rendered.html)['@type']).toBe('WebPage');
    expect(rendered.html).toContain('<h1>Corner Cafe</h1>');
    expect(rendered.html).toContain('House Jam');
    expect(rendered.html).toContain('Flat white');
    expect(rendered.html).not.toContain('cmsControlToken');
    expect(rendered.html).not.toContain('/.databox/cms');
    expect(rendered.html).not.toContain('--');
  });

  it('escapes public HTML while preserving JSON-LD values.', (): void => {
    const rendered = renderPublicWebsiteFeed({
      ...baseInput,
      business: {
        ...baseInput.business,
        name: 'A&B <Cafe>',
      },
      catalogue: [
        {
          id: 'https://www.example.org/catalogue/jam',
          name: 'Jam <special>',
        },
      ],
      menus: [],
    });

    expect(rendered.jsonLd.name).toBe('A&B <Cafe>');
    expect(rendered.html).toContain('<h1>A&amp;B &lt;Cafe&gt;</h1>');
    expect(rendered.html).toContain('Jam &lt;special&gt;');
  });

  it('can attach a cacheable public theme CSS asset without changing the feed semantics.', (): void => {
    const rendered = renderPublicWebsiteFeed({
      ...baseInput,
      themeCss: {
        publicPath: '/theme.css',
        css: ':root {\n  --color-primary: #d4af37;\n}\n',
        cacheMaxAgeSeconds: 3_600,
      },
    });

    expect(rendered.html).toContain('<link rel="stylesheet" href="/theme.css">');
    expect(rendered.themeCss).toStrictEqual({
      publicPath: '/theme.css',
      css: ':root {\n  --color-primary: #d4af37;\n}\n',
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
        vary: 'accept',
      },
    });
    expect(rendered.jsonLd['@type']).toBe('WebPage');
    expect(rendered.requiresControlToken).toBe(false);
  });

  it('rejects a protected control-plane path.', (): void => {
    expect((): PublicWebsiteFeedRender => renderPublicWebsiteFeed({
      ...baseInput,
      publicPath: '/.databox/cms/public-feed',
    })).toThrow('must not be under the protected CMS control plane');
  });

  it('rejects a product id that is not an absolute URI.', (): void => {
    expect((): PublicWebsiteFeedRender => renderPublicWebsiteFeed({
      ...baseInput,
      catalogue: [
        {
          id: 'jam',
          name: 'House Jam',
        },
      ],
    })).toThrow('catalogue item id must be an absolute URI');
  });

  it('rejects a price without a currency.', (): void => {
    expect((): PublicWebsiteFeedRender => renderPublicWebsiteFeed({
      ...baseInput,
      catalogue: [
        {
          id: 'https://www.example.org/catalogue/jam',
          name: 'House Jam',
          price: 8.5,
        },
      ],
    })).toThrow('price and currency must be supplied together');
  });
});

describe('renderPublicWebsiteFeedFromRdf', (): void => {
  it('renders the same public feed from portable schema.org Turtle state.', (): void => {
    const rendered = renderPublicWebsiteFeedFromRdf({
      baseIri: 'https://www.example.org/public.ttl',
      generatedAt: '2026-07-19T00:00:00.000Z',
      turtle: `
        @prefix schema: <https://schema.org/> .

        <#business> a schema:LocalBusiness ;
          schema:name "Corner Cafe" ;
          schema:url <https://www.example.org/> ;
          schema:description "Local breakfast and pantry goods." ;
          schema:openingHours "Mo-Fr 07:00-15:00" .

        <catalogue/jam> a schema:Product ;
          schema:name "House Jam" ;
          schema:sku "JAM-250" ;
          schema:offers [
            a schema:Offer ;
            schema:price "8.50" ;
            schema:priceCurrency "AUD" ;
            schema:availability <https://schema.org/InStock>
          ] .

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
    });

    const business = record(rendered.jsonLd.mainEntity);
    expect(business).toMatchObject({
      '@type': 'LocalBusiness',
      '@id': 'https://www.example.org/public.ttl#business',
      name: 'Corner Cafe',
      url: 'https://www.example.org/',
    });

    const hasPart = records(rendered.jsonLd.hasPart);
    const cataloguePart = hasPart.find((part): boolean => part['@type'] === 'ItemList');
    const catalogue = record(records(cataloguePart?.itemListElement)[0]);
    const product = record(catalogue.item);
    expect(product).toMatchObject({
      '@type': 'Product',
      '@id': 'https://www.example.org/catalogue/jam',
      name: 'House Jam',
    });
    expect(record(product.offers)).toMatchObject({ price: '8.50', priceCurrency: 'AUD' });

    const menu = hasPart.find((part): boolean => part['@type'] === 'Menu');
    expect(menu).toMatchObject({
      '@id': 'https://www.example.org/menu/breakfast',
      name: 'Breakfast Menu',
    });
    expect(rendered.requiresControlToken).toBe(false);
    expect(JSON.stringify(rendered.jsonLd)).not.toContain('urn:solid-server:databox:cms#');
  });

  it('rejects RDF without a schema:LocalBusiness.', (): void => {
    expect((): PublicWebsiteFeedRender => renderPublicWebsiteFeedFromRdf({
      turtle: `
        @prefix schema: <https://schema.org/> .
        <https://www.example.org/catalogue/jam> a schema:Product ;
          schema:name "House Jam" .
      `,
    })).toThrow('needs one schema:LocalBusiness');
  });

  it('rejects malformed Turtle.', (): void => {
    expect((): PublicWebsiteFeedRender => renderPublicWebsiteFeedFromRdf({
      turtle: '@prefix schema: <https://schema.org/> . <bad',
    })).toThrow('could not be parsed');
  });
});

describe('renderPublicWebsiteFeedPreview', (): void => {
  it('renders from Solid Turtle state using the CSS-enhanced preview request shape.', (): void => {
    const rendered = renderPublicWebsiteFeedPreview({
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
    });

    expect(rendered.publicPath).toBe('/menu');
    expect(rendered.headers['cache-control']).toBe('public, max-age=120, stale-while-revalidate=86400');
    expect(rendered.html).toContain('<h1>Corner Cafe</h1>');
    expect(rendered.html).toContain('Flat white');
    expect(rendered.requiresControlToken).toBe(false);
  });

  it('rejects preview state that is not Turtle.', (): void => {
    expect((): PublicWebsiteFeedRender => renderPublicWebsiteFeedPreview({
      state: {
        contentType: 'application/ld+json',
        turtle: '{}',
      },
    })).toThrow('contentType must be text/turtle');
  });
});
