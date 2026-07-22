import { describe, expect, it } from '@jest/globals';
import {
  executeLdapSearch,
  LdapConnectionError,
  LdapPackageMissingError,
  LdapSearchError,
} from '../../../../../src/databox/cms/sidecars/LdapConnector';

describe('LdapConnector', (): void => {
  it('throws LdapPackageMissingError when ldapjs package is not installed', async(): Promise<void> => {
    await expect(executeLdapSearch({
      url: 'ldap://localhost:389',
      bindDn: 'cn=admin',
      searchBase: 'dc=example,dc=com',
      timeoutMs: 1_000,
    })).rejects.toThrow(LdapPackageMissingError);
  });

  it('throws LdapConnectionError for empty URL', async(): Promise<void> => {
    await expect(executeLdapSearch({
      url: '',
      bindDn: 'cn=admin',
      searchBase: 'dc=example,dc=com',
    })).rejects.toThrow(LdapConnectionError);
  });

  it('throws LdapSearchError for empty searchBase', async(): Promise<void> => {
    await expect(executeLdapSearch({
      url: 'ldap://localhost:389',
      bindDn: 'cn=admin',
      searchBase: '',
    })).rejects.toThrow(LdapSearchError);
  });
});
