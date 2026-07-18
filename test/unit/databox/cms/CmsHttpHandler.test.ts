import type { HttpHandlerInput } from '../../../../src/server/HttpHandler';
import { CmsHttpHandler } from '../../../../src/databox/cms/CmsHttpHandler';
import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/cms/DataboxModuleRegistry';

const token = 'cms-control-token-0123456789012345';
const sameLengthWrong = 'cms-control-token-9999999999999999';

class MockResponse {
  public statusCode = 0;
  public readonly headers: Record<string, string> = {};
  public body = '';
  public setHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  public end(body?: string): void {
    this.body = body ?? '';
  }
}

function input(res: MockResponse, opts: { url?: string; method?: string; auth?: string }): HttpHandlerInput {
  return {
    request: { url: opts.url, method: opts.method, headers: { authorization: opts.auth }},
    response: res,
  } as unknown as HttpHandlerInput;
}

describe('A CmsHttpHandler', (): void => {
  let registry: InMemoryDataboxModuleRegistry;
  let handler: CmsHttpHandler;

  beforeEach((): void => {
    registry = new InMemoryDataboxModuleRegistry();
    registry.register({
      id: 'hosting',
      name: 'Hosting',
      version: '0.1.0',
      description: 'x',
      capabilities: [],
      routes: [],
    });
    handler = new CmsHttpHandler(registry, token);
  });

  it('rejects a control token shorter than 32 bytes.', (): void => {
    expect((): CmsHttpHandler => new CmsHttpHandler(registry, 'too-short'))
      .toThrow('at least 32 bytes');
  });

  describe('canHandle()', (): void => {
    it('accepts the exact base and sub-paths.', async(): Promise<void> => {
      await expect(handler.canHandle(input(new MockResponse(), { url: '/.databox/cms' }))).resolves.toBeUndefined();
      await expect(handler.canHandle(input(new MockResponse(), { url: '/.databox/cms/modules' })))
        .resolves.toBeUndefined();
    });

    it('rejects other paths, including a missing URL.', async(): Promise<void> => {
      await expect(handler.canHandle(input(new MockResponse(), { url: '/other' })))
        .rejects.toThrow('Not a Databox CMS route.');
      await expect(handler.canHandle(input(new MockResponse(), {})))
        .rejects.toThrow('Not a Databox CMS route.');
    });

    it('normalises a custom route base without a leading and with a trailing slash.', async(): Promise<void> => {
      const custom = new CmsHttpHandler(registry, token, 'databox/cms/');
      await expect(custom.canHandle(input(new MockResponse(), { url: '/databox/cms/x' })))
        .resolves.toBeUndefined();
      await expect(custom.canHandle(input(new MockResponse(), { url: '/other' })))
        .rejects.toThrow('Not a Databox CMS route.');
    });
  });

  describe('handle()', (): void => {
    it('returns 401 without, or with an invalid, bearer token.', async(): Promise<void> => {
      const invalidAuths = [
        undefined,
        'Basic abc',
        'Bearer short',
        `Bearer ${sameLengthWrong}`,
      ];
      for (const auth of invalidAuths) {
        const res = new MockResponse();
        await handler.handle(input(res, { url: '/.databox/cms/modules', method: 'GET', auth }));
        expect(res.statusCode).toBe(401);
      }
    });

    it('lists module ids for the built-in route with a valid token.', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, { url: '/.databox/cms/modules', auth: `Bearer ${token}` }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual([ 'hosting' ]);
    });

    it('returns 404 for an unknown authorized route (including a missing URL).', async(): Promise<void> => {
      const res = new MockResponse();
      await handler.handle(input(res, { url: '/.databox/cms/nope', method: 'GET', auth: `Bearer ${token}` }));
      expect(res.statusCode).toBe(404);

      const res2 = new MockResponse();
      await handler.handle(input(res2, { auth: `Bearer ${token}` }));
      expect(res2.statusCode).toBe(404);
    });
  });
});
