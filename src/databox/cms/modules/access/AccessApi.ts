import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { errorStatusCode, isRecord, readJsonBody, writeJson } from '../../CmsHttpUtils';
import { evaluateAccess } from './CredentialGate';
import type { AccessPolicy, PresentedCredential } from './CredentialGate';

function assertAccessPolicy(policy: unknown): asserts policy is AccessPolicy {
  if (
    !isRecord(policy) ||
    typeof policy.resource !== 'string' ||
    !Array.isArray(policy.acceptedIssuers) ||
    typeof policy.requiredClaim !== 'string'
  ) {
    throw new TypeError('An access policy needs resource, acceptedIssuers array, and requiredClaim.');
  }
  for (const issuer of policy.acceptedIssuers as unknown[]) {
    if (typeof issuer !== 'string') {
      throw new TypeError('Each acceptedIssuer must be a string.');
    }
  }
}

function assertPresentedCredential(cred: unknown): asserts cred is PresentedCredential {
  if (
    !isRecord(cred) ||
    typeof cred.issuer !== 'string' ||
    !isRecord(cred.claims) ||
    typeof cred.expired !== 'boolean'
  ) {
    throw new TypeError('A presented credential needs issuer, claims object, and expired boolean.');
  }
}

export function registerAccessRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/access/evaluate', async({ request, response }): Promise<void> => {
    try {
      const body = await readJsonBody<Record<string, unknown>>(request);
      if (!isRecord(body) || !isRecord(body.policy) || !isRecord(body.credential)) {
        throw new TypeError('An evaluate request needs policy and credential objects.');
      }

      const policy = body.policy;
      const credential = body.credential;

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
