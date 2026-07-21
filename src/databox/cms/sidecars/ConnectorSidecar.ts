import { runLdapSync } from './LdapConnector';
import { runOdbcSync } from './OdbcConnector';
import type { LdapConfig } from './LdapConnector';
import type { OdbcConfig } from './OdbcConnector';

export interface ConnectorJobConfig {
  type: 'ldap' | 'odbc';
  ldap?: LdapConfig;
  odbc?: OdbcConfig;
}

/**
 * Entry point for the CLI sidecar process.
 * Reads a JSON config from stdin and writes JSON-LD to stdout.
 */
async function main(): Promise<void> {
  const input = await readStdin();
  let config: ConnectorJobConfig;
  try {
    config = JSON.parse(input) as ConnectorJobConfig;
  } catch (err: unknown) {
    console.error('Failed to parse stdin as JSON:', err);
    process.exit(1);
  }

  try {
    let result: Record<string, unknown>[];
    if (config.type === 'ldap' && config.ldap) {
      result = await runLdapSync(config.ldap);
    } else if (config.type === 'odbc' && config.odbc) {
      result = await runOdbcSync(config.odbc);
    } else {
      throw new Error(`Invalid or missing configuration for type '${config.type}'`);
    }

    // Output valid JSON-LD
    console.log(JSON.stringify(result, null, 2));
  } catch (err: unknown) {
    console.error('Connector sidecar failed:', err);
    process.exit(1);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject): void => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string): void => {
      data += chunk;
    });
    process.stdin.on('end', (): void => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

// Only run automatically if invoked as a script
if (require.main === module) {
  main().catch((err: unknown): void => {
    console.error(err);
    process.exit(1);
  });
}
