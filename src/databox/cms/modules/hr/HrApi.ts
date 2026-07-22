import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type {
  ComplianceCredentialInput,
  ExpenseClaimInput,
  OnboardingInput,
  PayslipInput,
  ShiftInput,
} from './Hr';
import {
  assignShift,
  generatePayslip,
  onboardEmployee,
  submitExpenseClaim,
  trackCompliance,
} from './Hr';

export function registerHrRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/hr/onboard', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, onboardEmployee(input as OnboardingInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid onboarding request.' });
    }
  });

  router.register('POST', '/hr/shift/assign', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, assignShift(input as ShiftInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid shift assignment.' });
    }
  });

  router.register('POST', '/hr/compliance/track', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, trackCompliance(input as ComplianceCredentialInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid compliance tracking request.',
      });
    }
  });

  router.register('POST', '/hr/payslip/generate', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, generatePayslip(input as PayslipInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid payslip request.' });
    }
  });

  router.register('POST', '/hr/expense/claim', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, submitExpenseClaim(input as ExpenseClaimInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid expense claim.' });
    }
  });
}
