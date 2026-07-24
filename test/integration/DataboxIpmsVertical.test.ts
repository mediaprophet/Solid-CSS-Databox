import fetch from 'cross-fetch';
import type { App } from '../../src/init/App';
import { getPort } from '../util/Util';
import { getDefaultVariables, instantiateFromConfig } from './Config';

const port = getPort('DataboxIpmsVertical');
const baseUrl = `http://localhost:${port}/`;
const controlToken = 'ipms-vertical-control-token-000000001';

describe('Databox IPMS Vertical Integration', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    // Spin up the server with the IPMS configuration
    app = await instantiateFromConfig(
      'urn:solid-server:default:App',
      'config/ipms/ipms.json',
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:ipms:variable:controlToken': 'ipms-vertical-control-token-000000001',
      },
    ) as App;
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    if (app) {
      await app.stop();
    }
  });

  it('safely scopes IPMS routes without leaking', async(): Promise<void> => {
    // Verify that the IPMS modules endpoint is reachable with auth
    const resModules = await fetch(`${baseUrl}.databox/ipms/modules`, {
      headers: { authorization: `Bearer ${controlToken}` },
    });
    expect(resModules.status).toBe(200);
    expect(resModules.headers.get('content-type')).toContain('application/json');

    // Verify that IPMS routes require auth (no token → 401)
    const resNoAuth = await fetch(`${baseUrl}.databox/ipms/modules`);
    expect(resNoAuth.status).toBe(401);

    // Cross-module logic: IPMS routes shouldn't pollute the generic root
    const rootCheck = await fetch(baseUrl);
    expect(rootCheck.status).toBe(200);
  });
});
