import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const runner = join(root, 'scripts', 'run-cms-oxigraph-smoke.mjs');

describe('CMS Oxigraph smoke runner', (): void => {
  it('builds the unified endpoint Jest invocation without requiring Oxigraph.', (): void => {
    const plan = dryRunPlan([
      '--mode=unified',
      '--endpoint=http://localhost:7878/sparql',
    ]);

    expect(plan).toMatchObject({
      mode: 'unified',
      endpoints: {
        sparql: 'http://localhost:7878/sparql',
      },
      queryProbeEndpoint: 'http://localhost:7878/sparql',
      jest: {
        args: [
          'jest',
          'test/integration/DataboxCmsOxigraph.test.ts',
          '--runInBand',
          '--coverage=false',
        ],
        env: {
          DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT: 'http://localhost:7878/sparql',
        },
      },
    });
    expect(plan.jest.env).not.toHaveProperty('DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT');
    expect(plan.jest.env).not.toHaveProperty('DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT');
  });

  it('builds the split query/update Jest invocation without requiring Oxigraph.', (): void => {
    const plan = dryRunPlan([
      '--mode=split',
      '--query-endpoint=http://localhost:7878/query',
      '--update-endpoint=http://localhost:7878/update',
    ]);

    expect(plan).toMatchObject({
      mode: 'split',
      endpoints: {
        query: 'http://localhost:7878/query',
        update: 'http://localhost:7878/update',
      },
      queryProbeEndpoint: 'http://localhost:7878/query',
      jest: {
        env: {
          DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT: 'http://localhost:7878/query',
          DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT: 'http://localhost:7878/update',
        },
      },
    });
    expect(plan.jest.env).not.toHaveProperty('DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT');
  });

  it('skips gracefully when optional mode has no configured endpoint or launcher.', (): void => {
    const output = execFileSync('node', [
      runner,
      '--skip-when-unavailable',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: endpointFreeEnv(),
    });

    expect(output).toContain('Skipping live CMS Oxigraph smoke');
    expect(output).toContain('No Oxigraph endpoint or local Oxigraph launcher was configured');
  });

  it('skips gracefully when the optional local Oxigraph binary is unavailable.', (): void => {
    const output = execFileSync('node', [
      runner,
      '--start-oxigraph',
      '--skip-when-unavailable',
      '--oxigraph-command=cms-oxigraph-binary-that-does-not-exist',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: endpointFreeEnv(),
    });

    expect(output).toContain('Skipping live CMS Oxigraph smoke');
    expect(output).toContain('Could not start Oxigraph');
  });
});

function dryRunPlan(args: string[]): any {
  const output = execFileSync('node', [
    runner,
    ...args,
    '--dry-run',
    '--format=json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: endpointFreeEnv(),
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
  return env;
}
