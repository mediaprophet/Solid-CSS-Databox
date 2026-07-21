import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { AllergyProfileInput } from './AllergyProfile';
import { buildAllergyProfile } from './AllergyProfile';
import type { IngredientDeclarationInput } from './IngredientDeclaration';
import { buildIngredientDeclaration } from './IngredientDeclaration';
import { matchAllergens, batchMatchAllergens, checkSelectiveDisclosure } from './AllergenMatcher';
import type { SelectiveDisclosureAttestation } from './AllergenMatcher';

export function registerAllergyProfileRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/allergy-profile/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildAllergyProfile(input as AllergyProfileInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid allergy profile request.' });
    }
  });

  router.register('POST', '/ingredients/declare', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildIngredientDeclaration(input as IngredientDeclarationInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid ingredient declaration request.' });
    }
  });

  router.register('POST', '/allergens/match', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ profile: AllergyProfileInput; declaration: IngredientDeclarationInput }>(request);
      const profile = buildAllergyProfile(input.profile);
      const declaration = buildIngredientDeclaration(input.declaration);
      const result = matchAllergens(profile, declaration);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid allergen match request.' });
    }
  });

  router.register('POST', '/allergens/batch-match', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ profile: AllergyProfileInput; declarations: IngredientDeclarationInput[] }>(request);
      const profile = buildAllergyProfile(input.profile);
      const declarations = input.declarations.map((d) => buildIngredientDeclaration(d));
      const results = batchMatchAllergens(profile, declarations);
      writeJson(response, 200, { results }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid batch match request.' });
    }
  });

  router.register('POST', '/allergens/selective-disclosure', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ profile: AllergyProfileInput; attestation: SelectiveDisclosureAttestation }>(request);
      const profile = buildAllergyProfile(input.profile);
      const result = checkSelectiveDisclosure(profile, input.attestation);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid selective disclosure request.' });
    }
  });
}
