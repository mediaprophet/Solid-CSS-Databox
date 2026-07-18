import { buildLegalEntity } from '../../../../../src/databox/cms/entity/LegalEntity';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildLegalEntity', (): void => {
  it('builds a minimal schema.org Organization.', (): void => {
    const entity = buildLegalEntity({ id: 'https://acme.example/#org', legalName: 'Acme Pty Ltd' });
    expect(entity['@type']).toBe('Organization');
    expect(entity['@id']).toBe('https://acme.example/#org');
    expect(entity.legalName).toBe('Acme Pty Ltd');
    expect(entity.url).toBeUndefined();
    expect(entity.identifier).toBeUndefined();
    expect(entity.address).toBeUndefined();
  });

  it('includes url, legal identifier and jurisdiction when supplied.', (): void => {
    const entity = buildLegalEntity({
      id: 'https://acme.example/#org',
      legalName: 'Acme Pty Ltd',
      url: 'https://acme.example',
      legalIdentifier: '12 345 678 901',
      jurisdiction: 'AU',
    });
    expect(entity.url).toBe('https://acme.example');
    expect(entity.identifier).toBe('12 345 678 901');
    expect(record(entity.address).addressCountry).toBe('AU');
  });

  it('rejects a non-URI id or empty legal name.', (): void => {
    expect((): unknown => buildLegalEntity({ id: 'nope', legalName: 'Acme' })).toThrow('absolute URI');
    expect((): unknown => buildLegalEntity({ id: 'https://acme.example/#org', legalName: ' ' }))
      .toThrow('legal name');
  });
});
