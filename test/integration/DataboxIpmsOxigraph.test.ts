import fetch from 'cross-fetch';
import type { App } from '../../src/init/App';
import { getPort } from '../util/Util';
import { getDefaultVariables, getPresetConfigPath, instantiateFromConfig } from './Config';

type EndpointConfig = {
  profile: 'ipms-sparql.json' | 'ipms-oxigraph.json';
  sparqlEndpoint: string;
  sparqlUpdateEndpoint?: string;
};

const endpointConfig = getEndpointConfig();
const describeIfEndpoint = endpointConfig ? describe : describe.skip;

const port = getPort('DataboxIpms') + 100;
const baseUrl = `http://localhost:${port}/`;
const controlToken = 'ipms-oxigraph-control-token-00000001';
const modulesRoute = `${baseUrl}.databox/ipms/modules`;

// Live Oxigraph/SPARQL smoke test.
//
// Skipped by default. Enable it with one of these endpoint shapes:
//
// Unified Oxigraph endpoint:
//   DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT=http://localhost:7878/sparql
//
// Split query/update endpoints:
//   DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT=http://localhost:7878/query
//   DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT=http://localhost:7878/update
//
// The CSS-style variable names are also accepted:
//   CSS_SPARQL_ENDPOINT=http://localhost:7878/sparql
//   CSS_SPARQL_ENDPOINT=http://localhost:7878/query
//   CSS_SPARQL_UPDATE_ENDPOINT=http://localhost:7878/update
/* eslint-disable jest/require-top-level-describe, jest/consistent-test-it */
describe('the Databox IPMS Oxigraph smoke endpoint configuration', (): void => {
  it('stays disabled for normal gates when no live endpoint is configured.', (): void => {
    expect(getEndpointConfig({})).toBeUndefined();
  });

  it('selects the unified SPARQL profile for a single Oxigraph /sparql endpoint.', (): void => {
    expect(getEndpointConfig({
      DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT: 'http://localhost:7878/sparql',
    })).toEqual({
      profile: 'ipms-sparql.json',
      sparqlEndpoint: 'http://localhost:7878/sparql',
    });
  });

  it('selects the split Oxigraph profile for separate query and update endpoints.', (): void => {
    expect(getEndpointConfig({
      DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT: 'http://localhost:7878/query',
      DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT: 'http://localhost:7878/update',
    })).toEqual({
      profile: 'ipms-oxigraph.json',
      sparqlEndpoint: 'http://localhost:7878/query',
      sparqlUpdateEndpoint: 'http://localhost:7878/update',
    });
  });

  it('does not enable the live smoke for a split query endpoint without an update endpoint.', (): void => {
    expect(getEndpointConfig({
      DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT: 'http://localhost:7878/query',
    })).toBeUndefined();
  });

  it('maps CSS SPARQL variable names onto the split profile when an update endpoint is present.', (): void => {
    expect(getEndpointConfig({
      CSS_SPARQL_ENDPOINT: 'http://localhost:7878/query',
      CSS_SPARQL_UPDATE_ENDPOINT: 'http://localhost:7878/update',
    })).toEqual({
      profile: 'ipms-oxigraph.json',
      sparqlEndpoint: 'http://localhost:7878/query',
      sparqlUpdateEndpoint: 'http://localhost:7878/update',
    });
  });

  it('prefers explicit split endpoints over a unified endpoint when both are provided.', (): void => {
    expect(getEndpointConfig({
      DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT: 'http://localhost:7878/sparql',
      DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT: 'http://localhost:7878/query',
      DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT: 'http://localhost:7878/update',
    })).toEqual({
      profile: 'ipms-oxigraph.json',
      sparqlEndpoint: 'http://localhost:7878/query',
      sparqlUpdateEndpoint: 'http://localhost:7878/update',
    });
  });
});

describeIfEndpoint('the Databox IPMS control plane over a live Oxigraph/SPARQL backend', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    const variables: Record<string, any> = {
      ...getDefaultVariables(port, baseUrl),
      'urn:solid-server:ipms:variable:controlToken': controlToken,
      'urn:solid-server:default:variable:sparqlEndpoint': endpointConfig!.sparqlEndpoint,
    };
    if (endpointConfig!.sparqlUpdateEndpoint) {
      variables['urn:solid-server:default:variable:sparqlUpdateEndpoint'] = endpointConfig!.sparqlUpdateEndpoint;
    }

    const instances = await instantiateFromConfig(
      'urn:solid-server:default:App',
      getPresetConfigPath(`ipms/${endpointConfig!.profile}`),
      variables,
    ) as App;

    app = instances;
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    await app.stop();
  });

  it('writes IPMS module RDF state and round-trips portable works through SPARQL storage.', async(): Promise<void> => {
    const modulesResponse = await fetch(modulesRoute, {
      headers: { authorization: `Bearer ${controlToken}` },
    });
    expect(modulesResponse.status).toBe(200);
    await expect(modulesResponse.json()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hosting', enabled: true }),
    ]));

    const stateResponse = await fetch(`${modulesRoute}/hosting`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        enabled: false,
        configTurtle: '<> <urn:example:ipmsOxigraphSmoke> "written-through-sparql" .',
      }),
    });
    expect(stateResponse.status).toBe(200);
    await expect(stateResponse.json()).resolves.toMatchObject({
      id: 'hosting',
      enabled: false,
      configTurtle: expect.stringContaining('written-through-sparql'),
    });

    const worksResponse = await fetch(`${baseUrl}.databox/ipms/works`, {
      headers: { authorization: `Bearer ${controlToken}` },
    });
    expect(worksResponse.status).toBe(200);
    const works = await worksResponse.json();
    expect(works).toMatchObject({
      type: 'DataboxIpmsWorks',
    });
    expect(works.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        manifest: expect.objectContaining({ id: 'hosting' }),
        enabled: false,
        state: {
          contentType: 'text/turtle',
          turtle: expect.stringContaining('written-through-sparql'),
        },
      }),
    ]));

    const importedModuleId = `oxigraph-smoke-${Date.now()}`;
    const importResponse = await fetch(`${baseUrl}.databox/ipms/works/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...works,
        modules: [
          ...works.modules,
          {
            manifest: {
              id: importedModuleId,
              name: 'Oxigraph Smoke Module',
              version: '0.1.0',
              description: 'Imported by the live SPARQL IPMS smoke test.',
              capabilities: [ 'ipms:portable-core' ],
              routes: [],
            },
            enabled: true,
            state: {
              contentType: 'text/turtle',
              turtle: '<> <urn:example:ipmsOxigraphImportSmoke> "imported-through-sparql" .',
            },
          },
        ],
      }),
    });
    expect(importResponse.status).toBe(200);
    await expect(importResponse.json()).resolves.toMatchObject({
      type: 'DataboxIpmsWorks',
      modules: expect.arrayContaining([
        expect.objectContaining({
          manifest: expect.objectContaining({ id: importedModuleId }),
          enabled: true,
          state: {
            contentType: 'text/turtle',
            turtle: expect.stringContaining('imported-through-sparql'),
          },
        }),
      ]),
    });
  });
});

function getEndpointConfig(env: NodeJS.ProcessEnv = process.env): EndpointConfig | undefined {
  const unifiedEndpoint = env.DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT ?? env.CSS_SPARQL_ENDPOINT;
  const queryEndpoint = env.DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT;
  const updateEndpoint = env.DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT ?? env.CSS_SPARQL_UPDATE_ENDPOINT;

  if (queryEndpoint && updateEndpoint) {
    return {
      profile: 'ipms-oxigraph.json',
      sparqlEndpoint: queryEndpoint,
      sparqlUpdateEndpoint: updateEndpoint,
    };
  }

  if (unifiedEndpoint && updateEndpoint) {
    return {
      profile: 'ipms-oxigraph.json',
      sparqlEndpoint: unifiedEndpoint,
      sparqlUpdateEndpoint: updateEndpoint,
    };
  }

  if (unifiedEndpoint) {
    return {
      profile: 'ipms-sparql.json',
      sparqlEndpoint: unifiedEndpoint,
    };
  }
}
