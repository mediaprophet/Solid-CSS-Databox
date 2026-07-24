import { buildProfile } from '../../../../../../src/databox/ipms/modules/profile/PersonProfile';

describe('buildProfile', (): void => {
  it('builds a minimal profile with only the owner.', (): void => {
    const profile = buildProfile({ owner: 'https://example.org/profile/card#me' });
    expect(profile['@context']).toBe('https://schema.org/');
    expect(profile['@type']).toBe('Person');
    expect(profile['@id']).toBe('https://example.org/profile/card#me');
    expect(profile.measurements).toBeUndefined();
    expect(profile.allergies).toBeUndefined();
    expect(profile.preferences).toBeUndefined();
  });

  it('includes measurements, allergies, and preferences when supplied.', (): void => {
    const profile = buildProfile({
      owner: 'https://example.org/profile/card#me',
      measurements: { height: '180cm', weight: '75kg' },
      allergies: [ 'peanuts', 'shellfish' ],
      preferences: { seat: 'aisle' },
    });
    expect(profile.measurements).toEqual({ height: '180cm', weight: '75kg' });
    expect(profile.allergies).toEqual([ 'peanuts', 'shellfish' ]);
    expect(profile.preferences).toEqual({ seat: 'aisle' });
  });

  it('omits allergies when the array is empty.', (): void => {
    const profile = buildProfile({
      owner: 'https://example.org/profile/card#me',
      allergies: [],
    });
    expect(profile.allergies).toBeUndefined();
  });

  it('rejects a non-URI owner.', (): void => {
    expect((): unknown => buildProfile({ owner: 'not-a-uri' })).toThrow('owner must be an absolute URI');
  });
});
