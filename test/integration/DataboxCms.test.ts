import fetch from 'cross-fetch';
import type { App } from '../../src/init/App';
import { getPort } from '../util/Util';
import { getDefaultVariables, getTestConfigPath, instantiateFromConfig } from './Config';

const port = getPort('DataboxCms');
const baseUrl = `http://localhost:${port}/`;
const controlToken = 'cms-integration-control-token-00000001';
const modulesRoute = `${baseUrl}.databox/cms/modules`;

describe('the Databox CMS control plane in Community Solid Server', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    const instances = await instantiateFromConfig(
      'urn:solid-server:test:Instances',
      getTestConfigPath('cms.json'),
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:cms:variable:controlToken': controlToken,
      },
    ) as { app: App };
    ({ app } = instances);
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    await app.stop();
  });

  it('protects the control plane: no bearer token yields 401.', async(): Promise<void> => {
    const response = await fetch(modulesRoute);
    expect(response.status).toBe(401);
  });

  it('serves the built-in modules route with a valid control token.', async(): Promise<void> => {
    const response = await fetch(modulesRoute, { headers: { authorization: `Bearer ${controlToken}` }});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('leaves the base Solid server untouched: its OIDC discovery still responds.', async(): Promise<void> => {
    const response = await fetch(`${baseUrl}.well-known/openid-configuration`);
    expect(response.status).toBe(200);
  });
});
