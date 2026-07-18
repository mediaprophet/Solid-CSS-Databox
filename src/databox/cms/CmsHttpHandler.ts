import { timingSafeEqual } from 'node:crypto';
import type { HttpHandlerInput } from '../../server/HttpHandler';
import { HttpHandler } from '../../server/HttpHandler';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';
import { CmsModuleRouter } from './CmsModuleRouter';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';

/** A control-plane handler for one CMS route, given the raw HTTP input. */
export type CmsControlHandler = (input: HttpHandlerInput) => Promise<void>;

/**
 * Mounts the Databox CMS control plane in a live CSS process (see `databox/solid-cms-plan.md`, §5.1).
 *
 * It claims only paths at or under `routeBase` (default `/.databox/cms`), requires a bearer control
 * token of at least 32 bytes (constant-time compared), and dispatches authorized requests through a
 * {@link CmsModuleRouter} — the shared table modules register their routes into. It ships one built-in
 * route (`GET /modules`, the enabled-module list) so the framework is exercisable end-to-end. This
 * single-process control token is a demonstration boundary, not production operator IAM.
 */
export class CmsHttpHandler extends HttpHandler {
  private readonly routeBase: string;
  private readonly token: Buffer;
  private readonly router: CmsModuleRouter<CmsControlHandler>;

  public constructor(
    registry: DataboxModuleRegistry,
    controlToken: string,
    routeBase = '/.databox/cms',
  ) {
    super();
    if (typeof controlToken !== 'string' || Buffer.byteLength(controlToken, 'utf8') < 32) {
      throw new TypeError('The Databox CMS control plane requires a control token of at least 32 bytes.');
    }
    this.routeBase = normalizeRouteBase(routeBase);
    this.token = Buffer.from(controlToken, 'utf8');
    this.router = new CmsModuleRouter<CmsControlHandler>(this.routeBase);
    this.router.register('GET', '/modules', async({ response }): Promise<void> => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(registry.list().map((manifest): string => manifest.id)));
    });
  }

  public async canHandle({ request }: HttpHandlerInput): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path !== this.routeBase && !path.startsWith(`${this.routeBase}/`)) {
      throw new NotImplementedHttpError('Not a Databox CMS route.');
    }
  }

  public async handle({ request, response }: HttpHandlerInput): Promise<void> {
    if (!this.authorized(request.headers.authorization)) {
      response.statusCode = 401;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('www-authenticate', 'Bearer realm="databox-cms"');
      response.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    response.setHeader('cache-control', 'no-store');
    const handler = this.router.resolve(request.method ?? 'GET', request.url ?? '/');
    if (!handler) {
      response.statusCode = 404;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'not-found' }));
      return;
    }
    await handler({ request, response });
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
