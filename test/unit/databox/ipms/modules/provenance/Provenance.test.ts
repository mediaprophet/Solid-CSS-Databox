import type { ProvenanceInput } from '../../../../../../src/databox/ipms/modules/provenance/Provenance';
import { buildProvenance } from '../../../../../../src/databox/ipms/modules/provenance/Provenance';

const base: ProvenanceInput = {
  product: 'https://example.org/products/widget-1',
  origin: 'Australia',
  steps: [
    { actor: 'https://example.org/agents/maker-1', action: 'Manufactured', date: '2026-01-01' },
  ],
};

function records(value: unknown): Record<string, unknown>[] {
  return value as Record<string, unknown>[];
}

describe('buildProvenance', (): void => {
  it('builds a valid schema.org Product with minimal steps.', (): void => {
    const provenance = buildProvenance(base);
    expect(provenance['@context']).toBe('https://schema.org/');
    expect(provenance['@type']).toBe('Product');
    expect(provenance['@id']).toBe('https://example.org/products/widget-1');
    expect(provenance.countryOfOrigin).toBe('Australia');
    const subjectOf = records(provenance.subjectOf);
    expect(subjectOf).toHaveLength(1);
    expect(subjectOf[0]).toEqual({
      '@type': 'Action',
      agent: { '@id': 'https://example.org/agents/maker-1' },
      name: 'Manufactured',
      startTime: '2026-01-01',
    });
    expect(provenance.hasCredential).toBeUndefined();
  });

  it('builds a valid schema.org Product with multiple steps and certifications.', (): void => {
    const provenance = buildProvenance({
      product: 'https://example.org/products/widget-1',
      origin: 'Australia',
      steps: [
        { actor: 'https://example.org/agents/maker-1', action: 'Manufactured', date: '2026-01-01' },
        { actor: 'https://example.org/agents/shipper-1', action: 'Shipped', date: '2026-01-05' },
      ],
      certifications: [ 'https://example.org/certs/fair-trade-1' ],
    });
    const subjectOf = records(provenance.subjectOf);
    expect(subjectOf).toHaveLength(2);
    expect(subjectOf[1]).toEqual({
      '@type': 'Action',
      agent: { '@id': 'https://example.org/agents/shipper-1' },
      name: 'Shipped',
      startTime: '2026-01-05',
    });
    const hasCredential = records(provenance.hasCredential);
    expect(hasCredential).toHaveLength(1);
    expect(hasCredential[0]).toEqual({ '@id': 'https://example.org/certs/fair-trade-1' });
  });

  it('treats an empty certifications array the same as none.', (): void => {
    const provenance = buildProvenance({ ...base, certifications: []});
    expect(provenance.hasCredential).toBeUndefined();
  });

  it('rejects a non-URI product.', (): void => {
    expect((): unknown => buildProvenance({ ...base, product: 'not-a-uri' }))
      .toThrow('product must be an absolute URI');
  });

  it('rejects an empty origin.', (): void => {
    expect((): unknown => buildProvenance({ ...base, origin: '   ' }))
      .toThrow('origin must not be empty');
  });

  it('rejects an empty steps array.', (): void => {
    expect((): unknown => buildProvenance({ ...base, steps: []}))
      .toThrow('at least one step');
  });
});
