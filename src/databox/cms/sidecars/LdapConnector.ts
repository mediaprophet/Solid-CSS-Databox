/**
 * Real LDAP connector using the `ldapjs` NPM package.
 *
 * Dynamically imports `ldapjs` at runtime so the package is an optional peer
 * dependency — the CMS builds without it, and the connector throws a clear
 * error if the package is not installed when a sync is attempted.
 */

import { createRequire } from 'node:module';

/** Configuration for an LDAP sync job. */
export interface LdapConfig {
  /** LDAP URL (e.g. `ldap://host:389` or `ldaps://host:636`). */
  url: string;
  /** Bind DN for authentication. */
  bindDn: string;
  /** Bind password. */
  bindPassword?: string;
  /** Search base DN. */
  searchBase: string;
  /** LDAP search filter (default: `(objectClass=*)`). */
  searchFilter?: string;
  /** Attributes to return (default: all). */
  attributes?: string[];
  /** Search scope: base, one, or sub (default: sub). */
  scope?: 'base' | 'one' | 'sub';
  /** Query timeout in milliseconds (default: 30 000). */
  timeoutMs?: number;
  /** TLS options (for ldaps:// URLs). */
  tlsOptions?: Record<string, unknown>;
}

/** An LDAP entry with its DN and attributes. */
export interface LdapEntry {
  dn: string;
  [attribute: string]: unknown;
}

/** Error thrown when the `ldapjs` package is not installed. */
export class LdapPackageMissingError extends Error {
  public constructor() {
    super(
      'The `ldapjs` NPM package is not installed. Install it with `npm install ldapjs` to use the LDAP connector.',
    );
    this.name = 'LdapPackageMissingError';
  }
}

/** Error thrown when the LDAP connection or bind fails. */
export class LdapConnectionError extends Error {
  public constructor(message: string) {
    super(`LDAP connection error: ${message}`);
    this.name = 'LdapConnectionError';
  }
}

/** Error thrown when the LDAP search fails. */
export class LdapSearchError extends Error {
  public constructor(message: string) {
    super(`LDAP search error: ${message}`);
    this.name = 'LdapSearchError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Minimal type for the ldapjs module. */
interface LdapModule {
  createClient: (options: LdapClientOptions) => LdapClient;
}

/** Options for creating an LDAP client. */
interface LdapClientOptions {
  url: string;
  timeout: number;
  connectTimeout: number;
  tlsOptions?: Record<string, unknown>;
}

/** Minimal type for an LDAP client. */
interface LdapClient {
  on: (event: 'error', listener: (err: Error) => void) => void;
  bind: (dn: string, password: string, callback: (err: Error | null) => void) => void;
  search: (
    base: string,
    options: Record<string, unknown>,
    callback: (err: Error | null, res: LdapSearchResult) => void,
  ) => void;
  unbind: () => void;
}

/** Minimal type for an LDAP search result (EventEmitter-like). */
interface LdapSearchResult {
  on: ((event: 'searchEntry', listener: (entry: LdapSearchEntry) => void) => void) &
    ((event: 'error', listener: (err: Error) => void) => void) &
    ((event: 'end', listener: () => void) => void);
}

/** An LDAP search entry. */
interface LdapSearchEntry {
  objectName: { toString: () => string };
  attributes: { type: string; vals: unknown[] }[];
}

const nodeRequire = createRequire(__filename);

let ldapModule: LdapModule | null = null;

function loadLdap(): LdapModule {
  if (ldapModule) {
    return ldapModule;
  }
  try {
    ldapModule = nodeRequire('ldapjs') as LdapModule;
    return ldapModule;
  } catch {
    throw new LdapPackageMissingError();
  }
}

/**
 * Execute an LDAP search and return the entries.
 *
 * @throws {LdapPackageMissingError} if the `ldapjs` package is not installed.
 * @throws {LdapConnectionError} if the connection or bind fails.
 * @throws {LdapSearchError} if the search fails or times out.
 */
export async function executeLdapSearch(config: LdapConfig): Promise<LdapEntry[]> {
  if (!config.url) {
    throw new LdapConnectionError('url is required.');
  }
  if (!config.searchBase) {
    throw new LdapSearchError('searchBase is required.');
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ldap = loadLdap();

  const client = ldap.createClient({
    url: config.url,
    timeout: timeoutMs,
    connectTimeout: timeoutMs,
    tlsOptions: config.tlsOptions,
  });

  return new Promise<LdapEntry[]>((resolve, reject): void => {
    const entries: LdapEntry[] = [];
    let settled = false;

    function finish(err: Error | null, result?: LdapEntry[]): void {
      if (settled) {
        return;
      }
      settled = true;
      try {
        client.unbind();
      } catch {
        // Ignore unbind errors
      }
      if (err) {
        reject(err);
      } else {
        resolve(result ?? entries);
      }
    };

    const timer = setTimeout((): void => {
      finish(new LdapSearchError(`Search timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    client.on('error', (err: Error): void => {
      clearTimeout(timer);
      if (err.message.toLowerCase().includes('connect') ||
        err.message.toLowerCase().includes('bind') ||
        err.message.toLowerCase().includes('auth')) {
        finish(new LdapConnectionError(err.message));
      } else {
        finish(new LdapSearchError(err.message));
      }
    });

    // Bind
    client.bind(config.bindDn, config.bindPassword ?? '', (bindErr: Error | null): void => {
      if (bindErr) {
        clearTimeout(timer);
        finish(new LdapConnectionError(bindErr.message));
        return;
      }

      // Search
      const searchOptions = {
        scope: config.scope ?? 'sub',
        filter: config.searchFilter ?? '(objectClass=*)',
        attributes: config.attributes,
        sizeLimit: 0,
        timeLimit: Math.ceil(timeoutMs / 1000),
      };

      client.search(config.searchBase, searchOptions, (searchErr: Error | null, res: LdapSearchResult): void => {
        if (searchErr) {
          clearTimeout(timer);
          finish(new LdapSearchError(searchErr.message));
          return;
        }

        res.on('searchEntry', (entry: LdapSearchEntry): void => {
          const obj: LdapEntry = {
            dn: entry.objectName.toString(),
          };
          for (const attr of entry.attributes) {
            obj[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
          }
          entries.push(obj);
        });

        res.on('error', (err: Error): void => {
          clearTimeout(timer);
          finish(new LdapSearchError(err.message));
        });

        res.on('end', (): void => {
          clearTimeout(timer);
          finish(null, entries);
        });
      });
    });
  });
}

/**
 * Browse the LDAP schema by listing entries under a base DN.
 * Returns the DN and objectClass for each entry.
 */
export async function browseLdapSchema(
  config: LdapConfig,
): Promise<{ entries: { dn: string; objectClass: string[] }[] }> {
  const result = await executeLdapSearch({
    ...config,
    searchFilter: '(objectClass=*)',
    attributes: [ 'objectClass' ],
    scope: 'one',
  });
  return {
    entries: result.map((entry): { dn: string; objectClass: string[] } => ({
      dn: entry.dn,
      objectClass: Array.isArray(entry.objectClass) ?
        entry.objectClass as string[] :
          [ String(entry.objectClass) ],
    })),
  };
}

/**
 * Backward-compatible wrapper: runs an LDAP search and returns entries.
 */
export async function runLdapSync(config: LdapConfig): Promise<LdapEntry[]> {
  return executeLdapSearch(config);
}
