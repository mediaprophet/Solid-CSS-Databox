import { applyLoyalty, buildLoyaltyRecord } from '../../../../../../src/databox/cms/modules/loyalty/Loyalty';
import { BadRequestHttpError } from '../../../../../../src/util/errors/BadRequestHttpError';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('applyLoyalty', (): void => {
  it('computes earned points and redeems points within the current balance.', (): void => {
    const result = applyLoyalty({
      balance: 100,
      spendAmount: 50,
      earnRatePer: 2,
      redeemPoints: 30,
      redeemValuePer: 0.1,
    });
    expect(result).toStrictEqual({
      earned: 100,
      redeemedPoints: 30,
      redeemedValue: 3,
      newBalance: 170,
    });
  });

  it('caps redeemed points at the current balance when redeemPoints exceeds it.', (): void => {
    const result = applyLoyalty({
      balance: 10,
      spendAmount: 0,
      earnRatePer: 1,
      redeemPoints: 50,
      redeemValuePer: 0.05,
    });
    expect(result).toStrictEqual({
      earned: 0,
      redeemedPoints: 10,
      redeemedValue: 0.5,
      newBalance: 0,
    });
  });

  it('rounds redeemed value to two decimals.', (): void => {
    const result = applyLoyalty({
      balance: 3,
      spendAmount: 0,
      earnRatePer: 0,
      redeemPoints: 3,
      redeemValuePer: 0.333,
    });

    expect(result.redeemedValue).toBe(1);
  });

  it('throws when inputs are negative, non-finite, or fractional point counts.', (): void => {
    expect((): void => {
      applyLoyalty({
        balance: -1,
        spendAmount: 0,
        earnRatePer: 0,
        redeemPoints: 0,
        redeemValuePer: 0,
      });
    }).toThrow(BadRequestHttpError);
    expect((): void => {
      applyLoyalty({
        balance: 1.5,
        spendAmount: 0,
        earnRatePer: 0,
        redeemPoints: 0,
        redeemValuePer: 0,
      });
    }).toThrow('Loyalty balance must be a non-negative integer.');
    expect((): void => {
      applyLoyalty({
        balance: 1,
        spendAmount: Number.POSITIVE_INFINITY,
        earnRatePer: 0,
        redeemPoints: 0,
        redeemValuePer: 0,
      });
    }).toThrow('Spend amount must be greater than or equal to 0.');
    expect((): void => {
      applyLoyalty({
        balance: 1,
        spendAmount: 0,
        earnRatePer: 0,
        redeemPoints: 1.5,
        redeemValuePer: 0,
      });
    }).toThrow('Redeem points must be a non-negative integer.');
  });
});

describe('buildLoyaltyRecord', (): void => {
  it('builds an auditable loyalty transaction record.', (): void => {
    const result = buildLoyaltyRecord({
      id: 'https://example.org/loyalty/tx/1',
      member: 'https://example.org/people/alice',
      program: 'https://example.org/loyalty/program',
      currency: 'aud',
      appliedAt: '2026-07-19T10:30:00.000Z',
      balance: 100,
      spendAmount: 50,
      earnRatePer: 2,
      redeemPoints: 30,
      redeemValuePer: 0.1,
    });

    expect(result.earned).toBe(100);
    expect(result.redeemedPoints).toBe(30);
    expect(result.redeemedValue).toBe(3);
    expect(result.newBalance).toBe(170);
    expect(result.record['@context']).toBe('https://schema.org/');
    expect(result.record['@type']).toBe('Action');
    expect(result.record['@id']).toBe('https://example.org/loyalty/tx/1');
    expect(result.record.name).toBe('LoyaltyTransaction');
    expect(result.record.actionStatus).toBe('CompletedActionStatus');

    const agent = record(result.record.agent);
    expect(agent['@id']).toBe('https://example.org/people/alice');

    const instrument = record(result.record.instrument);
    expect(instrument['@id']).toBe('https://example.org/loyalty/program');

    expect(result.record.result).toEqual({
      currency: 'AUD',
      earned: 100,
      redeemedPoints: 30,
      redeemedValue: 3,
      newBalance: 170,
    });
  });

  it('rejects invalid record metadata.', (): void => {
    const base = {
      id: 'https://example.org/loyalty/tx/1',
      member: 'https://example.org/people/alice',
      program: 'https://example.org/loyalty/program',
      currency: 'AUD',
      appliedAt: '2026-07-19T10:30:00.000Z',
      balance: 100,
      spendAmount: 50,
      earnRatePer: 2,
      redeemPoints: 30,
      redeemValuePer: 0.1,
    };

    expect((): unknown => buildLoyaltyRecord({ ...base, id: 'not-a-uri' }))
      .toThrow('id must be an absolute URI');
    expect((): unknown => buildLoyaltyRecord({ ...base, member: 'not-a-uri' }))
      .toThrow('member must be an absolute URI');
    expect((): unknown => buildLoyaltyRecord({ ...base, program: 'not-a-uri' }))
      .toThrow('program must be an absolute URI');
    expect((): unknown => buildLoyaltyRecord({ ...base, currency: 'AU' }))
      .toThrow('currency must be a three-letter ISO 4217 code');
    expect((): unknown => buildLoyaltyRecord({ ...base, appliedAt: 'not-a-date' }))
      .toThrow('appliedAt must be a valid date');
  });
});
