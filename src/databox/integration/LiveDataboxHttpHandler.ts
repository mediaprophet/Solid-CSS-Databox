import { timingSafeEqual } from 'node:crypto';
import type { ResourceStore } from '../../storage/ResourceStore';
import type { HttpHandlerInput } from '../../server/HttpHandler';
import { HttpHandler } from '../../server/HttpHandler';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';
import type { DurableCommitInput } from '../bridge/DataboxBridge';
import { MappingForge } from '../forge/MappingForge';
import { MappingForgeHttpApi } from '../forge/MappingForgeHttpApi';
import type { DurableCommit } from '../receipt/DurableCommit';
import { CssDataboxStore } from './CssDataboxStore';

/**
 * Mounts the Databox Forge control plane in a live CSS process while all accepted resources are committed to
 * CSS's ResourceStore. This is an experimental single-process integration profile, not the production IAM model.
 */
export class LiveDataboxHttpHandler extends HttpHandler {
  private readonly routeBase: string;
  private readonly token: Buffer;
  private readonly api: MappingForgeHttpApi;

  public constructor(
    source: ResourceStore,
    backend: ResourceStore,
    baseUrl: string,
    controlToken: string,
    routeBase = '/.databox/forge',
  ) {
    super();
    if (typeof controlToken !== 'string' || Buffer.byteLength(controlToken, 'utf8') < 32) {
      throw new TypeError('Databox live integration requires a control token of at least 32 bytes.');
    }
    this.routeBase = normalizeRouteBase(routeBase);
    this.token = Buffer.from(controlToken, 'utf8');
    const store = new CssDataboxStore(source, backend, baseUrl);
    async function durableCommit(input: DurableCommitInput): Promise<DurableCommit> {
      return store.commit(input);
    }
    const forge = new MappingForge({
      provision: async(result): Promise<void> => {
        await store.provision(result);
      },
      durableCommit,
    });
    this.api = new MappingForgeHttpApi(forge, this.routeBase);
  }

  public async canHandle({ request }: HttpHandlerInput): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path !== this.routeBase && !path.startsWith(`${this.routeBase}/`)) {
      throw new NotImplementedHttpError('Not a Databox integration route.');
    }
  }

  public async handle({ request, response }: HttpHandlerInput): Promise<void> {
    if (!this.authorized(request.headers.authorization)) {
      response.statusCode = 401;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('www-authenticate', 'Bearer realm="databox-control"');
      response.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    response.setHeader('cache-control', 'no-store');
    await this.api.handle(request, response);
  }

  private authorized(header: string | undefined): boolean {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return false;
    }
    const presented = Buffer.from(header.slice('Bearer '.length), 'utf8');
    return presented.length === this.token.length && timingSafeEqual(presented, this.token);
  }
}

function normalizeRouteBase(value: string): string {
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}
