import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * FSANZ / EU standard allergen categories.
 * @see https://www.foodstandards.gov.au/consumer/foodallergies
 */
export const ALLERGEN_CATEGORIES = [
  'gluten',
  'crustacea',
  'egg',
  'fish',
  'milk',
  'tree-nuts',
  'peanuts',
  'sesame',
  'soy',
  'sulphites',
] as const;

export type AllergenCategory = typeof ALLERGEN_CATEGORIES[number];

/**
 * Dietary restriction types beyond allergens.
 */
export const DIETARY_RESTRICTIONS = [
  'vegetarian',
  'vegan',
  'halal',
  'kosher',
  'low-fodmap',
  'diabetic',
  'low-sodium',
  'gluten-free',
  'lactose-free',
] as const;

export type DietaryRestriction = typeof DIETARY_RESTRICTIONS[number];

/**
 * Input for a consumer allergy/dietary profile.
 * The profile is person-owned — stored in the consumer's pod and shared
 * minimally with retailers via selective disclosure.
 */
export interface AllergyProfileInput {
  readonly id: string;
  readonly person: string;
  readonly allergens: readonly AllergenCategory[];
  readonly dietaryRestrictions: readonly DietaryRestriction[];
  readonly accessibilityNeeds?: readonly string[];
  readonly updatedAt: string;
}

export interface AllergyProfileResult {
  readonly record: Record<string, unknown>;
  readonly allergenSet: Set<AllergenCategory>;
  readonly dietarySet: Set<DietaryRestriction>;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`An allergy profile ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`An allergy profile ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`An allergy profile ${field} must be a valid date.`);
  }
  return value;
}

function requireAllergenCategory(value: string): AllergenCategory {
  if (!ALLERGEN_CATEGORIES.includes(value as AllergenCategory)) {
    throw new BadRequestHttpError(
      `Allergen category "${value}" is not recognised. Valid: ${ALLERGEN_CATEGORIES.join(', ')}.`,
    );
  }
  return value as AllergenCategory;
}

function requireDietaryRestriction(value: string): DietaryRestriction {
  if (!DIETARY_RESTRICTIONS.includes(value as DietaryRestriction)) {
    throw new BadRequestHttpError(
      `Dietary restriction "${value}" is not recognised. Valid: ${DIETARY_RESTRICTIONS.join(', ')}.`,
    );
  }
  return value as DietaryRestriction;
}

/**
 * Build a consumer allergy/dietary profile as schema.org JSON-LD.
 * The profile uses schema.org `Person` with `knowsAbout` for allergens
 * and DPV for the legal basis of processing allergy data.
 */
export function buildAllergyProfile(input: AllergyProfileInput): AllergyProfileResult {
  const id = requireUri(input.id, 'id');
  const person = requireUri(input.person, 'person');
  const updatedAt = requireDate(input.updatedAt, 'updatedAt');

  const allergens = input.allergens.map(requireAllergenCategory);
  const dietary = input.dietaryRestrictions.map(requireDietaryRestriction);

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://w3id.org/dpv' ],
    [LD_TYPE]: [ 'Person', 'AllergyProfile' ],
    [LD_ID]: id,
    about: { [LD_ID]: person },
    knowsAbout: allergens,
    dietaryRestriction: dietary,
    dateModified: updatedAt,
    'dpv:hasLegalBasis': { [LD_TYPE]: 'dpv:Consent', [LD_ID]: `${id}#consent` },
  };

  if (input.accessibilityNeeds && input.accessibilityNeeds.length > 0) {
    record.accessibilityHazard = input.accessibilityNeeds;
  }

  return {
    record,
    allergenSet: new Set(allergens),
    dietarySet: new Set(dietary),
  };
}

/**
 * Check if a person's profile contains a specific allergen.
 */
export function hasAllergen(profile: AllergyProfileResult, allergen: AllergenCategory): boolean {
  return profile.allergenSet.has(allergen);
}

/**
 * Check if a person's profile has a specific dietary restriction.
 */
export function hasDietaryRestriction(profile: AllergyProfileResult, restriction: DietaryRestriction): boolean {
  return profile.dietarySet.has(restriction);
}
