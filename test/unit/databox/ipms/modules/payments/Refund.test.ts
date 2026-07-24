import { computeRefund } from '../../../../../../src/databox/ipms/modules/payments/Refund';

describe('computeRefund', (): void => {
  it('computes a partial refund, leaving the rest of the total remaining.', (): void => {
    const result = computeRefund({ originalTotal: 100, refundAmount: 40 });
    expect(result).toEqual({ refundAmount: 40, remaining: 60, full: false });
  });

  it('computes a full refund, leaving nothing remaining.', (): void => {
    const result = computeRefund({ originalTotal: 100, refundAmount: 100 });
    expect(result).toEqual({ refundAmount: 100, remaining: 0, full: true });
  });

  it('rounds the refund amount and the remaining amount to two decimal places.', (): void => {
    const result = computeRefund({ originalTotal: 10, refundAmount: 3.333 });
    expect(result).toEqual({ refundAmount: 3.33, remaining: 6.67, full: false });
  });

  it('rejects a non-positive original total.', (): void => {
    expect((): unknown => computeRefund({ originalTotal: 0, refundAmount: 1 }))
      .toThrow('positive original total');
    expect((): unknown => computeRefund({ originalTotal: -5, refundAmount: 1 }))
      .toThrow('positive original total');
  });

  it('rejects a non-positive refund amount.', (): void => {
    expect((): unknown => computeRefund({ originalTotal: 10, refundAmount: 0 }))
      .toThrow('positive refund amount');
    expect((): unknown => computeRefund({ originalTotal: 10, refundAmount: -1 }))
      .toThrow('positive refund amount');
  });

  it('rejects a refund amount greater than the original total.', (): void => {
    expect((): unknown => computeRefund({ originalTotal: 10, refundAmount: 10.01 }))
      .toThrow('cannot exceed the original total');
  });
});
