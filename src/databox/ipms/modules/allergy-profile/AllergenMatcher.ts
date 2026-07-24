import type { AllergenCategory, AllergyProfileResult } from './AllergyProfile';
import type { IngredientDeclarationResult } from './IngredientDeclaration';

export interface AllergenMatchResult {
  readonly menuItem: string;
  readonly safe: boolean;
  readonly conflictingAllergens: AllergenCategory[];
  readonly mayContainWarnings: AllergenCategory[];
  readonly dietaryViolations: string[];
  readonly reason: string;
}

/**
 * Cross-reference a consumer's allergy profile against a retailer's
 * ingredient declaration. Returns whether the item is safe for the
 * consumer, along with detailed conflict information.
 *
 * This is the core allergen matching engine (P3-04).
 */
export function matchAllergens(
  profile: AllergyProfileResult,
  declaration: IngredientDeclarationResult,
): AllergenMatchResult {
  const conflictingAllergens: AllergenCategory[] = [];
  const mayContainWarnings: AllergenCategory[] = [];

  for (const allergen of profile.allergenSet) {
    if (declaration.declaredAllergens.has(allergen)) {
      conflictingAllergens.push(allergen);
    }
    if (declaration.mayContainAllergens.has(allergen)) {
      mayContainWarnings.push(allergen);
    }
  }

  const dietaryViolations: string[] = [];
  for (const restriction of profile.dietarySet) {
    if (restriction === 'vegan' && !declaration.vegan) {
      dietaryViolations.push('vegan');
    }
    if (restriction === 'vegetarian' && !declaration.vegetarian) {
      dietaryViolations.push('vegetarian');
    }
    if (restriction === 'gluten-free' && declaration.declaredAllergens.has('gluten')) {
      dietaryViolations.push('gluten-free');
    }
    if (restriction === 'lactose-free' && declaration.declaredAllergens.has('milk')) {
      dietaryViolations.push('lactose-free');
    }
  }

  const safe = conflictingAllergens.length === 0 && dietaryViolations.length === 0;

  const reasons: string[] = [];
  if (conflictingAllergens.length > 0) {
    reasons.push(`Contains allergens: ${conflictingAllergens.join(', ')}`);
  }
  if (mayContainWarnings.length > 0) {
    reasons.push(`May contain: ${mayContainWarnings.join(', ')}`);
  }
  if (dietaryViolations.length > 0) {
    reasons.push(`Dietary violations: ${dietaryViolations.join(', ')}`);
  }
  if (reasons.length === 0) {
    reasons.push('No allergen or dietary conflicts detected.');
  }

  return {
    menuItem: declaration.record.about as string,
    safe,
    conflictingAllergens,
    mayContainWarnings,
    dietaryViolations,
    reason: reasons.join('; '),
  };
}

/**
 * Batch-match multiple ingredient declarations against a single consumer profile.
 * Returns sorted results: safe items first, then warnings, then unsafe.
 */
export function batchMatchAllergens(
  profile: AllergyProfileResult,
  declarations: IngredientDeclarationResult[],
): AllergenMatchResult[] {
  return declarations
    .map(decl => matchAllergens(profile, decl))
    .sort((a, b) => {
      if (a.safe && !b.safe) {
        return -1;
      }
      if (!a.safe && b.safe) {
        return 1;
      }
      if (a.mayContainWarnings.length === 0 && b.mayContainWarnings.length > 0) {
        return -1;
      }
      if (a.mayContainWarnings.length > 0 && b.mayContainWarnings.length === 0) {
        return 1;
      }
      return 0;
    });
}

/**
 * Selective disclosure check — determines if a "secret recipe" item is safe
 * for a consumer's allergens without revealing the full ingredient list.
 * The retailer provides an attestation of allergen presence/absence.
 */
export interface SelectiveDisclosureAttestation {
  readonly menuItem: string;
  readonly declaredSafeFor: readonly AllergenCategory[];
  readonly declaredUnsafeFor: readonly AllergenCategory[];
  readonly attestedBy: string;
  readonly attestedAt: string;
}

export function checkSelectiveDisclosure(
  profile: AllergyProfileResult,
  attestation: SelectiveDisclosureAttestation,
): { safe: boolean; reason: string } {
  const unsafeFor = new Set(attestation.declaredUnsafeFor);
  const safeFor = new Set(attestation.declaredSafeFor);

  const conflicts: AllergenCategory[] = [];
  const unverified: AllergenCategory[] = [];

  for (const allergen of profile.allergenSet) {
    if (unsafeFor.has(allergen)) {
      conflicts.push(allergen);
    } else if (!safeFor.has(allergen)) {
      unverified.push(allergen);
    }
  }

  if (conflicts.length > 0) {
    return {
      safe: false,
      reason: `Item is declared unsafe for: ${conflicts.join(', ')}.`,
    };
  }
  if (unverified.length > 0) {
    return {
      safe: false,
      reason: `Item safety unverified for: ${unverified.join(', ')}. Ask retailer for attestation.`,
    };
  }
  return {
    safe: true,
    reason: 'Item is attested safe for all your declared allergens.',
  };
}
