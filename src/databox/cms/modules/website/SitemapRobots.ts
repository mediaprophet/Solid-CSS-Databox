import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { CMS } from '../../../../util/Vocabularies';
import type { SolidModuleManifest } from '../../SolidModuleManifest';

/**
 * Pure sitemap.xml and robots.txt rendering for the public website maker
 * (see `databox/solid-cms-plan.md`, §10.7 / §10.8).
 *
 * These renderers are intentionally pure and dependency-free: they emit standard
 * `http://www.sitemaps.org/schemas/sitemap/0.9` XML and a plain-text robots exclusion
 * protocol document with no Databox-only protocol surface, so a standard Solid client
 * reading the same RDF state can reproduce them (the portable-core degradation, §1.4).
 */

/** The CMS control-plane path, disallowed in robots.txt so the operator surface is never indexed. */
const CONTROL_PLANE_PATH = '/.databox/cms';

export const SITEMAP_ROBOTS_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'sitemap-robots',
  name: 'Sitemap and Robots',
  version: '0.1.0',
  description:
    'Pure sitemap.xml and robots.txt rendering from the public website page list. ' +
    'Standard sitemaps.org XML and robots exclusion protocol — no Databox-only surface.',
  capabilities: [
    'cms:sitemap-render',
    'cms:robots-render',
    'cms:portable-core-xml',
  ],
  routes: [],
  configShape: `${CMS.namespace}SitemapRobotsConfigShape`,
};

/** Input describing the public pages to list in the sitemap. */
export interface SitemapInput {
  /** Absolute URIs of the public pages. At least one is required. */
  readonly pages: readonly string[];
  /** Optional last-modified timestamp (ISO 8601) applied to every entry. */
  readonly lastmod?: string;
}

/** A rendered sitemap.xml asset. */
export interface SitemapRender {
  readonly publicPath: string;
  readonly xml: string;
  readonly contentType: string;
}

/** Input describing the robots.txt document. */
export interface RobotsInput {
  /** Absolute base URL of the public site (e.g. `https://www.example.org/`). */
  readonly siteUrl: string;
  /** Absolute URL of the sitemap to advertise. */
  readonly sitemapUrl: string;
}

/** A rendered robots.txt asset. */
export interface RobotsRender {
  readonly publicPath: string;
  readonly text: string;
  readonly contentType: string;
}

/**
 * Render a sitemap.xml document from a list of absolute page URIs.
 *
 * The output is a valid sitemaps.org 0.9 urlset. Page URIs are validated as absolute and
 * XML-escaped. When `lastmod` is supplied it is applied to every `<url>` entry.
 */
export function renderSitemap(input: SitemapInput): SitemapRender {
  const pages = validatePages(input.pages);
  const lastmod = input.lastmod === undefined ? undefined : validateIsoDate(input.lastmod, 'lastmod');

  const entries = pages.map((page): string => {
    const loc = escapeXml(page);
    return lastmod === undefined ?
      `  <url><loc>${loc}</loc></url>` :
      `  <url><loc>${loc}</loc><lastmod>${escapeXml(lastmod)}</lastmod></url>`;
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');

  return {
    publicPath: '/sitemap.xml',
    xml,
    contentType: 'application/xml',
  };
}

/**
 * Render a robots.txt document that allows all well-behaved crawlers, explicitly disallows the
 * CMS control plane (the protected operator surface must never be indexed), and advertises the
 * sitemap.
 */
export function renderRobots(input: RobotsInput): RobotsRender {
  const siteUrl = validateAbsoluteUri(input.siteUrl, 'A robots site URL');
  const sitemapUrl = validateAbsoluteUri(input.sitemapUrl, 'A robots sitemap URL');

  const lines = [
    'User-agent: *',
    'Allow: /',
    `Disallow: ${CONTROL_PLANE_PATH}`,
    `Sitemap: ${sitemapUrl}`,
  ];

  // Reference the site URL only for validation; the sitemap line carries the canonical URL.
  void siteUrl;

  return {
    publicPath: '/robots.txt',
    text: `${lines.join('\n')}\n`,
    contentType: 'text/plain',
  };
}

/**
 * Derive a default sitemap page list from a public website's business URL, public path,
 * catalogue item ids, and menu ids. Deduplicates while preserving order so the sitemap is
 * deterministic. This mirrors the page list the website maker already renders as HTML.
 */
export function deriveSitemapPages(options: {
  readonly businessUrl: string;
  readonly publicPath?: string;
  readonly catalogueItemIds?: readonly string[];
  readonly menuIds?: readonly string[];
  readonly extraPages?: readonly string[];
}): string[] {
  const { businessUrl, publicPath, catalogueItemIds, menuIds, extraPages } = options;
  const base = stripTrailingSlash(businessUrl);
  const pages: string[] = [];

  if (publicPath !== undefined && publicPath !== '/') {
    pages.push(`${base}${publicPath}`);
  } else {
    pages.push(businessUrl);
  }

  for (const id of catalogueItemIds ?? []) {
    pages.push(id);
  }
  for (const id of menuIds ?? []) {
    pages.push(id);
  }
  for (const page of extraPages ?? []) {
    pages.push(page);
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const page of pages) {
    if (seen.has(page)) {
      continue;
    }
    seen.add(page);
    unique.push(page);
  }
  return unique;
}

function validatePages(pages: readonly string[]): string[] {
  if (pages.length === 0) {
    throw new BadRequestHttpError('A sitemap needs at least one page.');
  }
  return pages.map((page): string => validateAbsoluteUri(page, 'A sitemap page'));
}

function validateAbsoluteUri(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestHttpError(`${field} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (!URL.canParse(trimmed)) {
    throw new BadRequestHttpError(`${field} must be an absolute URI.`);
  }
  return new URL(trimmed).href;
}

function validateIsoDate(value: string, field: string): string {
  const trimmed = value.trim();
  if (Number.isNaN(Date.parse(trimmed))) {
    throw new BadRequestHttpError(`A sitemap ${field} must be an ISO date/time.`);
  }
  return trimmed;
}

function escapeXml(value: string): string {
  // XML entity escapes built from char codes so the source is not mangled by tooling.
  const AMP = `&amp;`;
  const LT = `&lt;`;
  const GT = `&gt;`;
  const QUOT = `&quot;`;
  const APOS = `&apos;`;
  return value
    .replaceAll('&', AMP)
    .replaceAll('<', LT)
    .replaceAll('>', GT)
    .replaceAll('"', QUOT)
    .replaceAll('\'', APOS);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') && value.length > 1 ? value.slice(0, -1) : value;
}
