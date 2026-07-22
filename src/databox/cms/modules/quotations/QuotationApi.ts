import type { SolidModuleManifest } from '../../SolidModuleManifest';
import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import type { QuotationRenderer } from './QuotationRenderer';

export const QUOTATION_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'quotations',
  name: 'Tradie Quotations & Site Inspections',
  version: '0.1.0',
  description: 'Exposes secure, read-only HTML views of W3C schema:Offer and schema:Quote resources for clients.',
  capabilities: [
    'cms:quotation-render',
    'cms:site-inspection',
  ],
  routes: [],
};

export class QuotationApi {
  public constructor(
    private readonly renderer: QuotationRenderer,
  ) {}

  public async handlePublicQuoteView(quoteUri: string): Promise<{ html: string }> {
    const html = await this.renderer.renderHtmlQuote(quoteUri);
    return { html };
  }
}

export function registerQuotationsRoutes(router: CmsModuleRouter, renderer: QuotationRenderer): void {
  const api = new QuotationApi(renderer);

  router.register(
    'GET',
    '/quotations/public/:quoteId',
    async({ request: _request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const result = await api.handlePublicQuoteView('dummy-uri');
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.writeHead(200);
        response.end(result.html);
      } catch {
        response.setHeader('content-type', 'application/json');
        response.writeHead(400);
        response.end(JSON.stringify({ error: 'Failed to render quotation' }));
      }
    },
  );
}
