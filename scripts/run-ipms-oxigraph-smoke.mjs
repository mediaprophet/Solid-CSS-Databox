#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_BIND = '127.0.0.1:7878';
const DEFAULT_TIMEOUT_MS = 20_000;
const BOOLEAN_ARGS = new Set([
  'dryRun',
  'skipWhenUnavailable',
  'startOxigraph',
]);
const ENDPOINT_ENV_KEYS = [
  'DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT',
  'DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT',
  'DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT',
  'CSS_SPARQL_ENDPOINT',
  'CSS_SPARQL_UPDATE_ENDPOINT',
];

if (isDirectRun(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export async function main(rawArgs, env = process.env) {
  const args = parseArgs(rawArgs);
  const plan = buildSmokePlan(args, env);

  if (args.dryRun) {
    console.log(formatPlan(plan, args.format));
    return;
  }

  if (plan.skipReason) {
    skip(plan.skipReason);
    return;
  }

  let oxigraph;
  try {
    if (plan.oxigraph) {
      oxigraph = await startOxigraph(plan.oxigraph.command, plan.oxigraph.args);
    }

    await waitForQueryEndpoint(plan.queryProbeEndpoint, plan.timeoutMs);
    await runJest(plan.mode, plan.endpoints);
  } catch (error) {
    if (plan.skipWhenUnavailable && isUnavailableError(error)) {
      skip(error instanceof Error ? error.message : String(error));
      return;
    }

    throw error;
  } finally {
    if (oxigraph && !oxigraph.killed) {
      oxigraph.kill();
    }
  }
}

export function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === '--' || !arg.startsWith('--')) {
      continue;
    }

    const [ rawName, inlineValue ] = arg.slice(2).split('=', 2);
    const name = rawName.replaceAll(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    const next = rawArgs[index + 1];

    if (inlineValue !== undefined) {
      parsed[name] = inlineValue;
    } else if (BOOLEAN_ARGS.has(name)) {
      parsed[name] = true;
    } else if (next && !next.startsWith('--')) {
      parsed[name] = next;
      index += 1;
    } else {
      parsed[name] = true;
    }
  }

  return parsed;
}

export function buildSmokePlan(args, env = process.env) {
  const mode = args.mode ?? 'unified';

  if (![ 'unified', 'split' ].includes(mode)) {
    throw new Error(`Unsupported --mode "${mode}". Expected "unified" or "split".`);
  }

  const bind = args.bind ?? DEFAULT_BIND;
  const origin = `http://${bind}`;
  const configuredEndpoint = hasConfiguredEndpoint(args, env);
  const timeoutMs = Number(args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const skipWhenUnavailable = Boolean(args.skipWhenUnavailable ?? env.DATABOX_CMS_OXIGRAPH_SKIP_UNAVAILABLE);
  let endpoints;

  if (mode === 'split') {
    endpoints = {
      query: args.queryEndpoint ?? env.DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT ?? `${origin}/query`,
      update: args.updateEndpoint ?? env.DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT ?? env.CSS_SPARQL_UPDATE_ENDPOINT ??
        `${origin}/update`,
    };
  } else {
    endpoints = {
      sparql: args.endpoint ?? env.DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT ?? env.CSS_SPARQL_ENDPOINT ??
        `${origin}/sparql`,
    };
  }

  let oxigraphCommand = args.oxigraphCommand;
  let oxigraphCommandArgs = buildOxigraphArgs(bind, args.location);

  if (args.startOxigraph && !oxigraphCommand) {
    oxigraphCommand = process.execPath;
    oxigraphCommandArgs = [
      fileURLToPath(new URL('oxigraph-wasm-server.mjs', import.meta.url)),
      ...oxigraphCommandArgs,
    ];
  }

  const oxigraph = args.startOxigraph ?
      {
        command: oxigraphCommand,
        args: oxigraphCommandArgs,
      } :
    undefined;
  let skipReason;
  if (skipWhenUnavailable && !args.startOxigraph && !configuredEndpoint) {
    skipReason = [
      'No Oxigraph endpoint or local Oxigraph launcher was configured.',
      'Set an endpoint, pass --start-oxigraph, or omit --skip-when-unavailable to require the live smoke.',
    ].join(' ');
  }

  return {
    mode,
    endpoints,
    queryProbeEndpoint: mode === 'split' ? endpoints.query : endpoints.sparql,
    timeoutMs,
    skipWhenUnavailable,
    skipReason,
    oxigraph,
    jest: buildJestPlan(mode, endpoints, env),
  };
}

export function buildOxigraphArgs(bind, location) {
  const oxigraphArgs = [ 'serve', '--bind', bind, '--cors' ];
  if (location) {
    oxigraphArgs.push('--location', location);
  }
  return oxigraphArgs;
}

export function buildJestPlan(mode, endpoints, sourceEnv = process.env) {
  const env = cleanEndpointEnv(sourceEnv);

  if (mode === 'split') {
    env.DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT = endpoints.query;
    env.DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT = endpoints.update;
  } else {
    env.DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT = endpoints.sparql;
  }

  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: [
      'jest',
      'test/integration/DataboxIpmsOxigraph.test.ts',
      '--runInBand',
      '--coverage=false',
    ],
    env,
  };
}

async function startOxigraph(command, oxigraphArgs) {
  console.log(`Starting Oxigraph: ${command} ${oxigraphArgs.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, oxigraphArgs, {
      stdio: [ 'ignore', 'inherit', 'inherit' ],
    });

    let settled = false;
    child.once('spawn', () => {
      settled = true;
      resolve(child);
    });
    child.once('error', (error) => {
      settled = true;
      reject(Object.assign(new Error([
        `Could not start Oxigraph: ${error.message}`,
        'Install it with `cargo install oxigraph-cli`, point the helper at a running container endpoint,',
        'or use --skip-when-unavailable for optional local checks.',
      ].join('\n')), { code: error.code }));
    });
    child.once('exit', (code, signal) => {
      if (!settled) {
        reject(new Error(`Oxigraph exited before it was ready (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`));
      }
    });
  });
}

async function waitForQueryEndpoint(endpoint, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      await probeQuery(endpoint);
      console.log(`Oxigraph query endpoint is ready: ${endpoint}`);
      return;
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }

  throw new Error([
    `Timed out waiting for ${endpoint}.`,
    `Last probe error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    'Start Oxigraph locally or pass --start-oxigraph to let this helper launch it.',
  ].join('\n'));
}

async function probeQuery(endpoint) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/sparql-results+json',
      'content-type': 'application/sparql-query',
    },
    body: 'ASK { ?s ?p ?o }',
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

async function runJest(mode, endpoints) {
  const plan = buildJestPlan(mode, endpoints);

  if (mode === 'split') {
    console.log(`Running live IPMS smoke in split mode: query=${endpoints.query}, update=${endpoints.update}`);
  } else {
    console.log(`Running live IPMS smoke in unified mode: sparql=${endpoints.sparql}`);
  }

  await spawnAndWait(plan.command, plan.args, plan.env);
}

async function spawnAndWait(command, commandArgs, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`));
      }
    });
  });
}

async function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cleanEndpointEnv(env) {
  const cleaned = { ...env };
  for (const key of ENDPOINT_ENV_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
}

function hasConfiguredEndpoint(args, env) {
  return Boolean(
    args.endpoint ??
    args.queryEndpoint ??
    args.updateEndpoint ??
    ENDPOINT_ENV_KEYS.some(key => env[key]),
  );
}

function formatPlan(plan, format) {
  if (format === 'json') {
    return JSON.stringify(redactPlan(plan), null, 2);
  }

  const endpointLine = plan.mode === 'split' ?
    `query=${plan.endpoints.query} update=${plan.endpoints.update}` :
    `sparql=${plan.endpoints.sparql}`;
  const oxigraphLine = plan.oxigraph ?
    `Oxigraph: ${plan.oxigraph.command} ${plan.oxigraph.args.join(' ')}` :
    'Oxigraph: use existing endpoint';

  return [
    `Mode: ${plan.mode}`,
    `Endpoints: ${endpointLine}`,
    oxigraphLine,
    `Jest: ${plan.jest.command} ${plan.jest.args.join(' ')}`,
  ].join('\n');
}

function redactPlan(plan) {
  const jestEnv = {};
  for (const key of ENDPOINT_ENV_KEYS) {
    if (plan.jest.env[key]) {
      jestEnv[key] = plan.jest.env[key];
    }
  }

  return {
    mode: plan.mode,
    endpoints: plan.endpoints,
    queryProbeEndpoint: plan.queryProbeEndpoint,
    skipWhenUnavailable: plan.skipWhenUnavailable,
    skipReason: plan.skipReason,
    oxigraph: plan.oxigraph,
    jest: {
      command: plan.jest.command,
      args: plan.jest.args,
      env: jestEnv,
    },
  };
}

function isUnavailableError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.code === 'ENOENT' || /Timed out waiting for/u.test(error.message) ||
    /Could not start Oxigraph/u.test(error.message);
}

function skip(reason) {
  console.log(`Skipping live IPMS Oxigraph smoke: ${reason}`);
}

function isDirectRun(url) {
  return process.argv[1] === fileURLToPath(url);
}
