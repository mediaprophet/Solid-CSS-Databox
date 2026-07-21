import { getDefaultVariables, instantiateFromConfig } from './Config';
import type { App } from '../../src/init/App';
import fetch from 'cross-fetch';
import { getPort } from '../util/Util';

const port = getPort('DataboxCmsVertical');
const baseUrl = `http://localhost:${port}/`;
const controlToken = 'cms-vertical-control-token-000000001';

describe('Databox CMS Vertical Integration', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    // Spin up the server with the CMS configuration
    app = await instantiateFromConfig(
      'urn:solid-server:default:App',
      'config/cms/cms.json',
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:cms:variable:controlToken': 'cms-vertical-control-token-000000001',
      },
    ) as App;
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    if (app) {
      await app.stop();
    }
  });

  it('safely scopes CMS routes without leaking', async(): Promise<void> => {
    // Verify that the CMS modules endpoint is reachable with auth
    const resModules = await fetch(`${baseUrl}.databox/cms/modules`, {
      headers: { authorization: `Bearer ${controlToken}` },
    });
    expect(resModules.status).toBe(200);
    expect(resModules.headers.get('content-type')).toContain('application/json');

    // Verify that CMS routes require auth (no token → 401)
    const resNoAuth = await fetch(`${baseUrl}.databox/cms/modules`);
    expect(resNoAuth.status).toBe(401);

    // Cross-module logic: CMS routes shouldn't pollute the generic root
    const rootCheck = await fetch(`${baseUrl}`);
    expect(rootCheck.status).toBe(200);
  });
});
