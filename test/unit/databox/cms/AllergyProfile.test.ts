import {
  buildAllergyProfile,
  hasAllergen,
  hasDietaryRestriction,
  ALLERGEN_CATEGORIES,
} from '../../../../src/databox/cms/modules/allergy-profile/AllergyProfile';
import {
  buildIngredientDeclaration,
} from '../../../../src/databox/cms/modules/allergy-profile/IngredientDeclaration';
import {
  matchAllergens,
  batchMatchAllergens,
  checkSelectiveDisclosure,
} from '../../../../src/databox/cms/modules/allergy-profile/AllergenMatcher';
import type { AllergyProfileInput, AllergenCategory } from '../../../../src/databox/cms/modules/allergy-profile/AllergyProfile';
import type { IngredientDeclarationInput } from '../../../../src/databox/cms/modules/allergy-profile/IngredientDeclaration';

describe('Allergy & Ingredient Safety module', () => {
  const profileInput: AllergyProfileInput = {
    id: 'https://databox.example.org/profiles/alice-allergies',
    person: 'https://databox.example.org/members/alice',
    allergens: [ 'peanuts', 'tree-nuts', 'milk' ],
    dietaryRestrictions: [ 'vegetarian' ],
    updatedAt: '2025-07-01T10:00:00Z',
  };

  const declarationInput: IngredientDeclarationInput = {
    id: 'https://databox.example.org/ingredients/dish-001',
    menuItem: 'https://databox.example.org/menu/chicken-curry',
    organisation: 'https://databox.example.org/org/restaurant',
    ingredients: [
      { name: 'chicken breast', vegetarian: false },
      { name: 'coconut milk', containsAllergens: [ 'milk' as AllergenCategory ] },
      { name: 'peanut oil', containsAllergens: [ 'peanuts' as AllergenCategory ] },
      { name: 'rice' },
    ],
    declaredAt: '2025-07-01T12:00:00Z',
  };

  describe('buildAllergyProfile', () => {
    it('builds a valid allergy profile', () => {
      const result = buildAllergyProfile(profileInput);
      expect(result.record['@type']).toContain('Person');
      expect(result.record['@type']).toContain('AllergyProfile');
      expect(result.record.knowsAbout).toEqual([ 'peanuts', 'tree-nuts', 'milk' ]);
      expect(result.record.dietaryRestriction).toEqual([ 'vegetarian' ]);
      expect(result.allergenSet.has('peanuts')).toBe(true);
      expect(result.dietarySet.has('vegetarian')).toBe(true);
    });

    it('includes accessibility needs when provided', () => {
      const result = buildAllergyProfile({
        ...profileInput,
        accessibilityNeeds: [ 'large-print', 'screen-reader' ],
      });
      expect(result.record.accessibilityHazard).toEqual([ 'large-print', 'screen-reader' ]);
    });

    it('rejects invalid allergen category', () => {
      expect(() => buildAllergyProfile({
        ...profileInput,
        allergens: [ 'platinum' as AllergenCategory ],
      })).toThrow('not recognised');
    });

    it('rejects invalid dietary restriction', () => {
      expect(() => buildAllergyProfile({
        ...profileInput,
        dietaryRestrictions: [ 'carnivore' as any ],
      })).toThrow('not recognised');
    });

    it('rejects non-URI id', () => {
      expect(() => buildAllergyProfile({ ...profileInput, id: 'bad' }))
        .toThrow('must be an absolute URI');
    });

    it('rejects invalid date', () => {
      expect(() => buildAllergyProfile({ ...profileInput, updatedAt: 'not-a-date' }))
        .toThrow('must be a valid date');
    });

    it('exports all 10 FSANZ allergen categories', () => {
      expect(ALLERGEN_CATEGORIES).toHaveLength(10);
      expect(ALLERGEN_CATEGORIES).toContain('gluten');
      expect(ALLERGEN_CATEGORIES).toContain('sulphites');
    });
  });

  describe('hasAllergen / hasDietaryRestriction', () => {
    const profile = buildAllergyProfile(profileInput);

    it('checks allergen presence', () => {
      expect(hasAllergen(profile, 'peanuts')).toBe(true);
      expect(hasAllergen(profile, 'fish')).toBe(false);
    });

    it('checks dietary restriction presence', () => {
      expect(hasDietaryRestriction(profile, 'vegetarian')).toBe(true);
      expect(hasDietaryRestriction(profile, 'vegan')).toBe(false);
    });
  });

  describe('buildIngredientDeclaration', () => {
    it('builds a valid ingredient declaration', () => {
      const result = buildIngredientDeclaration(declarationInput);
      expect(result.record['@type']).toContain('Recipe');
      expect(result.record['@type']).toContain('IngredientDeclaration');
      expect(result.declaredAllergens.has('peanuts')).toBe(true);
      expect(result.declaredAllergens.has('milk')).toBe(true);
      expect(result.vegetarian).toBe(false);
    });

    it('rejects empty ingredients list', () => {
      expect(() => buildIngredientDeclaration({
        ...declarationInput,
        ingredients: [],
      })).toThrow('at least one ingredient');
    });

    it('rejects invalid allergen in ingredient', () => {
      expect(() => buildIngredientDeclaration({
        ...declarationInput,
        ingredients: [
          { name: 'mystery', containsAllergens: [ 'platinum' as AllergenCategory ] },
        ],
      })).toThrow('not a recognised category');
    });

    it('tracks may-contain allergens', () => {
      const result = buildIngredientDeclaration({
        ...declarationInput,
        ingredients: [
          { name: 'chocolate', mayContainAllergens: [ 'tree-nuts' as AllergenCategory ] },
        ],
      });
      expect(result.mayContainAllergens.has('tree-nuts')).toBe(true);
      expect(result.declaredAllergens.has('tree-nuts')).toBe(false);
    });

    it('tracks free-from claims', () => {
      const result = buildIngredientDeclaration({
        ...declarationInput,
        ingredients: [
          { name: 'rice', isFreeFrom: [ 'gluten', 'dairy' ] },
        ],
      });
      expect(result.freeFrom.has('gluten')).toBe(true);
      expect(result.freeFrom.has('dairy')).toBe(true);
    });

    it('marks secret recipe flag', () => {
      const result = buildIngredientDeclaration({
        ...declarationInput,
        secretRecipe: true,
      });
      expect(result.record.secretRecipe).toBe(true);
    });
  });

  describe('matchAllergens', () => {
    it('detects conflicting allergens', () => {
      const profile = buildAllergyProfile(profileInput);
      const declaration = buildIngredientDeclaration(declarationInput);
      const result = matchAllergens(profile, declaration);

      expect(result.safe).toBe(false);
      expect(result.conflictingAllergens).toContain('peanuts');
      expect(result.conflictingAllergens).toContain('milk');
      expect(result.dietaryViolations).toContain('vegetarian');
    });

    it('returns safe for non-conflicting item', () => {
      const profile = buildAllergyProfile({
        ...profileInput,
        allergens: [ 'fish' as AllergenCategory ],
        dietaryRestrictions: [],
      });
      const declaration = buildIngredientDeclaration({
        ...declarationInput,
        ingredients: [
          { name: 'rice', vegan: true, vegetarian: true },
          { name: 'vegetables', vegan: true, vegetarian: true },
        ],
      });
      const result = matchAllergens(profile, declaration);

      expect(result.safe).toBe(true);
      expect(result.conflictingAllergens).toHaveLength(0);
    });

    it('detects may-contain warnings without marking unsafe', () => {
      const profile = buildAllergyProfile({
        ...profileInput,
        allergens: [ 'tree-nuts' as AllergenCategory ],
        dietaryRestrictions: [],
      });
      const declaration = buildIngredientDeclaration({
        ...declarationInput,
        ingredients: [
          { name: 'chocolate', mayContainAllergens: [ 'tree-nuts' as AllergenCategory ], vegetarian: true },
        ],
      });
      const result = matchAllergens(profile, declaration);

      expect(result.safe).toBe(true);
      expect(result.mayContainWarnings).toContain('tree-nuts');
    });

    it('detects gluten-free dietary violation', () => {
      const profile = buildAllergyProfile({
        ...profileInput,
        allergens: [],
        dietaryRestrictions: [ 'gluten-free' ],
      });
      const declaration = buildIngredientDeclaration({
        ...declarationInput,
        ingredients: [
          { name: 'wheat flour', containsAllergens: [ 'gluten' as AllergenCategory ], vegetarian: true },
        ],
      });
      const result = matchAllergens(profile, declaration);

      expect(result.safe).toBe(false);
      expect(result.dietaryViolations).toContain('gluten-free');
    });
  });

  describe('batchMatchAllergens', () => {
    it('sorts results with safe items first', () => {
      const profile = buildAllergyProfile({
        ...profileInput,
        allergens: [ 'peanuts' as AllergenCategory ],
        dietaryRestrictions: [],
      });
      const safeDecl = buildIngredientDeclaration({
        ...declarationInput,
        id: 'https://example.org/decl/safe',
        ingredients: [ { name: 'rice', vegetarian: true } ],
      });
      const unsafeDecl = buildIngredientDeclaration({
        ...declarationInput,
        id: 'https://example.org/decl/unsafe',
        ingredients: [ { name: 'peanut sauce', containsAllergens: [ 'peanuts' as AllergenCategory ], vegetarian: true } ],
      });
      const results = batchMatchAllergens(profile, [ unsafeDecl, safeDecl ]);

      expect(results[0].safe).toBe(true);
      expect(results[1].safe).toBe(false);
    });
  });

  describe('checkSelectiveDisclosure', () => {
    it('returns safe when attestation covers all allergens', () => {
      const profile = buildAllergyProfile({
        ...profileInput,
        allergens: [ 'peanuts', 'tree-nuts' ],
        dietaryRestrictions: [],
      });
      const result = checkSelectiveDisclosure(profile, {
        menuItem: 'https://example.org/menu/secret-dish',
        declaredSafeFor: [ 'peanuts', 'tree-nuts', 'egg' ],
        declaredUnsafeFor: [ 'milk' ],
        attestedBy: 'https://example.org/org/restaurant',
        attestedAt: '2025-07-01T12:00:00Z',
      });

      expect(result.safe).toBe(true);
      expect(result.reason).toContain('attested safe');
    });

    it('returns unsafe when attestation declares conflict', () => {
      const profile = buildAllergyProfile({
        ...profileInput,
        allergens: [ 'peanuts' ],
        dietaryRestrictions: [],
      });
      const result = checkSelectiveDisclosure(profile, {
        menuItem: 'https://example.org/menu/secret-dish',
        declaredSafeFor: [ 'tree-nuts' ],
        declaredUnsafeFor: [ 'peanuts' ],
        attestedBy: 'https://example.org/org/restaurant',
        attestedAt: '2025-07-01T12:00:00Z',
      });

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('declared unsafe');
    });

    it('returns unsafe when allergen is unverified', () => {
      const profile = buildAllergyProfile({
        ...profileInput,
        allergens: [ 'peanuts', 'fish' ],
        dietaryRestrictions: [],
      });
      const result = checkSelectiveDisclosure(profile, {
        menuItem: 'https://example.org/menu/secret-dish',
        declaredSafeFor: [ 'peanuts' ],
        declaredUnsafeFor: [],
        attestedBy: 'https://example.org/org/restaurant',
        attestedAt: '2025-07-01T12:00:00Z',
      });

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('unverified');
      expect(result.reason).toContain('fish');
    });
  });
});
