import type { HttpHandlerInput } from '../../server/HttpHandler';
import type { IpmsModuleRouter } from './IpmsModuleRouter';
import { readJsonBody, writeJson } from './IpmsHttpUtils';
import {
  buildAppProfile,
  buildContainerBootConfig,
  checkNetworkScope,
  issueAppInstallLicence,
  serialiseAppProfile,
  validateAppInstallLicence,
} from './OrgAppManifest';

export function registerOrgAppRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  // Build/serialise an app profile manifest
  router.register('POST', '/org-apps/profile/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const profile = buildAppProfile(input as Parameters<typeof buildAppProfile>[0]);
      writeJson(response, 200, {
        profile,
        record: serialiseAppProfile(profile),
      }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid app profile request.' });
    }
  });

  // Issue an app install licence (VC)
  router.register('POST', '/org-apps/licence/issue', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const licence = issueAppInstallLicence(input as Parameters<typeof issueAppInstallLicence>[0]);
      const record = {
        '@context': [ 'https://schema.org/', 'https://www.w3.org/2018/credentials/v1' ],
        '@type': [ 'VerifiableCredential', 'AppInstallLicence' ],
        '@id': licence.licenceId,
        issuer: { '@id': licence.issuedBy },
        issuanceDate: licence.issuedAt,
        ...licence.expiresAt ? { expirationDate: licence.expiresAt } : {},
        credentialSubject: {
          '@id': licence.deviceId,
          appId: licence.appId,
          organisation: { '@id': licence.organisation },
          licenceScope: licence.scope,
          permissions: licence.permissions,
        },
      };
      writeJson(response, 200, { licence, record }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid licence issue request.' });
    }
  });

  // Validate an app install licence
  router.register(
    'POST',
    '/org-apps/licence/validate',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const { licence, requestedAt } = await readJsonBody<
          { licence: Parameters<typeof validateAppInstallLicence>[0]; requestedAt: string }
        >(request);
        const result = validateAppInstallLicence(licence, requestedAt);
        writeJson(response, 200, result, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid licence validation request.',
        });
      }
    },
  );

  // Container boot — the main endpoint the WASM container calls on startup
  router.register('POST', '/org-apps/boot', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{
        profile: Parameters<typeof buildAppProfile>[0];
        enabledModules: string[];
        licence: Parameters<typeof issueAppInstallLicence>[0];
        serverUrl: string;
        bootAt: string;
      }>(request);
      const profile = buildAppProfile(input.profile);
      const licence = issueAppInstallLicence(input.licence);
      const result = buildContainerBootConfig(
        profile,
        input.enabledModules,
        licence,
        input.serverUrl,
        input.bootAt,
      );
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid container boot request.' });
    }
  });

  // Check network scope for a request
  router.register(
    'POST',
    '/org-apps/network-scope/check',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const { networkScope, requestOrigin, orgLocalNetworks } = await readJsonBody<{
          networkScope: 'local-only' | 'remote-capable';
          requestOrigin: string;
          orgLocalNetworks: string[];
        }>(request);
        const result = checkNetworkScope(networkScope, requestOrigin, orgLocalNetworks);
        writeJson(response, 200, result, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid network scope check.' });
      }
    },
  );
}
