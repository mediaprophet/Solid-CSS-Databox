import { buildAttestation } from '../../../../../../src/databox/cms/modules/credentials/Attestation';

const base = {
  id: 'https://example.org/credentials/1',
  issuer: 'https://example.org/issuer',
  subject: 'https://example.org/subjects/alice',
  claim: 'holds valid WWCC',
  expires: '2027-01-01',
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildAttestation', (): void => {
  it('builds a minimal-disclosure VC-shaped JSON-LD claim.', (): void => {
    const attestation = buildAttestation(base);
    expect(attestation['@context']).toStrictEqual([ 'https://www.w3.org/2018/credentials/v1' ]);
    expect(attestation['@id']).toBe('https://example.org/credentials/1');
    expect(attestation['@type']).toStrictEqual([ 'VerifiableCredential' ]);
    expect(attestation.expirationDate).toBe('2027-01-01');

    const issuer = record(attestation.issuer);
    expect(issuer['@id']).toBe('https://example.org/issuer');

    const subject = record(attestation.credentialSubject);
    expect(subject['@id']).toBe('https://example.org/subjects/alice');
    expect(subject.holds).toBe('holds valid WWCC');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildAttestation({ ...base, id: 'not-a-uri' })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI issuer.', (): void => {
    expect((): unknown => buildAttestation({ ...base, issuer: 'not-a-uri' }))
      .toThrow('issuer must be an absolute URI');
  });

  it('rejects a non-URI subject.', (): void => {
    expect((): unknown => buildAttestation({ ...base, subject: 'not-a-uri' }))
      .toThrow('subject must be an absolute URI');
  });

  it('rejects an empty claim.', (): void => {
    expect((): unknown => buildAttestation({ ...base, claim: '  ' })).toThrow('claim');
  });

  it('rejects an empty expires value.', (): void => {
    expect((): unknown => buildAttestation({ ...base, expires: '  ' })).toThrow('expires');
  });
});
