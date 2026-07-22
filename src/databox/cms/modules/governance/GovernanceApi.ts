import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type { ApprovalGateInput, OdrlPolicyInput, RoleBindingInput } from './Governance';
import type { ResolutionInput } from './Resolution';
import { bindRole, buildOdrlPolicy, recordApprovalGate } from './Governance';
import { recordResolution } from './Resolution';

export function registerGovernanceRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/governance/role/bind', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, bindRole(input as RoleBindingInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid role binding.' });
    }
  });

  router.register('POST', '/governance/odrl/policy', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildOdrlPolicy(input as OdrlPolicyInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid ODRL policy.' });
    }
  });

  router.register(
    'POST',
    '/governance/approval-gate',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        writeJson(response, 200, recordApprovalGate(input as ApprovalGateInput), 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid approval gate.' });
      }
    },
  );

  router.register('POST', '/governance/resolution', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = recordResolution(input as ResolutionInput);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid resolution.' });
    }
  });
}
