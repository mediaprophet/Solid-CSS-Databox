import { wholesalePrice } from '../../../../../../src/databox/cms/modules/pricing/Wholesale';
import { BadRequestHttpError } from '../../../../../../src/util/errors/BadRequestHttpError';

describe('wholesalePrice', (): void => {
  it('throws when quantity is not greater than 0.', (): void => {
    expect((): void => {
      wholesalePrice({
        quantity: 0,
        moq: 1,
        tiers: [
          { minQuantity: 1, unitPrice: 10 },
        ],
      });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when there are no price tiers.', (): void => {
    expect((): void => {
      wholesalePrice({
        quantity: 5,
        moq: 1,
        tiers: [],
      });
    }).toThrow(BadRequestHttpError);
  });

  it('throws when quantity is below the minimum order quantity.', (): void => {
    expect((): void => {
      wholesalePrice({
        quantity: 3,
        moq: 5,
        tiers: [
          { minQuantity: 1, unitPrice: 10 },
        ],
      });
    }).toThrow(BadRequestHttpError);
  });

  it('picks the best applicable mid-range tier.', (): void => {
    const result = wholesalePrice({
      quantity: 50,
      moq: 1,
      tiers: [
        { minQuantity: 1, unitPrice: 10 },
        { minQuantity: 10, unitPrice: 8 },
        { minQuantity: 100, unitPrice: 5 },
      ],
    });
    expect(result).toStrictEqual({ unitPrice: 8, total: 400 });
  });

  it('selects a tier whose minQuantity exactly equals the quantity.', (): void => {
    const result = wholesalePrice({
      quantity: 10,
      moq: 1,
      tiers: [
        { minQuantity: 1, unitPrice: 10 },
        { minQuantity: 10, unitPrice: 8 },
        { minQuantity: 100, unitPrice: 5 },
      ],
    });
    expect(result).toStrictEqual({ unitPrice: 8, total: 80 });
  });

  it('ignores an earlier-encountered tier that is not higher than the current best.', (): void => {
    const result = wholesalePrice({
      quantity: 50,
      moq: 1,
      tiers: [
        { minQuantity: 10, unitPrice: 8 },
        { minQuantity: 1, unitPrice: 10 },
      ],
    });
    expect(result).toStrictEqual({ unitPrice: 8, total: 400 });
  });

  it('throws when no tier is applicable to the quantity.', (): void => {
    expect((): void => {
      wholesalePrice({
        quantity: 5,
        moq: 1,
        tiers: [
          { minQuantity: 10, unitPrice: 8 },
        ],
      });
    }).toThrow(BadRequestHttpError);
  });
});
