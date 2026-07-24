import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { DeviceAuthInput, DeviceEnrolmentInput, DeviceRevocationInput } from './DeviceAuth';
import { enrolDevice, revokeDevice, verifyDeviceAuth } from './DeviceAuth';

export function registerDeviceAuthRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/device-auth/enrol', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, enrolDevice(input as DeviceEnrolmentInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid device enrolment request.' });
    }
  });

  router.register('POST', '/device-auth/verify', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ enrolled: DeviceEnrolmentInput; auth: DeviceAuthInput }>(request);
      const enrolled = enrolDevice(input.enrolled);
      // Simulate approval for verification — in production this checks the stored record
      const approvedEnrolled = { ...enrolled, status: 'enrolled' as const };
      const result = verifyDeviceAuth(approvedEnrolled, input.auth);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid device auth request.' });
    }
  });

  router.register('POST', '/device-auth/revoke', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, revokeDevice(input as DeviceRevocationInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid device revocation request.',
      });
    }
  });
}
