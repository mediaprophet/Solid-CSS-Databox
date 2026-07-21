import { runLdapSync } from '../../../../../src/databox/cms/sidecars/LdapConnector';

describe('LdapConnector', (): void => {
  it('maps LDAP entries to Solid WebID profiles', async(): Promise<void> => {
    const config = {
      url: 'ldap://example.com',
      bindDn: 'cn=admin',
      searchBase: 'ou=users,dc=example,dc=com',
    };
    
    const result = await runLdapSync(config);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      '@context': 'https://schema.org/',
      '@type': 'Person',
      '@id': 'urn:ldap:cn=admin,ou=users,dc=example,dc=com',
      name: 'Admin User',
      givenName: 'Admin',
      familyName: 'User',
      email: 'admin@example.com',
      identifier: 'cn=admin,ou=users,dc=example,dc=com',
    });
  });

  it('throws an error if configuration is missing', async(): Promise<void> => {
    await expect(runLdapSync({ url: '', bindDn: '', searchBase: '' })).rejects.toThrow('LDAP sync requires a URL and searchBase.');
  });
});
