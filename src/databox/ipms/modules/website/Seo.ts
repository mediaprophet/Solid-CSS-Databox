import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface BusinessSeo {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly description?: string;
}

export interface MetaTag {
  readonly property: string;
  readonly content: string;
}

export interface SeoResult {
  readonly jsonLd: Record<string, unknown>;
  readonly meta: MetaTag[];
  readonly sitemap: string[];
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A business ${field} must be an absolute URI.`);
  }
}

/**
 * Build website SEO structured data — a schema.org `Organization` JSON-LD document, Open
 * Graph meta tags, and a sitemap page list (see `databox/solid-ipms-plan.md`, §10.7). Pure
 * and deterministic.
 */
export function buildSeo(business: BusinessSeo, pages: readonly string[]): SeoResult {
  const id = requireUri(business.id, 'id');
  const url = requireUri(business.url, 'url');
  if (business.name.trim().length === 0) {
    throw new BadRequestHttpError('A business needs a name.');
  }

  const sitemap: string[] = [];
  for (const page of pages) {
    if (page.trim().length === 0) {
      throw new BadRequestHttpError('A sitemap page must not be empty.');
    }
    sitemap.push(page);
  }

  const jsonLd: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Organization',
    [LD_ID]: id,
    name: business.name,
    url,
  };

  const meta: MetaTag[] = [
    { property: 'og:title', content: business.name },
    { property: 'og:url', content: url },
    { property: 'og:type', content: 'website' },
  ];

  if (business.description !== undefined) {
    jsonLd.description = business.description;
    meta.push({ property: 'og:description', content: business.description });
  }

  return { jsonLd, meta, sitemap };
}
