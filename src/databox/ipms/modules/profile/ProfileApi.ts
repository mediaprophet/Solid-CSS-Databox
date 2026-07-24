import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { MemberLifecycleInput, MemberPodInput } from './MemberPod';
import { provisionMemberPod, recordMemberLifecycleChange } from './MemberPod';
import type { LdnNotification } from './LdnInbox';
import { buildInboxContainer, buildLdnNotification, sendLdnNotification } from './LdnInbox';
import type { MemberInteractionInput } from './MemberInteraction';
import { buildAccessGrant, sendToMember, sendToOrganisation } from './MemberInteraction';
import { buildProfile } from './PersonProfile';
import type { ProfileInput } from './PersonProfile';

export function registerProfileRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/profile/build', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildProfile(input as ProfileInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid profile request.' });
    }
  });

  router.register('POST', '/members/provision', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = provisionMemberPod(input as MemberPodInput);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Member provisioning failed.' });
    }
  });

  router.register('POST', '/members/lifecycle', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, recordMemberLifecycleChange(input as MemberLifecycleInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Lifecycle change failed.' });
    }
  });

  router.register('POST', '/ldn/notification', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildLdnNotification(input as LdnNotification), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid LDN notification.' });
    }
  });

  router.register('POST', '/ldn/inbox/create', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ podUrl: string; inboxUrl: string }>(request);
      writeJson(response, 200, buildInboxContainer(input.podUrl, input.inboxUrl), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid inbox creation request.' });
    }
  });

  router.register('POST', '/ldn/send', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ inboxUrl: string; notification: Record<string, unknown> }>(request);
      const result = await sendLdnNotification(input.inboxUrl, input.notification);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'LDN send failed.' });
    }
  });

  router.register('POST', '/members/notify', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = await sendToMember(input as MemberInteractionInput);
      writeJson(response, 200, result, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Member notification failed.' });
    }
  });

  router.register(
    'POST',
    '/members/notify-organisation',
    async({ request, response }: HttpHandlerInput): Promise<void> => {
      try {
        const input = await readJsonBody<unknown>(request);
        const result = await sendToOrganisation(input as MemberInteractionInput);
        writeJson(response, 200, result, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'Organisation notification failed.',
        });
      }
    },
  );

  router.register('POST', '/members/access-grant', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ resource: string; agent: string; mode: string }>(request);
      writeJson(response, 200, buildAccessGrant(input.resource, input.agent, input.mode), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Access grant failed.' });
    }
  });
}
