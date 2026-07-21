import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import type { AllergenCategory } from './AllergyProfile';
import { ALLERGEN_CATEGORIES } from './AllergyProfile';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * Input for a single ingredient in a retailer ingredient declaration.
 */
export interface IngredientInput {
  readonly name: string;
  readonly containsAllergens?: readonly AllergenCategory[];
  readonly mayContainAllergens?: readonly AllergenCategory[];
  readonly isFreeFrom?: readonly string[];
  readonly vegan?: boolean;
  readonly vegetarian?: boolean;
}

/**
 * Input for a retailer ingredient declaration for a menu/catalogue item.
 */
export interface IngredientDeclarationInput {
  readonly id: string;
  readonly menuItem: string;
  readonly organisation: string;
  readonly ingredients: readonly IngredientInput[];
  readonly declaredAt: string;
  readonly secretRecipe?: boolean;
}

export interface IngredientDeclarationResult {
  readonly record: Record<string, unknown>;
  readonly declaredAllergens: Set<AllergenCategory>;
  readonly mayContainAllergens: Set<AllergenCategory>;
  readonly freeFrom: Set<string>;
  readonly vegan: boolean;
  readonly vegetarian: boolean;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`An ingredient declaration ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`An ingredient declaration ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`An ingredient declaration ${field} must be a valid date.`);
  }
  return value;
}

function requireAllergen(value: string): AllergenCategory {
  if (!ALLERGEN_CATEGORIES.includes(value as AllergenCategory)) {
    throw new BadRequestHttpError(`Allergen "${value}" is not a recognised category.`);
  }
  return value as AllergenCategory;
}

/**
 * Build a retailer ingredient declaration as schema.org JSON-LD.
 * Uses schema.org `Recipe` with `recipeIngredient` and custom allergen
 * extensions aligned with FSANZ/EU categories.
 */
export function buildIngredientDeclaration(input: IngredientDeclarationInput): IngredientDeclarationResult {
  const id = requireUri(input.id, 'id');
  const menuItem = requireUri(input.menuItem, 'menuItem');
  const organisation = requireUri(input.organisation, 'organisation');
  const declaredAt = requireDate(input.declaredAt, 'declaredAt');

  if (input.ingredients.length === 0) {
    throw new BadRequestHttpError('An ingredient declaration must include at least one ingredient.');
  }

  const declaredAllergens = new Set<AllergenCategory>();
  const mayContainAllergens = new Set<AllergenCategory>();
  const freeFrom = new Set<string>();
  let vegan = true;
  let vegetarian = true;

  const ingredientRecords = input.ingredients.map((ing, i) => {
    const name = requireNonEmpty(ing.name, `ingredient[${i}].name`);

    if (ing.containsAllergens) {
      for (const a of ing.containsAllergens) {
        declaredAllergens.add(requireAllergen(a));
      }
    }
    if (ing.mayContainAllergens) {
      for (const a of ing.mayContainAllergens) {
        mayContainAllergens.add(requireAllergen(a));
      }
    }
    if (ing.isFreeFrom) {
      for (const f of ing.isFreeFrom) {
        freeFrom.add(requireNonEmpty(f, `freeFrom[${i}]`));
      }
    }
    if (ing.vegan === false) vegan = false;
    if (ing.vegetarian === false) vegetarian = false;

    const record: Record<string, unknown> = {
      [LD_TYPE]: 'Ingredient',
      name,
    };
    if (ing.containsAllergens && ing.containsAllergens.length > 0) {
      record.containsAllergen = ing.containsAllergens;
    }
    if (ing.mayContainAllergens && ing.mayContainAllergens.length > 0) {
      record.mayContainAllergen = ing.mayContainAllergens;
    }
    if (ing.isFreeFrom && ing.isFreeFrom.length > 0) {
      record.isFreeFrom = ing.isFreeFrom;
    }
    return record;
  });

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://w3id.org/dpv' ],
    [LD_TYPE]: [ 'Recipe', 'IngredientDeclaration' ],
    [LD_ID]: id,
    name: `Ingredients for ${menuItem}`,
    about: { [LD_ID]: menuItem },
    author: { [LD_ID]: organisation },
    recipeIngredient: ingredientRecords.map((r) => r.name),
    ingredient: ingredientRecords,
    datePublished: declaredAt,
    declaredAllergens: [ ...declaredAllergens ],
    mayContainAllergens: [ ...mayContainAllergens ],
    isVegan: vegan,
    isVegetarian: vegetarian,
  };

  if (freeFrom.size > 0) {
    record.isFreeFrom = [ ...freeFrom ];
  }
  if (input.secretRecipe) {
    record.secretRecipe = true;
  }

  return { record, declaredAllergens, mayContainAllergens, freeFrom, vegan, vegetarian };
}
