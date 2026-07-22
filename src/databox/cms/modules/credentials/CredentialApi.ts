import type { CmsModuleRouter } from '../../CmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../CmsHttpUtils';
import type {
  CredentialIssuanceInput,
  CredentialRevocationInput,
  CredentialVerificationInput,
} from './CredentialLifecycle';
import { issueCredential, revokeCredential, verifyCredential } from './CredentialLifecycle';

export function registerCredentialRoutes(router: CmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/credentials/issue', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, issueCredential(input as CredentialIssuanceInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Credential issuance failed.' });
    }
  });

  router.register('POST', '/credentials/verify', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = verifyCredential(input as CredentialVerificationInput);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Credential verification failed.' });
    }
  });

  router.register('POST', '/credentials/revoke', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, revokeCredential(input as CredentialRevocationInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Credential revocation failed.' });
    }
  });
}
