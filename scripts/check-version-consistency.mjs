import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
const packagePath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');
const pkg = await readJson(packagePath);
const lock = await readJson(lockPath);
const failures = [];

const versionMatch = /^(\d+)\.\d+\.\d+(?:[-+].+)?$/u.exec(pkg.version);
if (!versionMatch) {
  failures.push(`package.json has an invalid semantic version: ${pkg.version}`);
}

if (lock.version !== pkg.version) {
  failures.push(`package-lock.json version ${lock.version} does not match package.json ${pkg.version}`);
}
if (lock.packages?.['']?.version !== pkg.version) {
  failures.push(`package-lock.json root package version ${lock.packages?.['']?.version} does not match ${pkg.version}`);
}

if (versionMatch) {
  const expectedPrefix = `${pkg['lsd:module']}/^${versionMatch[1]}.0.0/`;
  const metadataKeys = [
    ...Object.keys(pkg['lsd:contexts'] ?? {}),
    ...Object.keys(pkg['lsd:importPaths'] ?? {}),
  ];
  for (const key of metadataKeys) {
    if (key.startsWith(`${pkg['lsd:module']}/`) && !key.startsWith(expectedPrefix)) {
      failures.push(`package.json Components.js reference does not use ${expectedPrefix}: ${key}`);
    }
  }

  const configRoots = [
    join(root, 'config'),
    join(root, 'templates', 'config'),
    join(root, 'test', 'integration', 'config'),
  ];
  const namespacePattern = new RegExp(
    `${pkg['lsd:module'].replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}/\\^\\d+\\.0\\.0/`,
    'gu',
  );

  async function checkDirectory(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) {
        await checkDirectory(entryPath);
      } else if (entry.name.endsWith('.json')) {
        const content = await readFile(entryPath, 'utf8');
        for (const match of content.matchAll(namespacePattern)) {
          if (match[0] !== expectedPrefix) {
            failures.push(`${relative(root, entryPath)} uses ${match[0]} instead of ${expectedPrefix}`);
          }
        }
      }
    }
  }

  for (const configRoot of configRoots) {
    await checkDirectory(configRoot);
  }
}

if (failures.length > 0) {
  throw new Error(`Version consistency check failed:\n- ${failures.join('\n- ')}`);
}

console.log(`Version metadata is consistent for ${pkg.name}@${pkg.version}.`);
