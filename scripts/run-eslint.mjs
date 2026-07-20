import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

const eslintBin = join('node_modules', 'eslint', 'bin', 'eslint.js');
const baseArgs = [ '--cache', '--max-warnings', '0' ];
const concurrency = Math.max(2, Math.min(4, availableParallelism() - 1));

const chunks = [
  {
    name: 'root-config',
    patterns: [ '*.js', '*.mjs', 'bin', 'config', 'scripts' ],
  },
  {
    name: 'src-core',
    patterns: [ 'src/authentication', 'src/authorization', 'src/http', 'src/identity', 'src/init' ],
  },
  {
    name: 'src-runtime',
    patterns: [ 'src/logging', 'src/server', 'src/util' ],
  },
  {
    name: 'src-databox-storage',
    patterns: [ 'src/databox', 'src/pods', 'src/storage' ],
  },
  {
    name: 'test-core',
    patterns: [
      'test/unit/authentication',
      'test/unit/authorization',
      'test/unit/http',
      'test/unit/identity',
      'test/unit/init',
    ],
  },
  {
    name: 'test-runtime',
    patterns: [ 'test/unit/logging', 'test/unit/quota', 'test/unit/server', 'test/unit/util' ],
  },
  {
    name: 'test-databox-storage',
    patterns: [ 'test/unit/databox', 'test/unit/pods', 'test/unit/storage', 'test/integration' ],
  },
];

let next = 0;
let failed = false;

await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, async() => {
  while (next < chunks.length) {
    const chunk = chunks[next];
    next += 1;
    const result = await runChunk(chunk);
    if (result.exitCode !== 0) {
      failed = true;
      process.stderr.write(result.output);
    } else if (result.output.trim().length > 0) {
      process.stdout.write(result.output);
    }
  }
}));

if (failed) {
  process.exitCode = 1;
}

function runChunk(chunk) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      eslintBin,
      ...baseArgs,
      '--cache-location',
      join('node_modules', '.cache', 'eslint', `${chunk.name}${process.platform === 'win32' ? '\\' : '/'}`),
      ...chunk.patterns,
    ], {
      shell: false,
      stdio: [ 'ignore', 'pipe', 'pipe' ],
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('close', (exitCode) => {
      resolve({ exitCode, output });
    });
  });
}
