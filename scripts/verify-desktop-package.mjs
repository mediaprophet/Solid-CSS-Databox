import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const target = resolveTarget(process.env.DATABOX_NATIVE_TARGET);
const product = join(root, 'release', 'Databox IPMS');
const payload = join(product, 'payload');
const extension = target.platform === 'windows' ? '.exe' : '';
const required = [
  join(product, `Databox IPMS Setup${extension}`),
  join(payload, 'manifest.json'),
  join(payload, 'app', 'bin', 'server.js'),
  join(payload, 'app', 'package-lock.json'),
  join(payload, 'bin', `tray-supervisor${extension}`),
  join(payload, 'bin', `pos-edge${extension}`),
];

const missing = required.filter(path => !existsSync(path));
if (missing.length > 0) {
  throw new Error(`Desktop package is incomplete:\n${missing.join('\n')}`);
}

const manifest = JSON.parse(readFileSync(join(payload, 'manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.target !== target.triple || manifest.platform !== target.platform || manifest.architecture !== target.architecture || manifest.nodeVersion !== 'v24.18.0') {
  throw new Error(`Desktop package manifest does not match ${target.triple}.`);
}

console.log(`Desktop package verified for ${target.platform}/${target.architecture}.`);

function resolveTarget(value) {
  if (!value) {
    throw new Error('DATABOX_NATIVE_TARGET is required when verifying a desktop package.');
  }
  const platform = value.includes('windows') ? 'windows' : value.includes('apple-darwin') ? 'macos' : value.includes('linux') ? 'linux' : undefined;
  const architecture = value.startsWith('x86_64') ? 'x64' : value.startsWith('aarch64') ? 'arm64' : undefined;
  if (!platform || !architecture) {
    throw new Error(`Unsupported DATABOX_NATIVE_TARGET: ${value}`);
  }
  return { triple: value, platform, architecture };
}
