import { describe, it, expect } from '@jest/globals';
import {
  OdbcPackageMissingError,
  OdbcConnectionError,
  OdbcQueryError,
  executeOdbcQuery,
  closeOdbcPools,
} from '../../../../../src/databox/cms/sidecars/OdbcConnector';

describe('OdbcConnector', () => {
  it('throws OdbcPackageMissingError when odbc package is not installed', async () => {
    await expect(executeOdbcQuery({
      connectionString: 'DSN=test',
      query: 'SELECT 1',
      timeoutMs: 1_000,
    })).rejects.toThrow(OdbcPackageMissingError);
  });

  it('throws OdbcConnectionError for empty connection string', async () => {
    await expect(executeOdbcQuery({
      connectionString: '',
      query: 'SELECT 1',
    })).rejects.toThrow(OdbcConnectionError);
  });

  it('throws OdbcQueryError for empty query', async () => {
    await expect(executeOdbcQuery({
      connectionString: 'DSN=test',
      query: '',
    })).rejects.toThrow(OdbcQueryError);
  });

  it('closeOdbcPools does not throw', async () => {
    await expect(closeOdbcPools()).resolves.toBeUndefined();
  });
});
