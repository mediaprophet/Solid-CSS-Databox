import { buildMembership } from '../../../../../src/databox/cms/entity/Membership';

const valid = {
  membershipId: 'https://acme.example/membership/1',
  organisation: 'https://acme.example/#org',
  member: 'https://alice.example/profile/card#me',
  role: 'https://acme.example/role/director',
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildMembership', (): void => {
  it('builds Org-Ontology JSON-LD referencing the member by WebID.', (): void => {
    const membership = buildMembership(valid);
    expect(membership['@context']).toBe('http://www.w3.org/ns/org#');
    expect(membership['@type']).toBe('Membership');
    expect(membership['@id']).toBe('https://acme.example/membership/1');
    expect(record(membership.member)['@id']).toBe('https://alice.example/profile/card#me');
    expect(record(membership.organization)['@id']).toBe('https://acme.example/#org');
    expect(membership.role).toBe('https://acme.example/role/director');
  });

  it('rejects a non-URI id, organisation or member.', (): void => {
    expect((): unknown => buildMembership({ ...valid, membershipId: 'not-a-uri' })).toThrow('id must be');
    expect((): unknown => buildMembership({ ...valid, organisation: 'nope' })).toThrow('organisation must be');
    expect((): unknown => buildMembership({ ...valid, member: 'nope' })).toThrow('member must be');
  });

  it('rejects an empty role.', (): void => {
    expect((): unknown => buildMembership({ ...valid, role: '  ' })).toThrow('role must not be empty');
  });
});
