import { buildConsent } from '../../../../../../src/databox/cms/modules/consent/Consent';

const base = {
  id: 'https://example.org/consents/1',
  dataSubject: 'https://example.org/people/alice',
  controller: 'https://example.org/orgs/clinic',
  purpose: 'treatment coordination',
  dataCategories: [ 'health-record' ],
  legalBasis: 'consent',
  granted: true,
  timestamp: '2026-07-19T00:00:00.000Z',
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildConsent', (): void => {
  it('builds a granted DPV-shaped consent record.', (): void => {
    const consent = buildConsent(base);
    expect(consent['@context']).toBe('https://w3id.org/dpv#');
    expect(consent['@id']).toBe('https://example.org/consents/1');
    expect(consent['@type']).toBe('Consent');
    expect(consent.hasPurpose).toBe('treatment coordination');
    expect(consent.hasPersonalData).toStrictEqual([ 'health-record' ]);
    expect(consent.hasLegalBasis).toBe('consent');
    expect(consent.hasConsentStatus).toBe('ConsentGiven');
    expect(consent.timestamp).toBe('2026-07-19T00:00:00.000Z');

    const dataSubject = record(consent.dataSubject);
    expect(dataSubject['@id']).toBe('https://example.org/people/alice');

    const controller = record(consent.dataController);
    expect(controller['@id']).toBe('https://example.org/orgs/clinic');
  });

  it('builds a withdrawn consent record.', (): void => {
    const consent = buildConsent({ ...base, granted: false });
    expect(consent.hasConsentStatus).toBe('ConsentWithdrawn');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildConsent({ ...base, id: 'not-a-uri' })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI dataSubject.', (): void => {
    expect((): unknown => buildConsent({ ...base, dataSubject: 'not-a-uri' }))
      .toThrow('dataSubject must be an absolute URI');
  });

  it('rejects a non-URI controller.', (): void => {
    expect((): unknown => buildConsent({ ...base, controller: 'not-a-uri' }))
      .toThrow('controller must be an absolute URI');
  });

  it('rejects an empty purpose.', (): void => {
    expect((): unknown => buildConsent({ ...base, purpose: '  ' })).toThrow('purpose');
  });

  it('rejects empty dataCategories.', (): void => {
    expect((): unknown => buildConsent({ ...base, dataCategories: []})).toThrow('data category');
  });

  it('rejects an empty legalBasis.', (): void => {
    expect((): unknown => buildConsent({ ...base, legalBasis: '  ' })).toThrow('legalBasis');
  });

  it('rejects an empty timestamp.', (): void => {
    expect((): unknown => buildConsent({ ...base, timestamp: '  ' })).toThrow('timestamp');
  });
});
