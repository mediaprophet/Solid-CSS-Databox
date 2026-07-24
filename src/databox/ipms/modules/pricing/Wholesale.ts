import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

/**
 * A single wholesale pricing tier: quantities at or above `minQuantity` are eligible
 * for `unitPrice`.
 */
export interface PriceTier {
  readonly minQuantity: number;
  readonly unitPrice: number;
}

/**
 * Input for computing a wholesale/B2B tiered price.
 */
export interface WholesaleInput {
  readonly quantity: number;
  readonly moq: number;
  readonly tiers: readonly PriceTier[];
}

/**
 * The resolved wholesale price for a given quantity.
 */
export interface WholesaleResult {
  readonly unitPrice: number;
  readonly total: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolves wholesale/B2B tiered pricing with a minimum order quantity (MOQ).
 *
 * The applicable tier is the one with the highest `minQuantity` that is still
 * less than or equal to the requested `quantity`.
 */
export function wholesalePrice(input: WholesaleInput): WholesaleResult {
  const { quantity, moq, tiers } = input;

  if (quantity <= 0) {
    throw new BadRequestHttpError('Quantity must be greater than 0.');
  }
  if (tiers.length === 0) {
    throw new BadRequestHttpError('At least one price tier is required.');
  }
  if (quantity < moq) {
    throw new BadRequestHttpError(`Quantity must be at least the minimum order quantity of ${moq}.`);
  }

  let bestTier: PriceTier | undefined;
  for (const tier of tiers) {
    if (tier.minQuantity <= quantity && (!bestTier || tier.minQuantity > bestTier.minQuantity)) {
      bestTier = tier;
    }
  }

  if (!bestTier) {
    throw new BadRequestHttpError('No applicable price tier was found for the given quantity.');
  }

  return {
    unitPrice: bestTier.unitPrice,
    total: round2(bestTier.unitPrice * quantity),
  };
}
