/**
 * Real ODBC connector using the `odbc` NPM package.
 *
 * Dynamically imports `odbc` at runtime so the package is an optional peer
 * dependency — the IPMS builds without it, and the connector throws a clear
 * error if the package is not installed when a sync is attempted.
 */

import { createRequire } from 'node:module';

/** Configuration for an ODBC sync job. */
export interface OdbcConfig {
  /** ODBC connection string (e.g. `DSN=MyDSN;UID=user;PWD=pass`). */
  connectionString: string;
  /** SQL query to execute. May contain `?` placeholders for parameters. */
  query: string;
  /** Optional bind parameters for the query. */
  parameters?: (string | number | boolean | null)[];
  /** Query timeout in milliseconds (default: 30 000). */
  timeoutMs?: number;
  /** Pool size (default: 4). */
  poolSize?: number;
}

/** A row from an ODBC query result, keyed by column name. */
export type OdbcRow = Record<string, unknown>;

/** Column metadata from the ODBC driver. */
export interface OdbcColumn {
  name: string;
  dataType: number;
  columnSize: number;
  nullable: boolean;
}

/** Result set from an ODBC query. */
export interface OdbcResult {
  rows: OdbcRow[];
  columns: OdbcColumn[];
  rowCount: number;
}

/** Error thrown when the `odbc` package is not installed. */
export class OdbcPackageMissingError extends Error {
  public constructor() {
    super(
      'The `odbc` NPM package is not installed. Install it with `npm install odbc` to use the ODBC connector.',
    );
    this.name = 'OdbcPackageMissingError';
  }
}

/** Error thrown when the ODBC connection fails. */
export class OdbcConnectionError extends Error {
  public constructor(message: string) {
    super(`ODBC connection error: ${message}`);
    this.name = 'OdbcConnectionError';
  }
}

/** Error thrown when the ODBC query fails (including timeouts). */
export class OdbcQueryError extends Error {
  public constructor(message: string) {
    super(`ODBC query error: ${message}`);
    this.name = 'OdbcQueryError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POOL_SIZE = 4;

/** Minimal type for the odbc module's pool function. */
interface OdbcPool {
  connect: () => Promise<OdbcConnection>;
  close: () => Promise<void>;
}

/** Minimal type for an ODBC connection. */
interface OdbcConnection {
  query: (sql: string, params?: unknown[]) => Promise<OdbcQueryResult>;
  close: () => Promise<void>;
}

/** Minimal type for an ODBC query result (array of rows with metadata). */
interface OdbcQueryResult extends Array<OdbcRow> {
  columns: OdbcColumn[];
  count: number;
}

/** Minimal type for the odbc module. */
interface OdbcModule {
  pool: (config: {
    connectionString: string;
    initialSize: number;
    maxSize: number;
  }) => Promise<OdbcPool>;
}

const nodeRequire = createRequire(__filename);

function toStr(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

let odbcModule: OdbcModule | null = null;
let poolCache = new Map<string, OdbcPool>();

function loadOdbc(): OdbcModule {
  if (odbcModule) {
    return odbcModule;
  }
  try {
    odbcModule = nodeRequire('odbc') as OdbcModule;
    return odbcModule;
  } catch {
    throw new OdbcPackageMissingError();
  }
}

async function getPool(connectionString: string, poolSize: number): Promise<OdbcPool> {
  const cacheKey = `${connectionString}:${poolSize}`;
  const cached = poolCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const odbc = loadOdbc();
  const pool = await odbc.pool({
    connectionString,
    initialSize: poolSize,
    maxSize: poolSize,
  });
  poolCache.set(cacheKey, pool);
  return pool;
}

/**
 * Execute an ODBC query and return the results.
 *
 * @throws {OdbcPackageMissingError} if the `odbc` package is not installed.
 * @throws {OdbcConnectionError} if the connection fails.
 * @throws {OdbcQueryError} if the query fails or times out.
 */
export async function executeOdbcQuery(config: OdbcConfig): Promise<OdbcResult> {
  if (!config.connectionString) {
    throw new OdbcConnectionError('connectionString is required.');
  }
  if (!config.query) {
    throw new OdbcQueryError('query is required.');
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const poolSize = config.poolSize ?? DEFAULT_POOL_SIZE;

  let connection: OdbcConnection | null = null;
  try {
    const pool = await getPool(config.connectionString, poolSize);
    connection = await pool.connect();

    const result = await Promise.race([
      connection.query(config.query, config.parameters ?? []),
      new Promise<never>((_, reject): void => {
        setTimeout((): void => {
          reject(new OdbcQueryError(`Query timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);

    const rawResult: OdbcQueryResult = result;
    const columns: OdbcColumn[] = (rawResult.columns ?? []).map(
      (col: OdbcColumn): OdbcColumn => ({
        name: col.name,
        dataType: col.dataType,
        columnSize: col.columnSize,
        nullable: col.nullable,
      }),
    );

    const rows: OdbcRow[] = [];
    for (const row of rawResult) {
      const obj: OdbcRow = {};
      for (const col of columns) {
        obj[col.name] = row[col.name];
      }
      rows.push(obj);
    }

    return {
      rows,
      columns,
      rowCount: rawResult.count ?? rows.length,
    };
  } catch (err: unknown) {
    if (err instanceof OdbcQueryError || err instanceof OdbcPackageMissingError) {
      throw err;
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('connect') || msg.includes('login') || msg.includes('auth') ||
        msg.includes('dsn') || msg.includes('driver')) {
        throw new OdbcConnectionError(err.message);
      }
      throw new OdbcQueryError(err.message);
    }
    throw new OdbcQueryError(String(err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Execute an ODBC query and stream rows via an async generator.
 */
export async function* streamOdbcQuery(
  config: OdbcConfig,
): AsyncGenerator<OdbcRow, void, unknown> {
  const result = await executeOdbcQuery(config);
  for (const row of result.rows) {
    yield row;
  }
}

/**
 * Browse the schema (tables) of an ODBC data source.
 */
export async function browseOdbcSchema(
  connectionString: string,
  timeoutMs?: number,
): Promise<{ tables: { name: string; schema: string; type: string }[] }> {
  const config: OdbcConfig = {
    connectionString,
    query: `
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `,
    timeoutMs,
  };
  const result = await executeOdbcQuery(config);
  return {
    tables: result.rows.map((row): { name: string; schema: string; type: string } => ({
      schema: toStr(row.TABLE_SCHEMA),
      name: toStr(row.TABLE_NAME),
      type: toStr(row.TABLE_TYPE),
    })),
  };
}

/**
 * Close all cached ODBC pools. Should be called on shutdown.
 */
export async function closeOdbcPools(): Promise<void> {
  for (const [ , pool ] of poolCache) {
    try {
      await pool.close();
    } catch {
      // Ignore close errors
    }
  }
  poolCache = new Map();
}

/**
 * Backward-compatible wrapper: runs an ODBC query and returns raw rows.
 */
export async function runOdbcSync(config: OdbcConfig): Promise<Record<string, unknown>[]> {
  const result = await executeOdbcQuery(config);
  return result.rows;
}
