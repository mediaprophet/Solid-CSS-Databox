#!/usr/bin/env node
/* eslint-disable no-template-curly-in-string -- CLI validator: console output and template literal checks are intended. */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredTemplateFiles = [
  'config/ipms/ipms-file.json',
  'databox/deployment/ipms/docker-compose.ipms.yml',
  'databox/deployment/ipms/.env.example',
  'databox/deployment/ipms/README.md',
  'databox/deployment/ipms/kubernetes/configmap.yaml',
  'databox/deployment/ipms/kubernetes/deployment.yaml',
  'databox/deployment/ipms/kubernetes/secret.example.yaml',
  'databox/deployment/ipms/kubernetes/pvc.yaml',
  'databox/deployment/ipms/kubernetes/service.yaml',
  'databox/deployment/ipms/kubernetes/ingress.yaml',
  'databox/deployment/ipms/kubernetes/kustomization.yaml',
];

const args = parseArgs(process.argv.slice(2));

try {
  validateTemplates();
  if (args.envFile) {
    validateEnvFile(resolve(process.cwd(), args.envFile));
  }
  console.log('IPMS deployment validation passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function validateTemplates() {
  const missing = requiredTemplateFiles.filter(file => !existsSync(join(root, file)));
  assert(missing.length === 0, `Missing deployment template files:\n${missing.join('\n')}`);

  const ipmsFile = readRootFile('config/ipms/ipms-file.json');
  assert(ipmsFile.includes('css:config/file.json'), 'config/ipms/ipms-file.json must extend the persistent file profile.');
  assert(ipmsFile.includes('css:config/ipms/ipms-handler.json'), 'config/ipms/ipms-file.json must opt into the IPMS handler.');
  assert(!ipmsFile.includes('css:config/storage/backend/memory.json'), 'IPMS deployment profile must not use memory storage.');

  const compose = readRootFile('databox/deployment/ipms/docker-compose.ipms.yml');
  requireContains(compose, 'profiles:', 'Compose file must define an opt-in profile.');
  requireContains(compose, '- ipms', 'Compose file must use the ipms profile.');
  requireContains(compose, 'CSS_BASE_URL: ${CSS_BASE_URL:?', 'Compose file must require CSS_BASE_URL.');
  requireContains(compose, 'CSS_CONFIG: ${CSS_CONFIG:-config/ipms/ipms-file.json}', 'Compose file must default to ipms-file config.');
  requireContains(compose, 'CSS_ROOT_FILE_PATH: /data', 'Compose file must store Solid data under /data.');
  requireContains(compose, 'ipms-data:/data', 'Compose file must mount persistent data.');
  requireContains(compose, 'file: ${CMS_CONTROL_TOKEN_FILE:?', 'Compose file must require a token secret file.');
  requireContains(compose, '/run/secrets/cms_control_token', 'Compose entrypoint must read the Docker secret file.');
  requireContains(compose, 'CSS_CMS_CONTROL_TOKEN', 'Compose entrypoint must pass the token through environment at runtime.');
  rejectSecretLikeValues(compose, 'docker-compose.ipms.yml');

  const envExample = readRootFile('databox/deployment/ipms/.env.example');
  requireContains(envExample, 'CSS_BASE_URL=https://databox.example.org/', '.env.example must document CSS_BASE_URL.');
  requireContains(envExample, 'CMS_CONTROL_TOKEN_FILE=./secrets/cms_control_token.txt', '.env.example must point at a local secret file.');

  const docs = [
    readRootFile('databox/deployment/ipms/README.md'),
    readRootFile('databox/deployment/ipms/kubernetes/README.md'),
  ].join('\n');
  requireContains(docs, 'opt-in', 'Deployment docs must state the IPMS profile is opt-in.');
  requireContains(docs, 'direct-TLS', 'Deployment docs must make the direct-TLS caveat explicit.');
  requireContains(docs, 'client certificate', 'Deployment docs must explain the client certificate caveat.');

  const k8sConfig = readRootFile('databox/deployment/ipms/kubernetes/configmap.yaml');
  requireMatches(
    k8sConfig,
    /^ {2}CSS_CONFIG:\s*['"]?config\/ipms\/ipms-file\.json['"]?\s*$/mu,
    'Kubernetes ConfigMap must use ipms-file config.',
  );
  requireMatches(
    k8sConfig,
    /^ {2}CSS_ROOT_FILE_PATH:\s*['"]?\/data['"]?\s*$/mu,
    'Kubernetes ConfigMap must persist under /data.',
  );

  const k8sDeployment = readRootFile('databox/deployment/ipms/kubernetes/deployment.yaml');
  requireContains(k8sDeployment, 'replicas: 1', 'Kubernetes skeleton must be single-replica by default.');
  requireContains(k8sDeployment, 'claimName: databox-ipms-data', 'Kubernetes Deployment must mount the PVC.');
  requireContains(k8sDeployment, 'secretName: ipms-control-token', 'Kubernetes Deployment must mount the token Secret.');
  requireContains(k8sDeployment, 'CSS_CMS_CONTROL_TOKEN', 'Kubernetes entrypoint must pass the token at runtime.');
  requireContains(k8sDeployment, '/run/secrets/cms_control_token', 'Kubernetes entrypoint must read the mounted secret file.');
  requireContains(k8sDeployment, 'direct TLS', 'Kubernetes annotations must call out the device direct-TLS caveat.');
  rejectSecretLikeValues(k8sDeployment, 'kubernetes/deployment.yaml');

  const k8sSecret = readRootFile('databox/deployment/ipms/kubernetes/secret.example.yaml');
  requireContains(k8sSecret, 'replace-with-a-random-32-plus-byte-token', 'Kubernetes Secret example must use a placeholder.');
}

function validateEnvFile(envFile) {
  assert(existsSync(envFile), `Env file does not exist: ${envFile}`);
  const env = parseEnv(readFileSync(envFile, 'utf8'));
  const baseUrl = requiredEnv(env, 'CSS_BASE_URL', envFile);
  const parsedUrl = parseHttpsUrl(baseUrl, 'CSS_BASE_URL');
  assert(
    parsedUrl.hostname !== 'databox.example.org' && !parsedUrl.hostname.endsWith('.example.org'),
    'CSS_BASE_URL must be changed from the example host before deployment.',
  );

  const config = env.CSS_CONFIG ?? 'config/ipms/ipms-file.json';
  assert(config === 'config/ipms/ipms-file.json', `CSS_CONFIG must be config/ipms/ipms-file.json, received ${config}.`);

  const secretFile = requiredEnv(env, 'CMS_CONTROL_TOKEN_FILE', envFile);
  const secretPath = resolve(dirname(envFile), secretFile);
  assert(existsSync(secretPath), `CMS_CONTROL_TOKEN_FILE does not exist: ${secretPath}`);
  assert(statSync(secretPath).isFile(), `CMS_CONTROL_TOKEN_FILE must be a file: ${secretPath}`);
  const token = readFileSync(secretPath, 'utf8').trim();
  assert(token.length >= 32, 'IPMS control token must be at least 32 bytes.');
  assert(!/replace|example|changeme|change-me/iu.test(token), 'IPMS control token still looks like a placeholder.');
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [ rawName, inlineValue ] = arg.slice(2).split('=', 2);
    const name = rawName.replaceAll(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    if (inlineValue === undefined) {
      const next = rawArgs[index + 1];
      assert(next && !next.startsWith('--'), `Missing value for --${rawName}.`);
      parsed[name] = next;
      index += 1;
    } else {
      parsed[name] = inlineValue;
    }
  }
  return parsed;
}

function parseEnv(contents) {
  const env = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    assert(separator > 0, `Invalid env line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseHttpsUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  assert(url.protocol === 'https:', `${name} must use https.`);
  assert(url.pathname === '/', `${name} must be an origin URL ending in /.`);
  return url;
}

function requiredEnv(env, key, envFile) {
  assert(env[key], `${key} is required in ${envFile}.`);
  return env[key];
}

function readRootFile(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function requireContains(contents, expected, message) {
  assert(contents.includes(expected), message);
}

function requireMatches(contents, pattern, message) {
  assert(pattern.test(contents), message);
}

function rejectSecretLikeValues(contents, label) {
  const secretPatterns = [
    /CSS_CMS_CONTROL_TOKEN:\s*["']?[\w+/=-]{32,}/u,
    /ipms-control-token:\s*["']?(?!replace-with)[\w+/=-]{32,}/u,
    /sk-[\w-]{20,}/u,
  ];
  for (const pattern of secretPatterns) {
    assert(!pattern.test(contents), `${label} appears to contain an inline secret.`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
