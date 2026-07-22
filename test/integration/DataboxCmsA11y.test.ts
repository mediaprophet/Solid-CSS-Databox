import fetch from 'cross-fetch';
import type { App } from '../../src/init/App';
import { getPort } from '../util/Util';
import { getDefaultVariables, instantiateFromConfig } from './Config';

const port = getPort('DataboxCmsA11y');
const baseUrl = `http://localhost:${port}/`;
const controlToken = 'cms-a11y-control-token-000000001';

describe('Databox CMS Accessibility (A11y) & i18n Checks', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    // Spin up the server with the CMS configuration
    app = await instantiateFromConfig(
      'urn:solid-server:default:App',
      'config/cms/cms.json',
      {
        ...getDefaultVariables(port, baseUrl),
        'urn:solid-server:cms:variable:controlToken': 'cms-a11y-control-token-000000001',
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
    const res = await fetch(`${baseUrl}.databox/cms/website/preview`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state: {
          contentType: 'text/turtle',
          turtle: [
            '@prefix schema: <https://schema.org/> .',
            `<${baseUrl}profile/card#org> a schema:LocalBusiness ;`,
            '  schema:name "Corner Cafe" ;',
            `  schema:url <${baseUrl}> .`,
            `<${baseUrl}catalogue/flat-white#item> a schema:Product ;`,
            '  schema:name "Flat white" ;',
            '  schema:offers [ a schema:Offer ; schema:price "4.80" ; schema:priceCurrency "AUD" ] .',
          ].join('\n'),
          baseIri: `${baseUrl}profile/card#org`,
        },
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    const html = body.html;

    // Check for standard HTML5 doctype
    expect(html).toMatch(/<!doctype html>/iu);

    // Check for language declaration
    expect(html).toMatch(/<html[^>]*lang="en"/iu);

    // Check for viewport meta tag
    expect(html).toMatch(/<meta[^>]*name="viewport"/iu);

    // Check for title tag
    expect(html).toMatch(/<title>.*?<\/title>/iu);

    // Assert ARIA main landmark is present
    expect(html).toMatch(/<main/iu);
  });
});
