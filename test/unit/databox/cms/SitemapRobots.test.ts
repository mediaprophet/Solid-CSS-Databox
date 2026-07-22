import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import {
  deriveSitemapPages,
  renderRobots,
  renderSitemap,
  SITEMAP_ROBOTS_MODULE_MANIFEST,
} from '../../../../src/databox/cms/modules/website/SitemapRobots';

describe('SITEMAP_ROBOTS_MODULE_MANIFEST', (): void => {
  it('declares a portable-core module with no CSS-enhanced routes.', (): void => {
    expect(SITEMAP_ROBOTS_MODULE_MANIFEST.id).toBe('sitemap-robots');
    expect(SITEMAP_ROBOTS_MODULE_MANIFEST.routes).toEqual([]);
    expect(SITEMAP_ROBOTS_MODULE_MANIFEST.capabilities).toContain('cms:portable-core-xml');
  });
});

describe('renderSitemap', (): void => {
  it('renders a valid sitemaps.org urlset from absolute page URIs.', (): void => {
    const render = renderSitemap({
      pages: [ 'https://www.example.org/', 'https://www.example.org/menu' ],
    });
    expect(render.publicPath).toBe('/sitemap.xml');
    expect(render.contentType).toBe('application/xml');
    expect(render.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(render.xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(render.xml).toContain('<url><loc>https://www.example.org/</loc></url>');
    expect(render.xml).toContain('<url><loc>https://www.example.org/menu</loc></url>');
    expect(render.xml.trim().endsWith('</urlset>')).toBe(true);
  });

  it('includes a lastmod element on every entry when supplied.', (): void => {
    const render = renderSitemap({
      pages: [ 'https://www.example.org/' ],
      lastmod: '2026-07-20T00:00:00.000Z',
    });
    expect(render.xml).toContain(
      '<url><loc>https://www.example.org/</loc><lastmod>2026-07-20T00:00:00.000Z</lastmod></url>',
    );
  });

  it('escapes XML-special characters in page URIs.', (): void => {
    const render = renderSitemap({
      pages: [ 'https://www.example.org/p?a=b&c=d' ],
    });
    // The ampersand must be escaped as the XML entity amp;, not left raw.
    const locLine = render.xml.split('\n').find((line): boolean => line.includes('<loc>'));
    expect(locLine).toBeDefined();
    // The escaped form contains the literal entity sequence amp; after the ampersand.
    expect(locLine).toContain('amp;');
    // The raw unescaped ampersand inside the loc element would appear as `b&c` without the
    // entity suffix; the escaped form reads `b&c` so the bare `b&c` substring is absent.
    expect(locLine).not.toContain('b&c');
  });

  it('rejects an empty page list.', (): void => {
    expect((): void => {
      renderSitemap({ pages: []});
    }).toThrow(BadRequestHttpError);
  });

  it('rejects a non-absolute page URI.', (): void => {
    expect((): void => {
      renderSitemap({ pages: [ '/relative/path' ]});
    }).toThrow(BadRequestHttpError);
  });

  it('rejects an invalid lastmod date.', (): void => {
    expect((): void => {
      renderSitemap({ pages: [ 'https://www.example.org/' ], lastmod: 'not-a-date' });
    }).toThrow(BadRequestHttpError);
  });
});

describe('renderRobots', (): void => {
  it('renders a robots.txt that allows all agents, disallows the CMS control plane, ' +
    'and advertises the sitemap.', (): void => {
    const render = renderRobots({
      siteUrl: 'https://www.example.org/',
      sitemapUrl: 'https://www.example.org/sitemap.xml',
    });
    expect(render.publicPath).toBe('/robots.txt');
    expect(render.contentType).toBe('text/plain');
    expect(render.text).toContain('User-agent: *');
    expect(render.text).toContain('Allow: /');
    expect(render.text).toContain('Disallow: /.databox/cms');
    expect(render.text).toContain('Sitemap: https://www.example.org/sitemap.xml');
    expect(render.text.endsWith('\n')).toBe(true);
  });

  it('rejects a non-absolute site URL.', (): void => {
    expect((): void => {
      renderRobots({ siteUrl: 'not-a-url', sitemapUrl: 'https://www.example.org/sitemap.xml' });
    }).toThrow(BadRequestHttpError);
  });

  it('rejects a non-absolute sitemap URL.', (): void => {
    expect((): void => {
      renderRobots({ siteUrl: 'https://www.example.org/', sitemapUrl: '/sitemap.xml' });
    }).toThrow(BadRequestHttpError);
  });
});

describe('deriveSitemapPages', (): void => {
  it('derives pages from the business URL, catalogue ids, and menu ids.', (): void => {
    const pages = deriveSitemapPages({
      businessUrl: 'https://www.example.org/',
      catalogueItemIds: [ 'https://www.example.org/catalogue/flat-white#item' ],
      menuIds: [ 'https://www.example.org/menu#main' ],
    });
    expect(pages).toEqual([
      'https://www.example.org/',
      'https://www.example.org/catalogue/flat-white#item',
      'https://www.example.org/menu#main',
    ]);
  });

  it('uses the public path when it is not the root.', (): void => {
    const pages = deriveSitemapPages({
      businessUrl: 'https://www.example.org/',
      publicPath: '/site',
    });
    expect(pages).toEqual([ 'https://www.example.org/site' ]);
  });

  it('deduplicates pages while preserving order.', (): void => {
    const pages = deriveSitemapPages({
      businessUrl: 'https://www.example.org/',
      catalogueItemIds: [ 'https://www.example.org/a', 'https://www.example.org/a' ],
      extraPages: [ 'https://www.example.org/' ],
    });
    expect(pages).toEqual([ 'https://www.example.org/', 'https://www.example.org/a' ]);
  });

  it('strips a trailing slash from the business URL before joining the public path.', (): void => {
    const pages = deriveSitemapPages({
      businessUrl: 'https://www.example.org/',
      publicPath: '/menu',
    });
    expect(pages).toEqual([ 'https://www.example.org/menu' ]);
  });
});
