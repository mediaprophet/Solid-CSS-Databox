import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const validator = join(root, 'scripts', 'validate-cms-deployment.mjs');
const tmpDir = join(root, 'test', 'tmp', 'cms-deployment');

describe('CMS deployment artifacts', (): void => {
  beforeEach((): void => {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach((): void => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates the Docker Compose and Kubernetes templates without Docker or Kubernetes.', (): void => {
    expect(existsSync(validator)).toBe(true);

    execFileSync('node', [ validator ], {
      cwd: root,
      stdio: 'pipe',
    });
  });

  it('rejects runtime env files that still point at the example host.', (): void => {
    const secretPath = join(tmpDir, 'cms_control_token.txt');
    const envPath = join(tmpDir, '.env');
    writeFileSync(secretPath, 'abcdefghijklmnopqrstuvwxyz1234567890\n');
    writeFileSync(envPath, [
      'CSS_BASE_URL=https://databox.example.org/',
      'CSS_CONFIG=config/cms/cms-file.json',
      `CMS_CONTROL_TOKEN_FILE=${secretPath}`,
      '',
    ].join('\n'));

    expect((): void => {
      execFileSync('node', [ validator, '--env-file', envPath ], {
        cwd: root,
        stdio: 'pipe',
      });
    }).toThrow(/CSS_BASE_URL must be changed/u);
  });

  it('rejects runtime env files with a missing control-token secret file.', (): void => {
    const envPath = join(tmpDir, '.env');
    writeFileSync(envPath, [
      'CSS_BASE_URL=https://databox.acme.test/',
      'CSS_CONFIG=config/cms/cms-file.json',
      'CMS_CONTROL_TOKEN_FILE=./missing-token.txt',
      '',
    ].join('\n'));

    expect((): void => {
      execFileSync('node', [ validator, '--env-file', envPath ], {
        cwd: root,
        stdio: 'pipe',
      });
    }).toThrow(/CMS_CONTROL_TOKEN_FILE does not exist/u);
  });

  it('accepts a runtime env file with a real host and a 32+ byte secret file.', (): void => {
    const secretPath = join(tmpDir, 'cms_control_token.txt');
    const envPath = join(tmpDir, '.env');
    writeFileSync(secretPath, 'abcdefghijklmnopqrstuvwxyz1234567890\n');
    writeFileSync(envPath, [
      'CSS_BASE_URL=https://databox.acme.test/',
      'CSS_CONFIG=config/cms/cms-file.json',
      `CMS_CONTROL_TOKEN_FILE=${secretPath}`,
      '',
    ].join('\n'));

    execFileSync('node', [ validator, '--env-file', envPath ], {
      cwd: root,
      stdio: 'pipe',
    });
  });
});
