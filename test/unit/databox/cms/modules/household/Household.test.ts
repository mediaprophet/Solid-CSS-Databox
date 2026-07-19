import { buildHousehold } from '../../../../../../src/databox/cms/modules/household/Household';

describe('buildHousehold', (): void => {
  it('builds a household with two members.', (): void => {
    const household = buildHousehold({
      id: 'https://example.org/household/1#it',
      name: 'The Example Household',
      members: [
        'https://example.org/profile/alice#me',
        'https://example.org/profile/bob#me',
      ],
    });
    expect(household['@context']).toBe('https://schema.org/');
    expect(household['@type']).toBe('Organization');
    expect(household['@id']).toBe('https://example.org/household/1#it');
    expect(household.name).toBe('The Example Household');
    expect(household.member).toEqual([
      { '@id': 'https://example.org/profile/alice#me' },
      { '@id': 'https://example.org/profile/bob#me' },
    ]);
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildHousehold({
      id: 'not-a-uri',
      name: 'The Example Household',
      members: [ 'https://example.org/profile/alice#me' ],
    })).toThrow('id must be an absolute URI');
  });

  it('rejects an empty name.', (): void => {
    expect((): unknown => buildHousehold({
      id: 'https://example.org/household/1#it',
      name: '   ',
      members: [ 'https://example.org/profile/alice#me' ],
    })).toThrow('Household name must not be empty.');
  });

  it('rejects empty members.', (): void => {
    expect((): unknown => buildHousehold({
      id: 'https://example.org/household/1#it',
      name: 'The Example Household',
      members: [],
    })).toThrow('Household members must not be empty.');
  });

  it('rejects a non-URI member.', (): void => {
    expect((): unknown => buildHousehold({
      id: 'https://example.org/household/1#it',
      name: 'The Example Household',
      members: [ 'not-a-uri' ],
    })).toThrow('member must be an absolute URI');
  });
});
