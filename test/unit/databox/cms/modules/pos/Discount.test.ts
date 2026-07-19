import { applyDiscount } from '../../../../../../src/databox/cms/modules/pos/Discount';
import { BadRequestHttpError } from '../../../../../../src/util/errors/BadRequestHttpError';

describe('applyDiscount', (): void => {
  it('applies a percent discount to the subtotal.', (): void => {
    const result = applyDiscount({ subtotal: 200, type: 'percent', value: 10 });
    expect(result).toStrictEqual({ discount: 20, total: 180 });
  });

  it('applies a fixed discount to the subtotal.', (): void => {
    const result = applyDiscount({ subtotal: 200, type: 'fixed', value: 30 });
    expect(result).toStrictEqual({ discount: 30, total: 170 });
  });

  it('throws when subtotal is not greater than 0.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 0, type: 'percent', value: 10 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a percent discount value is below 0.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'percent', value: -1 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a percent discount value is above 100.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'percent', value: 101 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a fixed discount value is below 0.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'fixed', value: -1 });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when a fixed discount value is greater than the subtotal.', (): void => {
    expect((): void => {
      applyDiscount({ subtotal: 100, type: 'fixed', value: 101 });
    }).toThrow(BadRequestHttpError);
  });
});
