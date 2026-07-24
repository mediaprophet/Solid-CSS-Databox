import fetch from 'cross-fetch';
import type { App } from '../../src/init/App';
import { getPort } from '../util/Util';
import { getDefaultVariables, instantiateFromConfig } from './Config';

const port = getPort('DataboxIpmsVanilla');
const baseUrl = `http://localhost:${port}/`;

describe('Databox IPMS Vanilla Solid Degradation', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    // Spin up the server with the IPMS configuration
    app = await instantiateFromConfig(
      'urn:solid-server:default:App',
      'config/ipms/ipms.json',
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:ipms:variable:controlToken': 'ipms-vanilla-control-token-00000001',
      },
    ) as App;
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    if (app) {
      await app.stop();
    }
  });

  it('acts as a standard LDP POD on non-IPMS routes', async(): Promise<void> => {
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
    await expect(res2.text()).resolves.toBe('Standard Solid works perfectly!');

    // Clean up
    await fetch(`${baseUrl}test-vanilla.txt`, { method: 'DELETE' });
  });
});
