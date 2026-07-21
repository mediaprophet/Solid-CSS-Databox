import { instantiateFromConfig } from './Config';
import type { App } from '../../src/init/App';
import fetch from 'cross-fetch';
import { getPort } from '../util/Util';

const port = getPort('DataboxCms');
const baseUrl = `http://localhost:${port}/`;

describe('Databox CMS Accessibility (A11y) & i18n Checks', (): void => {
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

  it('generates HTML with standard a11y markers on the website endpoints', async(): Promise<void> => {
    const res = await fetch(`${baseUrl}.databox/cms/website/index.html`);
    expect(res.status).toBe(200);
    
    const html = await res.text();
    
    // Check for standard HTML5 doctype
    expect(html).toMatch(/<!DOCTYPE html>/i);
    
    // Check for language declaration
    expect(html).toMatch(/<html[^>]*lang="en"/i);
    
    // Check for viewport meta tag
    expect(html).toMatch(/<meta[^>]*name="viewport"/i);
    
    // Check for title tag
    expect(html).toMatch(/<title>.*?<\/title>/i);
    
    // Assert ARIA main landmark is present
    expect(html).toMatch(/<main/i);
  });
});
