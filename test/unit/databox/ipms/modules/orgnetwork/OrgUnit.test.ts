import { buildOrgUnit } from '../../../../../../src/databox/ipms/modules/orgnetwork/OrgUnit';

const base = {
  org: 'https://example.org/orgs/rotary-northside',
  name: 'Rotary Club of Northside',
  parent: 'https://example.org/orgs/rotary-district-9800',
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildOrgUnit', (): void => {
  it('builds a schema.org Organization with a parentOrganization link.', (): void => {
    const unit = buildOrgUnit(base);
    expect(unit['@context']).toBe('https://schema.org/');
    expect(unit['@type']).toBe('Organization');
    expect(unit['@id']).toBe('https://example.org/orgs/rotary-northside');
    expect(unit.name).toBe('Rotary Club of Northside');
    expect(record(unit.parentOrganization)['@id']).toBe('https://example.org/orgs/rotary-district-9800');
  });

  it('rejects a non-URI org.', (): void => {
    expect((): unknown => buildOrgUnit({ ...base, org: 'not-a-uri' }))
      .toThrow('org must be an absolute URI');
  });

  it('rejects a non-URI parent.', (): void => {
    expect((): unknown => buildOrgUnit({ ...base, parent: 'not-a-uri' }))
      .toThrow('parent must be an absolute URI');
  });

  it('rejects an empty name.', (): void => {
    expect((): unknown => buildOrgUnit({ ...base, name: '   ' }))
      .toThrow('name must not be empty');
  });
});
