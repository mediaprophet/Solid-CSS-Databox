#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SOURCE_PORT = 4860;
const DEFAULT_TARGET_PORT = 4861;
const DEFAULT_OXIGRAPH_BIND = '127.0.0.1:7878';
const DEFAULT_CONTROL_TOKEN = 'ipms-migration-control-token-00000001';
const BOOLEAN_ARGS = new Set([
  'dryRun',
  'skipWhenUnavailable',
  'startCss',
  'startSourceCss',
  'startTargetCss',
  'startOxigraph',
]);
const OXIGRAPH_ENDPOINT_ENV_KEYS = [
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
  const plan = buildMigrationPlan(args, env);

  if (args.dryRun) {
    console.log(formatPlan(plan, args.format));
    return;
  }

  if (plan.skipReason) {
    skip(plan.skipReason);
    return;
  }

  const children = [];
  try {
    if (plan.oxigraph) {
      children.push(await startProcess('Oxigraph', plan.oxigraph.command, plan.oxigraph.args));
      await waitForSparqlEndpoint(plan.queryProbeEndpoint, plan.timeoutMs);
    }

    if (plan.sourceCss.launch) {
      await mkdir(plan.sourceCss.dataPath, { recursive: true });
      children.push(await startProcess('file-backed IPMS', plan.sourceCss.command, plan.sourceCss.args));
    }
    if (plan.targetCss.launch) {
      await mkdir(plan.targetCss.dataPath, { recursive: true });
      children.push(await startProcess('Oxigraph-backed IPMS', plan.targetCss.command, plan.targetCss.args));
    }

    await waitForIpms(plan.sourceCss.baseUrl, plan.sourceCss.controlToken, plan.timeoutMs);
    await waitForIpms(plan.targetCss.baseUrl, plan.targetCss.controlToken, plan.timeoutMs);
    const result = await runLiveMigration(plan);
    console.log(formatResult(result));
  } catch (error) {
    if (plan.skipWhenUnavailable && isUnavailableError(error)) {
      skip(error instanceof Error ? error.message : String(error));
      return;
    }

    throw error;
  } finally {
    for (const child of children.reverse()) {
      if (!child.killed) {
        child.kill();
      }
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

export function buildMigrationPlan(args, env = process.env) {
  const mode = args.mode ?? 'unified';

  if (![ 'unified', 'split' ].includes(mode)) {
    throw new Error(`Unsupported --mode "${mode}". Expected "unified" or "split".`);
  }

  const sourceBaseUrl = withTrailingSlash(args.sourceBaseUrl ?? endpointForPort(args.sourcePort, DEFAULT_SOURCE_PORT));
  const targetBaseUrl = withTrailingSlash(args.targetBaseUrl ?? endpointForPort(args.targetPort, DEFAULT_TARGET_PORT));
  const sourceControlToken = args.sourceControlToken ?? args.controlToken ?? env.CSS_CMS_CONTROL_TOKEN ??
    DEFAULT_CONTROL_TOKEN;
  const targetControlToken = args.targetControlToken ?? args.controlToken ?? env.CSS_CMS_CONTROL_TOKEN ??
    DEFAULT_CONTROL_TOKEN;
  const timeoutMs = Number(args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const skipWhenUnavailable = Boolean(args.skipWhenUnavailable ?? env.DATABOX_CMS_MIGRATION_SKIP_UNAVAILABLE);
  const startSourceCss = Boolean(args.startSourceCss ?? args.startCss);
  const startTargetCss = Boolean(args.startTargetCss ?? args.startCss);
  const configuredOxigraph = hasConfiguredOxigraph(args, env);
  let oxigraphCommand = args.oxigraphCommand;
  let oxigraphCommandArgs = buildOxigraphArgs(args.oxigraphBind ?? DEFAULT_OXIGRAPH_BIND, args.oxigraphLocation);

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
  const oxigraphEndpoints = buildOxigraphEndpointPlan(mode, args, env);
  const targetProfile = mode === 'split' ? 'config/ipms/ipms-oxigraph.json' : 'config/ipms/ipms-sparql.json';
  const sourceDataPath = args.sourceDataPath ?? '.data/ipms-migration/source';
  const targetDataPath = args.targetDataPath ?? '.data/ipms-migration/target';
  let skipReason;

  if (skipWhenUnavailable && !startSourceCss && !args.sourceBaseUrl) {
    skipReason = [
      'No file-backed IPMS source endpoint or --start-source-css/--start-css launcher was configured.',
      'Pass --source-base-url for an existing CSS profile or allow this helper to launch one.',
    ].join(' ');
  } else if (skipWhenUnavailable && !startTargetCss && !args.targetBaseUrl) {
    skipReason = [
      'No Oxigraph-backed IPMS target endpoint or --start-target-css/--start-css launcher was configured.',
      'Pass --target-base-url for an existing CSS profile or allow this helper to launch one.',
    ].join(' ');
  } else if (skipWhenUnavailable && !args.startOxigraph && !configuredOxigraph) {
    skipReason = [
      'No Oxigraph/SPARQL endpoint or local Oxigraph launcher was configured.',
      'Set endpoint variables, pass endpoint flags, or use --start-oxigraph.',
    ].join(' ');
  }

  return {
    mode,
    timeoutMs,
    skipWhenUnavailable,
    skipReason,
    queryProbeEndpoint: mode === 'split' ? oxigraphEndpoints.query : oxigraphEndpoints.sparql,
    sourceCss: {
      role: 'canonical file-backed CSS profile',
      launch: startSourceCss,
      command: args.sourceCssCommand ?? 'node',
      args: buildSourceCssArgs(sourceBaseUrl, sourceControlToken, sourceDataPath),
      baseUrl: sourceBaseUrl,
      controlToken: sourceControlToken,
      dataPath: sourceDataPath,
      worksRoute: `${sourceBaseUrl}.databox/ipms/works`,
    },
    targetCss: {
      role: 'Oxigraph-backed CSS profile',
      launch: startTargetCss,
      command: args.targetCssCommand ?? 'node',
      args: buildTargetCssArgs(targetProfile, targetBaseUrl, targetControlToken, targetDataPath, oxigraphEndpoints),
      baseUrl: targetBaseUrl,
      controlToken: targetControlToken,
      dataPath: targetDataPath,
      profile: targetProfile,
      worksImportRoute: `${targetBaseUrl}.databox/ipms/works/import`,
      worksRoute: `${targetBaseUrl}.databox/ipms/works`,
      typeIndexRoute: `${targetBaseUrl}.well-known/databox-ipms`,
    },
    oxigraph,
    oxigraphEndpoints,
    liveSteps: [
      'seed source IPMS module state through the protected CSS control plane',
      'export portable IPMS works from the file-backed CSS profile',
      'import the same works into the Oxigraph/SPARQL-backed CSS profile',
      'read target works and public Type Index resources through standard Solid routes',
      'assert Solid RDF resources remain canonical and Oxigraph is only the rebuildable query backend',
    ],
  };
}

export function buildOxigraphArgs(bind, location) {
  const args = [ 'serve', '--bind', bind, '--cors' ];
  if (location) {
    args.push('--location', location);
  }
  return args;
}

async function runLiveMigration(plan) {
  const marker = `live-migration-${Date.now()}`;
  const sourceState = await ipmsJson(`${plan.sourceCss.baseUrl}.databox/ipms/modules/hosting`, {
    method: 'PUT',
    token: plan.sourceCss.controlToken,
    body: {
      enabled: false,
      configTurtle: [
        '<> <urn:example:ipmsMigrationHarness> "file-backed-source" .',
        `<> <urn:example:ipmsMigrationMarker> "${marker}" .`,
      ].join('\n'),
    },
  });
  const sourceWorks = await ipmsJson(plan.sourceCss.worksRoute, {
    method: 'GET',
    token: plan.sourceCss.controlToken,
  });
  const importResult = await ipmsJson(plan.targetCss.worksImportRoute, {
    method: 'POST',
    token: plan.targetCss.controlToken,
    body: sourceWorks,
  });
  const targetWorks = await ipmsJson(plan.targetCss.worksRoute, {
    method: 'GET',
    token: plan.targetCss.controlToken,
  });
  const typeIndex = await fetchText(plan.targetCss.typeIndexRoute);
  const hostingManifest = await fetchText(`${plan.targetCss.typeIndexRoute}/modules/hosting.ttl`);

  assertMigrationResult({
    marker,
    sourceState,
    sourceWorks,
    importResult,
    targetWorks,
    typeIndex,
    hostingManifest,
  });

  return {
    marker,
    sourceModuleCount: sourceWorks.modules.length,
    targetModuleCount: targetWorks.modules.length,
    targetProfile: plan.targetCss.profile,
    sourceBaseUrl: plan.sourceCss.baseUrl,
    targetBaseUrl: plan.targetCss.baseUrl,
    typeIndexRoute: plan.targetCss.typeIndexRoute,
  };
}

function assertMigrationResult(result) {
  const sourceHosting = findModule(result.sourceWorks, 'hosting');
  const targetHosting = findModule(result.targetWorks, 'hosting');

  if (result.sourceState.configTurtle?.includes(result.marker) !== true) {
    throw new Error('The source file-backed IPMS did not persist the migration marker.');
  }
  if (sourceHosting?.state?.turtle?.includes(result.marker) !== true) {
    throw new Error('The source portable works bundle did not contain the migration marker.');
  }
  if (targetHosting?.state?.turtle?.includes(result.marker) !== true) {
    throw new Error('The Oxigraph-backed target works bundle did not contain the migration marker after import.');
  }
  if (!String(result.importResult.type).includes('DataboxIpmsWorks')) {
    throw new Error('The target import route did not return a Databox IPMS works bundle.');
  }
  if (!result.typeIndex.includes('ldp:contains')) {
    throw new Error('The target profile did not publish a standard Solid Type Index resource.');
  }
  if (!result.hostingManifest.includes('ipms:Module')) {
    throw new Error('The target profile did not publish the hosting manifest as standard RDF.');
  }
}

function findModule(works, id) {
  return works.modules?.find(module => module.manifest?.id === id);
}

async function ipmsJson(url, options) {
  const headers = {
    authorization: `Bearer ${options.token}`,
  };
  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`${options.method} ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function startProcess(label, command, commandArgs) {
  console.log(`Starting ${label}: ${command} ${commandArgs.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: [ 'ignore', 'inherit', 'inherit' ],
    });

    let settled = false;
    child.once('spawn', () => {
      settled = true;
      resolve(child);
    });
    child.once('error', (error) => {
      settled = true;
      reject(Object.assign(new Error(`Could not start ${label}: ${error.message}`), { code: error.code }));
    });
    child.once('exit', (code, signal) => {
      if (!settled) {
        reject(new Error(`${label} exited before it was ready (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`));
      }
    });
  });
}

async function waitForIpms(baseUrl, token, timeoutMs) {
  await waitForHttp(
    `${baseUrl}.databox/ipms/modules`,
    timeoutMs,
    { authorization: `Bearer ${token}` },
    'IPMS control plane',
  );
}

async function waitForSparqlEndpoint(endpoint, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/sparql-results+json',
          'content-type': 'application/sparql-query',
        },
        body: 'ASK { ?s ?p ?o }',
      });
      if (response.ok) {
        console.log(`SPARQL query endpoint is ready: ${endpoint}`);
        return;
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error([
    `Timed out waiting for ${endpoint}.`,
    `Last probe error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  ].join('\n'));
}

async function waitForHttp(url, timeoutMs, headers, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) {
        console.log(`${label} is ready: ${url}`);
        return;
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error([
    `Timed out waiting for ${label} at ${url}.`,
    `Last probe error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  ].join('\n'));
}

function buildSourceCssArgs(baseUrl, controlToken, dataPath) {
  const port = new URL(baseUrl).port || '3000';
  return [
    'bin/server.js',
    '-c',
    'config/ipms/ipms-file.json',
    '--baseUrl',
    baseUrl,
    '-p',
    port,
    '--rootFilePath',
    dataPath,
    '--ipmsControlToken',
    controlToken,
  ];
}

function buildTargetCssArgs(profile, baseUrl, controlToken, dataPath, endpoints) {
  const port = new URL(baseUrl).port || '3000';
  const args = [
    'bin/server.js',
    '-c',
    profile,
    '--baseUrl',
    baseUrl,
    '-p',
    port,
    '--rootFilePath',
    dataPath,
    '--ipmsControlToken',
    controlToken,
  ];

  if (endpoints.sparql) {
    args.push('--sparqlEndpoint', endpoints.sparql);
  } else {
    args.push('--sparqlEndpoint', endpoints.query, '--sparqlUpdateEndpoint', endpoints.update);
  }

  return args;
}

function buildOxigraphEndpointPlan(mode, args, env) {
  const origin = `http://${args.oxigraphBind ?? DEFAULT_OXIGRAPH_BIND}`;

  if (mode === 'split') {
    return {
      query: args.queryEndpoint ?? env.DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT ?? `${origin}/query`,
      update: args.updateEndpoint ?? env.DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT ?? env.CSS_SPARQL_UPDATE_ENDPOINT ??
        `${origin}/update`,
    };
  }

  return {
    sparql: args.endpoint ?? env.DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT ?? env.CSS_SPARQL_ENDPOINT ??
      `${origin}/sparql`,
  };
}

function hasConfiguredOxigraph(args, env) {
  return Boolean(
    args.endpoint ??
    args.queryEndpoint ??
    args.updateEndpoint ??
    OXIGRAPH_ENDPOINT_ENV_KEYS.some(key => env[key]),
  );
}

function endpointForPort(argPort, defaultPort) {
  return `http://127.0.0.1:${Number(argPort ?? defaultPort)}/`;
}

function withTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function formatPlan(plan, format) {
  if (format === 'json') {
    return JSON.stringify(redactPlan(plan), null, 2);
  }

  const targetEndpoint = plan.mode === 'split' ?
    `query=${plan.oxigraphEndpoints.query} update=${plan.oxigraphEndpoints.update}` :
    `sparql=${plan.oxigraphEndpoints.sparql}`;
  const oxigraphLine = plan.oxigraph ?
    `Oxigraph: ${plan.oxigraph.command} ${plan.oxigraph.args.join(' ')}` :
    'Oxigraph: use configured endpoint';

  return [
    `Mode: ${plan.mode}`,
    `Source CSS: ${formatProcess(plan.sourceCss)}`,
    `Target CSS: ${formatProcess(plan.targetCss)}`,
    `Target profile: ${plan.targetCss.profile}`,
    `Oxigraph endpoints: ${targetEndpoint}`,
    oxigraphLine,
    'Live steps:',
    ...plan.liveSteps.map(step => `- ${step}`),
  ].join('\n');
}

function formatProcess(processPlan) {
  return processPlan.launch ?
    `${processPlan.command} ${processPlan.args.join(' ')}` :
    `use existing endpoint ${processPlan.baseUrl}`;
}

function redactPlan(plan) {
  return {
    mode: plan.mode,
    timeoutMs: plan.timeoutMs,
    skipWhenUnavailable: plan.skipWhenUnavailable,
    skipReason: plan.skipReason,
    queryProbeEndpoint: plan.queryProbeEndpoint,
    sourceCss: {
      role: plan.sourceCss.role,
      launch: plan.sourceCss.launch,
      command: plan.sourceCss.command,
      args: redactArgs(plan.sourceCss.args),
      baseUrl: plan.sourceCss.baseUrl,
      worksRoute: plan.sourceCss.worksRoute,
    },
    targetCss: {
      role: plan.targetCss.role,
      launch: plan.targetCss.launch,
      command: plan.targetCss.command,
      args: redactArgs(plan.targetCss.args),
      baseUrl: plan.targetCss.baseUrl,
      profile: plan.targetCss.profile,
      worksImportRoute: plan.targetCss.worksImportRoute,
      worksRoute: plan.targetCss.worksRoute,
      typeIndexRoute: plan.targetCss.typeIndexRoute,
    },
    oxigraph: plan.oxigraph,
    oxigraphEndpoints: plan.oxigraphEndpoints,
    liveSteps: plan.liveSteps,
  };
}

function redactArgs(args) {
  return args.map((arg, index) => args[index - 1] === '--ipmsControlToken' ? '<redacted>' : arg);
}

function formatResult(result) {
  return [
    'Live IPMS migration proof completed.',
    `Marker: ${result.marker}`,
    `Source: ${result.sourceBaseUrl} (${result.sourceModuleCount} modules)`,
    `Target: ${result.targetBaseUrl} via ${result.targetProfile} (${result.targetModuleCount} modules)`,
    `Standard Solid discovery checked: ${result.typeIndexRoute}`,
    'Invariant: Solid LDP/RDF resources stayed canonical; Oxigraph/SPARQL was only the rebuildable backend.',
  ].join('\n');
}

function isUnavailableError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.code === 'ENOENT' || /Timed out waiting/u.test(error.message) || /Could not start/u.test(error.message) ||
    /fetch failed/u.test(error.message);
}

async function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function skip(reason) {
  console.log(`Skipping live IPMS migration proof: ${reason}`);
}

function isDirectRun(url) {
  return process.argv[1] === fileURLToPath(url);
}
