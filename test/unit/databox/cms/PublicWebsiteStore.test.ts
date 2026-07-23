import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { renderPublicWebsiteFeed } from '../../../../src/databox/cms/modules/website/PublicFeedRenderer';
import { PublicWebsiteStore } from '../../../../src/databox/cms/PublicWebsiteStore';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

const baseUrl = 'http://localhost:3000/';

function renderInput(overrides: Record<string, unknown> = {}): Parameters<typeof renderPublicWebsiteFeed>[0] {
  return {
    business: {
      id: `${baseUrl}profile/card#org`,
      name: 'Test Cafe',
      url: baseUrl,
    },
    catalogue: [{
      id: `${baseUrl}catalogue/flat-white#item`,
      name: 'Flat white',
      price: 4.8,
      currency: 'AUD',
    }],
    ...overrides,
  };
}

describe('A PublicWebsiteStore', (): void => {
  let data: Map<string, { content: string; contentType: string }>;
  let store: PublicWebsiteStore;

  beforeEach((): void => {
    data = new Map<string, { content: string; contentType: string }>();
    const resourceStore = {
      hasResource: async(id: ResourceIdentifier): Promise<boolean> => data.has(id.path),
      getRepresentation: async(id: ResourceIdentifier): Promise<Representation> => {
        const entry = data.get(id.path);
        return new BasicRepresentation(entry?.content ?? '', entry?.contentType ?? 'text/html');
      },
      setRepresentation: async(id: ResourceIdentifier, representation: Representation): Promise<void> => {
        data.set(id.path, {
          content: await readableToString(representation.data),
          contentType: representation.metadata.contentType ?? 'text/html',
        });
      },
    } as unknown as ResourceStore;
    store = new PublicWebsiteStore(resourceStore, baseUrl);
  });

  it('publishes each present asset at its own IRI with the right content type.', async(): Promise<void> => {
    const render = renderPublicWebsiteFeed(renderInput({ themeCss: { css: 'body{color:red}' }}));
    const persisted = await store.publish(baseUrl, render);

    expect(persisted.map((resource): string => resource.role)).toEqual([ 'html', 'json-ld', 'theme-css' ]);
    expect(data.get(`${baseUrl}index.html`)?.contentType).toBe('text/html');
    expect(data.get(`${baseUrl}index.html`)?.content).toContain('Test Cafe');
    expect(data.get(`${baseUrl}data.jsonld`)?.contentType).toBe('application/ld+json');
    expect(data.get(`${baseUrl}data.jsonld`)?.content).toContain('LocalBusiness');
    const jsonLd = JSON.parse(data.get(`${baseUrl}data.jsonld`)?.content ?? '{}');
    expect(jsonLd['@context']).toEqual({ '@vocab': 'https://schema.org/' });
    expect(data.get(`${baseUrl}theme.css`)?.contentType).toBe('text/css');
    expect(data.get(`${baseUrl}theme.css`)?.content).toBe('body{color:red}');
  });

  it('loads a published resource back as a serialized string.', async(): Promise<void> => {
    const render = renderPublicWebsiteFeed(renderInput());
    await store.publish(baseUrl, render);
    const loaded = await store.load(`${baseUrl}index.html`);
    expect(loaded).toContain('Test Cafe');
  });

  it('returns undefined when loading a resource that was never written.', async(): Promise<void> => {
    await expect(store.load(`${baseUrl}absent.html`)).resolves.toBeUndefined();
  });

  it('does not write an optional asset the render omits (no theme CSS).', async(): Promise<void> => {
    const render = renderPublicWebsiteFeed(renderInput());
    const persisted = await store.publish(baseUrl, render);

    expect(persisted.map((resource): string => resource.role)).toEqual([ 'html', 'json-ld' ]);
    expect(data.has(`${baseUrl}theme.css`)).toBe(false);
  });

  it('rejects a baseIri outside the pod storage space.', async(): Promise<void> => {
    const render = renderPublicWebsiteFeed(renderInput());
    await expect(store.publish('https://elsewhere.example/www/', render))
      .rejects.toThrow('must live inside the pod storage space');
  });

  it('rejects a non-absolute resource IRI on load.', async(): Promise<void> => {
    await expect(store.load('/index.html')).rejects.toThrow('must be an absolute URI');
  });
});
