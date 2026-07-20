import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const runner = join(root, 'scripts', 'run-cms-migration-proof.mjs');

describe('CMS migration proof runner', (): void => {
  it('builds a unified live migration plan with real CSS profile launch commands.', (): void => {
    const plan = dryRunPlan([
      '--mode=unified',
      '--start-css',
      '--start-oxigraph',
      '--source-port=4910',
      '--target-port=4911',
      '--oxigraph-bind=127.0.0.1:7979',
    ]);

    expect(plan).toMatchObject({
      mode: 'unified',
      queryProbeEndpoint: 'http://127.0.0.1:7979/sparql',
      sourceCss: {
        role: 'canonical file-backed CSS profile',
        launch: true,
        command: 'node',
        baseUrl: 'http://127.0.0.1:4910/',
        worksRoute: 'http://127.0.0.1:4910/.databox/cms/works',
      },
      targetCss: {
        role: 'Oxigraph-backed CSS profile',
        launch: true,
        command: 'node',
        baseUrl: 'http://127.0.0.1:4911/',
        profile: 'config/cms/cms-sparql.json',
        worksImportRoute: 'http://127.0.0.1:4911/.databox/cms/works/import',
        typeIndexRoute: 'http://127.0.0.1:4911/.well-known/databox-cms',
      },
      oxigraph: {
        command: process.execPath,
        args: [
          expect.stringContaining('oxigraph-wasm-server.mjs'),
          'serve',
          '--bind',
          '127.0.0.1:7979',
          '--cors',
        ],
      },
      oxigraphEndpoints: {
        sparql: 'http://127.0.0.1:7979/sparql',
      },
    });
    expect(plan.sourceCss.args).toEqual([
      'bin/server.js',
      '-c',
      'config/cms/cms-file.json',
      '--baseUrl',
      'http://127.0.0.1:4910/',
      '-p',
      '4910',
      '--rootFilePath',
      '.data/cms-migration/source',
      '--cmsControlToken',
      '<redacted>',
    ]);
    expect(plan.targetCss.args).toEqual([
      'bin/server.js',
      '-c',
      'config/cms/cms-sparql.json',
      '--baseUrl',
      'http://127.0.0.1:4911/',
      '-p',
      '4911',
      '--rootFilePath',
      '.data/cms-migration/target',
      '--cmsControlToken',
      '<redacted>',
      '--sparqlEndpoint',
      'http://127.0.0.1:7979/sparql',
    ]);
    expect(plan.liveSteps).toEqual(expect.arrayContaining([
      'export portable CMS works from the file-backed CSS profile',
      'import the same works into the Oxigraph/SPARQL-backed CSS profile',
      'read target works and public Type Index resources through standard Solid routes',
    ]));
  });

  it('builds a split endpoint plan for an existing Oxigraph-backed CSS target.', (): void => {
    const plan = dryRunPlan([
      '--mode=split',
      '--source-base-url=http://localhost:5010/',
      '--target-base-url=http://localhost:5011',
      '--query-endpoint=http://localhost:7878/query',
      '--update-endpoint=http://localhost:7878/update',
    ]);

    expect(plan).toMatchObject({
      mode: 'split',
      queryProbeEndpoint: 'http://localhost:7878/query',
      sourceCss: {
        launch: false,
        baseUrl: 'http://localhost:5010/',
      },
      targetCss: {
        launch: false,
        baseUrl: 'http://localhost:5011/',
        profile: 'config/cms/cms-oxigraph.json',
      },
      oxigraphEndpoints: {
        query: 'http://localhost:7878/query',
        update: 'http://localhost:7878/update',
      },
    });
    expect(plan.targetCss.args).toEqual([
      'bin/server.js',
      '-c',
      'config/cms/cms-oxigraph.json',
      '--baseUrl',
      'http://localhost:5011/',
      '-p',
      '5011',
      '--rootFilePath',
      '.data/cms-migration/target',
      '--cmsControlToken',
      '<redacted>',
      '--sparqlEndpoint',
      'http://localhost:7878/query',
      '--sparqlUpdateEndpoint',
      'http://localhost:7878/update',
    ]);
  });

  it('skips gracefully when optional mode has no live CSS or Oxigraph path.', (): void => {
    const output = execFileSync(process.execPath, [
      runner,
      '--skip-when-unavailable',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: endpointFreeEnv(),
    });

    expect(output).toContain('Skipping live CMS migration proof');
    expect(output).toContain('No file-backed CMS source endpoint');
  });

  it('keeps configured endpoint variables out of the skip path.', (): void => {
    const plan = dryRunPlan([
      '--skip-when-unavailable',
      '--source-base-url=http://localhost:5110/',
      '--target-base-url=http://localhost:5111/',
    ], {
      DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT: 'http://localhost:7878/sparql',
    });

    expect(plan.skipReason).toBeUndefined();
    expect(plan.queryProbeEndpoint).toBe('http://localhost:7878/sparql');
  });
});

function dryRunPlan(args: string[], envOverrides: NodeJS.ProcessEnv = {}): any {
  const output = execFileSync(process.execPath, [
    runner,
    ...args,
    '--dry-run',
    '--format=json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...endpointFreeEnv(),
      ...envOverrides,
    },
  });

  return JSON.parse(output);
}

function endpointFreeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT;
  delete env.DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT;
  delete env.DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT;
  delete env.CSS_SPARQL_ENDPOINT;
  delete env.CSS_SPARQL_UPDATE_ENDPOINT;
  delete env.DATABOX_CMS_OXIGRAPH_SKIP_UNAVAILABLE;
  delete env.DATABOX_CMS_MIGRATION_SKIP_UNAVAILABLE;
  delete env.CSS_CMS_CONTROL_TOKEN;
  return env;
}
