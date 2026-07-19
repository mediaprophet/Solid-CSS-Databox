import { computeTax } from '../../../../../../src/databox/cms/modules/payments/Tax';

describe('computeTax', (): void => {
  it('computes an inclusive tax breakdown.', (): void => {
    expect(computeTax({ amount: 110, ratePercent: 10, inclusive: true })).toEqual({
      net: 100,
      tax: 10,
      gross: 110,
    });
  });

  it('computes an exclusive tax breakdown.', (): void => {
    expect(computeTax({ amount: 100, ratePercent: 10, inclusive: false })).toEqual({
      net: 100,
      tax: 10,
      gross: 110,
    });
  });

  it('throws when amount is negative.', (): void => {
    expect((): void => {
      computeTax({ amount: -1, ratePercent: 10, inclusive: false });
    }).toThrow('amount must not be negative.');
  });

  it('throws when ratePercent is negative.', (): void => {
    expect((): void => {
      computeTax({ amount: 100, ratePercent: -1, inclusive: false });
    }).toThrow('ratePercent must not be negative.');
  });
});
