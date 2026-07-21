import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import type { PublicWebsiteStore } from '../../PublicWebsiteStore';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { renderPublicWebsiteFeed, renderPublicWebsiteFeedFromRdf, renderPublicWebsiteFeedPreview } from './PublicFeedRenderer';
import { deriveSitemapPages, renderRobots, renderSitemap } from './SitemapRobots';
import type { PublicWebsiteFeedInput, PublicWebsiteFeedRdfInput } from './PublicFeedRenderer';

export function registerWebsiteRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>, publicWebsiteStore?: PublicWebsiteStore): void {
  router.register('POST', '/website/preview', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, renderPublicWebsiteFeedPreview(input));
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid website preview request.',
      });
    }
  });
  router.register('POST', '/website/publish', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!publicWebsiteStore) {
        throw new Error('Publishing the public website requires a PublicWebsiteStore.');
      }
      const body = await readJsonBody<{ baseIri?: unknown; feed?: unknown }>(request);
      if (typeof body.baseIri !== 'string') {
        throw new TypeError('A website publish request needs a baseIri string.');
      }
      if (!isRecord(body.feed)) {
        throw new Error('A website publish request needs a feed object.');
      }
      const render = typeof body.feed.turtle === 'string' ?
          renderPublicWebsiteFeedFromRdf(body.feed as unknown as PublicWebsiteFeedRdfInput) :
          renderPublicWebsiteFeed(body.feed as unknown as PublicWebsiteFeedInput);
      const published = await publicWebsiteStore.publish(body.baseIri, render);
      writeJson(response, 201, { published }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid website publish request.',
      });
    }
  });

  router.register('POST', '/website/seo', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!publicWebsiteStore) {
        throw new Error('Publishing SEO assets requires a PublicWebsiteStore.');
      }
      const body = await readJsonBody<Record<string, unknown>>(request);
      if (typeof body.baseIri !== 'string') {
        throw new TypeError('A website seo request needs a baseIri string.');
      }
      if (!isRecord(body.sitemap) || !Array.isArray(body.sitemap.pages)) {
        throw new TypeError('A website seo request needs a sitemap object with a pages array.');
      }
      if (!isRecord(body.robots) || typeof body.robots.siteUrl !== 'string' || typeof body.robots.sitemapUrl !== 'string') {
        throw new TypeError('A website seo request needs a robots object with siteUrl and sitemapUrl strings.');
      }
      const sitemapRender = renderSitemap(body.sitemap as unknown as import('./SitemapRobots').SitemapInput);
      const robotsRender = renderRobots(body.robots as unknown as import('./SitemapRobots').RobotsInput);
      const published = await publicWebsiteStore.publishSeoAssets(body.baseIri, sitemapRender, robotsRender);
      writeJson(response, 201, { published }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid website seo request.',
      });
    }
  });

  router.register('POST', '/website/sitemap', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      if (!publicWebsiteStore) {
        throw new Error('Publishing a sitemap requires a PublicWebsiteStore.');
      }
      const body = await readJsonBody<Record<string, unknown>>(request);
      if (typeof body.baseIri !== 'string') {
        throw new TypeError('A website sitemap request needs a baseIri string.');
      }
      if (typeof body.businessUrl !== 'string') {
        throw new TypeError('A website sitemap request needs a businessUrl string.');
      }
      const pages = deriveSitemapPages(body as any);
      const sitemapRender = renderSitemap({ pages, lastmod: body.lastmod as string | undefined });
      const published = await publicWebsiteStore.publishSeoAssets(body.baseIri, sitemapRender);
      writeJson(response, 201, { published, sitemap: { xml: sitemapRender.xml }}, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid website sitemap request.',
      });
    }
  });
}
