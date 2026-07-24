import { aggregateReputation } from '../../../../../../src/databox/ipms/modules/reputation/Reputation';

describe('aggregateReputation', (): void => {
  it('computes the count and rounded average rating of multiple reviews.', (): void => {
    const result = aggregateReputation({ reviews: [
      { rating: 5 },
      { rating: 4 },
      { rating: 4 },
    ]});

    expect(result).toEqual({ count: 3, average: 4.3 });
  });

  it('throws a BadRequestHttpError when there are no reviews.', (): void => {
    expect((): void => {
      aggregateReputation({ reviews: []});
    }).toThrow('At least one review is required to aggregate reputation.');
  });

  it('throws a BadRequestHttpError when a rating is below 1.', (): void => {
    expect((): void => {
      aggregateReputation({ reviews: [{ rating: 0.5 }]});
    }).toThrow('Review rating must be between 1 and 5.');
  });

  it('throws a BadRequestHttpError when a rating is above 5.', (): void => {
    expect((): void => {
      aggregateReputation({ reviews: [{ rating: 6 }]});
    }).toThrow('Review rating must be between 1 and 5.');
  });
});
