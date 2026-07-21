import { getDefaultVariables, instantiateFromConfig } from './Config';
import type { App } from '../../src/init/App';
import fetch from 'cross-fetch';
import { getPort } from '../util/Util';

const port = getPort('DataboxCmsVanilla');
const baseUrl = `http://localhost:${port}/`;

describe('Databox CMS Vanilla Solid Degradation', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    // Spin up the server with the CMS configuration
    app = await instantiateFromConfig(
      'urn:solid-server:default:App',
      'config/cms/cms.json',
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:cms:variable:controlToken': 'cms-vanilla-control-token-00000001',
      },
    ) as App;
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    if (app) {
      await app.stop();
    }
  });

  it('acts as a standard LDP POD on non-CMS routes', async(): Promise<void> => {
    // Create a standard LDP resource
    const res1 = await fetch(`${baseUrl}test-vanilla.txt`, {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
      },
      body: 'Standard Solid works perfectly!',
    });
    expect(res1.status).toBe(201);

    // Retrieve the standard resource
    const res2 = await fetch(`${baseUrl}test-vanilla.txt`);
    expect(res2.status).toBe(200);
    expect(await res2.text()).toBe('Standard Solid works perfectly!');

    // Clean up
    await fetch(`${baseUrl}test-vanilla.txt`, { method: 'DELETE' });
  });
});
