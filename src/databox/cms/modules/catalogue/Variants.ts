import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface ProductOption {
  readonly name: string;
  readonly values: readonly string[];
}

export interface VariantInput {
  readonly productId: string;
  readonly options: readonly ProductOption[];
}

export interface Variant {
  readonly sku: string;
  readonly options: Record<string, string>;
}

/**
 * Expand a product's options into the full variant / SKU matrix — the cartesian product of option values
 * (clothing/footwear: size × colour × fit; see `databox/solid-cms-plan.md`, §11 / §12.3). Pure and
 * deterministic; each variant carries a stable SKU and its option selection.
 */
export function buildVariants(input: VariantInput): Variant[] {
  if (input.productId.trim().length === 0) {
    throw new BadRequestHttpError('A variant set needs a product id.');
  }
  if (input.options.length === 0) {
    throw new BadRequestHttpError('A variant set needs at least one option.');
  }
  for (const option of input.options) {
    if (option.name.trim().length === 0 || option.values.length === 0) {
      throw new BadRequestHttpError('Each option needs a name and at least one value.');
    }
  }

  let combinations: Record<string, string>[] = [{}];
  for (const option of input.options) {
    const expanded: Record<string, string>[] = [];
    for (const combination of combinations) {
      for (const value of option.values) {
        expanded.push({ ...combination, [option.name]: value });
      }
    }
    combinations = expanded;
  }

  return combinations.map((options): Variant => ({
    sku: `${input.productId}-${Object.values(options).join('-')}`,
    options,
  }));
}
