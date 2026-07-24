import { splitPayment } from '../../../../../../src/databox/ipms/modules/payments/Split';

describe('splitPayment', (): void => {
  it('splits the remaining amount between payees by share, after the platform fee.', (): void => {
    const result = splitPayment({
      total: 100,
      feePercent: 10,
      payees: [
        { id: 'seller-1', share: 3 },
        { id: 'seller-2', share: 1 },
      ],
    });
    expect(result.platformFee).toBe(10);
    expect(result.payouts).toEqual([
      { id: 'seller-1', amount: 67.5 },
      { id: 'seller-2', amount: 22.5 },
    ]);
  });

  it('rounds the fee and each payout to two decimal places.', (): void => {
    const result = splitPayment({
      total: 10,
      feePercent: 33,
      payees: [
        { id: 'a', share: 1 },
        { id: 'b', share: 2 },
      ],
    });
    expect(result.platformFee).toBe(3.3);
    expect(result.payouts).toEqual([
      { id: 'a', amount: 2.23 },
      { id: 'b', amount: 4.47 },
    ]);
  });

  it('rejects a negative total.', (): void => {
    expect((): unknown => splitPayment({ total: -1, feePercent: 0, payees: [{ id: 'a', share: 1 }]}))
      .toThrow('non-negative total');
  });

  it('rejects a fee percent below 0 or above 100.', (): void => {
    const payees = [{ id: 'a', share: 1 }];
    expect((): unknown => splitPayment({ total: 10, feePercent: -1, payees })).toThrow('fee percent');
    expect((): unknown => splitPayment({ total: 10, feePercent: 101, payees })).toThrow('fee percent');
  });

  it('rejects an empty payee list.', (): void => {
    expect((): unknown => splitPayment({ total: 10, feePercent: 0, payees: []})).toThrow('at least one payee');
  });

  it('rejects a payee with a non-positive share.', (): void => {
    const payees = [{ id: 'a', share: 0 }];
    expect((): unknown => splitPayment({ total: 10, feePercent: 0, payees })).toThrow('positive share');
  });
});
