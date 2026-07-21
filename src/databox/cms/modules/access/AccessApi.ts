import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { evaluateAccess } from './CredentialGate';
import type { AccessPolicy, PresentedCredential } from './CredentialGate';

function assertAccessPolicy(policy: unknown): asserts policy is AccessPolicy {
  if (
    !isRecord(policy) ||
    typeof (policy as Record<string, unknown>).resource !== 'string' ||
    !Array.isArray((policy as Record<string, unknown>).acceptedIssuers) ||
    typeof (policy as Record<string, unknown>).requiredClaim !== 'string'
  ) {
    throw new TypeError('An access policy needs resource, acceptedIssuers array, and requiredClaim.');
  }
  for (const issuer of (policy as Record<string, unknown>).acceptedIssuers as unknown[]) {
    if (typeof issuer !== 'string') throw new TypeError('Each acceptedIssuer must be a string.');
  }
}

function assertPresentedCredential(cred: unknown): asserts cred is PresentedCredential {
  if (
    !isRecord(cred) ||
    typeof (cred as Record<string, unknown>).issuer !== 'string' ||
    !isRecord((cred as Record<string, unknown>).claims) ||
    typeof (cred as Record<string, unknown>).expired !== 'boolean'
  ) {
    throw new TypeError('A presented credential needs issuer, claims object, and expired boolean.');
  }
}

export function registerAccessRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/access/evaluate', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      if (!isRecord(body) || !isRecord((body as Record<string, unknown>).policy) || !isRecord((body as Record<string, unknown>).credential)) {
        throw new TypeError('An evaluate request needs policy and credential objects.');
      }
      
      const policy = (body as Record<string, unknown>).policy as unknown;
      const credential = (body as Record<string, unknown>).credential as unknown;
      
      assertAccessPolicy(policy);
      assertPresentedCredential(credential);
      
      const decision = evaluateAccess(policy, credential);
      writeJson(response, 200, decision);
    } catch (error: unknown) {
      writeJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : 'Invalid access evaluation request.',
      });
    }
  });
}
