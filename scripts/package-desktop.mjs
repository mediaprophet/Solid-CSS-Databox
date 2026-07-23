import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const extension = process.platform === 'win32' ? '.exe' : '';
const nativeTarget = process.env.DATABOX_NATIVE_TARGET;
const nativeRelease = nativeTarget
  ? join(root, 'native', 'target', nativeTarget, 'release')
  : join(root, 'native', 'target', 'release');
const output = join(root, 'release', 'Databox CMS');
const app = join(output, 'payload', 'app');
const helpers = join(output, 'payload', 'bin');

const required = [
  join(nativeRelease, `databox-installer${extension}`),
  join(nativeRelease, `tray-supervisor${extension}`),
  join(nativeRelease, `pos-edge${extension}`),
  join(root, 'dist'),
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  throw new Error(`Desktop package prerequisites are missing:\n${missing.join('\n')}\n\nRun npm run build and npm run build:native first.`);
}

await rm(output, { recursive: true, force: true });
await mkdir(helpers, { recursive: true });
await cp(join(nativeRelease, `databox-installer${extension}`), join(output, `Databox CMS Setup${extension}`));
for (const helper of ['tray-supervisor', 'pos-edge']) {
  await cp(join(nativeRelease, `${helper}${extension}`), join(helpers, `${helper}${extension}`));
}
for (const entry of ['bin', 'config', 'dist', 'templates', 'patches']) {
  if (existsSync(join(root, entry))) await cp(join(root, entry), join(app, entry), { recursive: true });
}
// The server consumes the built admin asset, never the admin project's development dependencies.
if (existsSync(join(root, 'forge-admin', 'dist'))) {
  await cp(join(root, 'forge-admin', 'dist'), join(app, 'forge-admin', 'dist'), { recursive: true });
}
for (const entry of ['package.json', 'package-lock.json']) {
  await cp(join(root, entry), join(app, entry));
}
await writeFile(join(output, 'README.txt'), `Databox CMS\n===========\n\n1. Run “Databox CMS Setup${extension}”.\n2. Setup installs the private runtime and starts Databox from the notification area.\n3. Use the tray icon to open the admin panel, view logs, or start and stop the server.\n\nThe first setup downloads Node.js and installs locked application dependencies, so it needs an internet connection.\n`);
console.log(`Desktop package created at ${output}`);
