import type { LicenceInput } from '../../../../../../src/databox/cms/modules/licensing/Licence';
import { buildLicence, isActionPermitted } from '../../../../../../src/databox/cms/modules/licensing/Licence';

const base: LicenceInput = {
  id: 'https://example.org/licences/lic-1',
  asset: 'https://example.org/assets/model-1',
  assignee: 'https://example.org/agents/buyer-1',
  permittedActions: [ 'print', 'reproduce' ],
};

function records(value: unknown): Record<string, unknown>[] {
  return value as Record<string, unknown>[];
}

describe('buildLicence', (): void => {
  it('builds a valid ODRL Agreement without prohibitions.', (): void => {
    const licence = buildLicence(base);
    expect(licence['@context']).toBe('https://www.w3.org/ns/odrl.jsonld');
    expect(licence['@type']).toBe('Agreement');
    expect(licence['@id']).toBe('https://example.org/licences/lic-1');
    const permission = records(licence.permission);
    expect(permission).toHaveLength(2);
    expect(permission[0]).toEqual({
      target: 'https://example.org/assets/model-1',
      assignee: 'https://example.org/agents/buyer-1',
      action: 'print',
    });
    expect(permission[1].action).toBe('reproduce');
    expect(licence.prohibition).toBeUndefined();
  });

  it('builds a valid ODRL Agreement with prohibitions.', (): void => {
    const licence = buildLicence({
      ...base,
      prohibitedActions: [ 'sell' ],
    });
    const prohibition = records(licence.prohibition);
    expect(prohibition).toHaveLength(1);
    expect(prohibition[0]).toEqual({
      target: 'https://example.org/assets/model-1',
      assignee: 'https://example.org/agents/buyer-1',
      action: 'sell',
    });
  });

  it('treats an empty prohibitedActions array the same as none.', (): void => {
    const licence = buildLicence({ ...base, prohibitedActions: []});
    expect(licence.prohibition).toBeUndefined();
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildLicence({ ...base, id: 'not-a-uri' }))
      .toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI asset.', (): void => {
    expect((): unknown => buildLicence({ ...base, asset: 'not-a-uri' }))
      .toThrow('asset must be an absolute URI');
  });

  it('rejects a non-URI assignee.', (): void => {
    expect((): unknown => buildLicence({ ...base, assignee: 'not-a-uri' }))
      .toThrow('assignee must be an absolute URI');
  });

  it('rejects an empty permittedActions array.', (): void => {
    expect((): unknown => buildLicence({ ...base, permittedActions: []}))
      .toThrow('at least one permitted action');
  });
});

describe('isActionPermitted', (): void => {
  it('returns true when the action is permitted and not prohibited.', (): void => {
    expect(isActionPermitted(base, 'print')).toBe(true);
  });

  it('returns false when the action is not in permittedActions.', (): void => {
    expect(isActionPermitted(base, 'sell')).toBe(false);
  });

  it('returns false when the action is permitted but also prohibited.', (): void => {
    const licence: LicenceInput = {
      ...base,
      permittedActions: [ 'print', 'sell' ],
      prohibitedActions: [ 'sell' ],
    };
    expect(isActionPermitted(licence, 'sell')).toBe(false);
  });
});
