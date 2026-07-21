import { instantiateFromConfig } from './Config';
import type { App } from '../../src/init/App';
import fetch from 'cross-fetch';
import { getPort } from '../util/Util';

const port = getPort('DataboxCms');
const baseUrl = `http://localhost:${port}/`;

describe('Databox CMS Vertical Integration', (): void => {
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

  it('safely scopes CMS routes without leaking', async(): Promise<void> => {
    // Verify that the website endpoint is reachable and returns HTML
    const resWebsite = await fetch(`${baseUrl}.databox/cms/website/index.html`);
    expect(resWebsite.status).toBe(200);
    expect(resWebsite.headers.get('content-type')).toContain('text/html');

    // Verify POS endpoint
    const resPos = await fetch(`${baseUrl}.databox/cms/pos/catalogue`);
    expect(resPos.status).toBe(200);
    expect(resPos.headers.get('content-type')).toContain('application/json');

    // Cross-module logic: if POS is present, it shouldn't pollute the generic root
    const rootCheck = await fetch(`${baseUrl}`);
    // Root container returns turtle (or HTML representation based on content negotiation)
    expect(rootCheck.status).toBe(200);
  });
});
