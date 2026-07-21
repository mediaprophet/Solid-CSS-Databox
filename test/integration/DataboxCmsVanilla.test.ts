import { instantiateFromConfig } from './Config';
import type { App } from '../../src/init/App';
import fetch from 'cross-fetch';
import { getPort } from '../util/Util';

const port = getPort('DataboxCms');
const baseUrl = `http://localhost:${port}/`;

describe('Databox CMS Vanilla Solid Degradation', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    // Spin up the server with the CMS configuration
    app = await instantiateFromConfig(
      'urn:solid-server:default:App',
      'config/cms/cms.json',
      {
        'urn:solid-server:default:variable:port': port,
        'urn:solid-server:default:variable:baseUrl': baseUrl,
        'urn:solid-server:default:variable:loggingLevel': 'off',
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
