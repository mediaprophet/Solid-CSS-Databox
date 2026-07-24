import { buildSeo } from '../../../../../../src/databox/ipms/modules/website/Seo';

describe('buildSeo', (): void => {
  it('builds minimal structured data without a description.', (): void => {
    const result = buildSeo(
      { id: 'https://example.org/#business', name: 'Acme', url: 'https://example.org/' },
      [ 'https://example.org/', 'https://example.org/about' ],
    );

    expect(result.jsonLd['@context']).toBe('https://schema.org/');
    expect(result.jsonLd['@type']).toBe('Organization');
    expect(result.jsonLd['@id']).toBe('https://example.org/#business');
    expect(result.jsonLd.name).toBe('Acme');
    expect(result.jsonLd.url).toBe('https://example.org/');
    expect(result.jsonLd.description).toBeUndefined();

    expect(result.meta).toStrictEqual([
      { property: 'og:title', content: 'Acme' },
      { property: 'og:url', content: 'https://example.org/' },
      { property: 'og:type', content: 'website' },
    ]);

    expect(result.sitemap).toStrictEqual([ 'https://example.org/', 'https://example.org/about' ]);
  });

  it('includes a description in the JSON-LD and an og:description meta tag when provided.', (): void => {
    const result = buildSeo(
      {
        id: 'https://example.org/#business',
        name: 'Acme',
        url: 'https://example.org/',
        description: 'A fine purveyor of widgets.',
      },
      [],
    );

    expect(result.jsonLd.description).toBe('A fine purveyor of widgets.');
    expect(result.meta).toContainEqual({ property: 'og:description', content: 'A fine purveyor of widgets.' });
    expect(result.sitemap).toStrictEqual([]);
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildSeo(
      { id: 'not-a-uri', name: 'Acme', url: 'https://example.org/' },
      [],
    )).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI url.', (): void => {
    expect((): unknown => buildSeo(
      { id: 'https://example.org/#business', name: 'Acme', url: 'not-a-uri' },
      [],
    )).toThrow('url must be an absolute URI');
  });

  it('rejects an empty name.', (): void => {
    expect((): unknown => buildSeo(
      { id: 'https://example.org/#business', name: '  ', url: 'https://example.org/' },
      [],
    )).toThrow('needs a name');
  });

  it('rejects an empty sitemap page.', (): void => {
    expect((): unknown => buildSeo(
      { id: 'https://example.org/#business', name: 'Acme', url: 'https://example.org/' },
      [ 'https://example.org/', '  ' ],
    )).toThrow('sitemap page must not be empty');
  });
});
