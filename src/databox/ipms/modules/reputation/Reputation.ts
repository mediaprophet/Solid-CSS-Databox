import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface Review { readonly rating: number }
export interface ReputationInput { readonly reviews: readonly Review[] }
export interface Reputation { readonly count: number; readonly average: number }

export function aggregateReputation(input: ReputationInput): Reputation {
  const { reviews } = input;
  if (reviews.length === 0) {
    throw new BadRequestHttpError('At least one review is required to aggregate reputation.');
  }

  let sum = 0;
  for (const review of reviews) {
    if (review.rating < 1 || review.rating > 5) {
      throw new BadRequestHttpError('Review rating must be between 1 and 5.');
    }
    sum += review.rating;
  }

  const count = reviews.length;
  const average = Math.round((sum / count) * 10) / 10;

  return { count, average };
}
