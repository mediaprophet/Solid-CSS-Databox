import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { buildLdnNotification, sendLdnNotification } from './LdnInbox';
import type { LdnNotification } from './LdnInbox';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface MemberInteractionInput {
  readonly organisation: string;
  readonly member: string;
  readonly memberInbox: string;
  readonly organisationInbox: string;
  readonly interactionType: 'offer' | 'request' | 'acknowledge' | 'inform';
  readonly summary: string;
  readonly context?: string;
  readonly published: string;
}

export interface MemberInteractionResult {
  readonly sent: Record<string, unknown>;
  readonly deliveryStatus: number;
  readonly deliveryLocation?: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A member interaction ${field} must be an absolute URI.`);
  }
}

const INTERACTION_TO_AS_TYPE: Record<MemberInteractionInput['interactionType'], string> = {
  offer: 'Offer',
  request: 'Request',
  acknowledge: 'Acknowledge',
  inform: 'Note',
};

/**
 * Send a notification from the organisation to a member via their pod inbox.
 * This is the primary "organisation → member" communication channel.
 */
export async function sendToMember(input: MemberInteractionInput): Promise<MemberInteractionResult> {
  const organisation = requireUri(input.organisation, 'organisation');
  const member = requireUri(input.member, 'member');
  const memberInbox = requireUri(input.memberInbox, 'memberInbox');

  const notification: LdnNotification = {
    id: `${organisation}#notification-to-${member}-${Date.now()}`,
    actor: organisation,
    target: member,
    type: INTERACTION_TO_AS_TYPE[input.interactionType],
    summary: input.summary,
    context: input.context,
    published: input.published,
  };

  const built = buildLdnNotification(notification);
  const delivery = await sendLdnNotification(memberInbox, built);

  return {
    sent: built,
    deliveryStatus: delivery.status,
    deliveryLocation: delivery.location,
  };
}

/**
 * Send a notification from a member to the organisation's inbox.
 * This is the "member → organisation" channel (e.g. access requests, corrections).
 */
export async function sendToOrganisation(input: MemberInteractionInput): Promise<MemberInteractionResult> {
  const organisation = requireUri(input.organisation, 'organisation');
  const member = requireUri(input.member, 'member');
  const orgInbox = requireUri(input.organisationInbox, 'organisationInbox');

  const notification: LdnNotification = {
    id: `${member}#notification-to-${organisation}-${Date.now()}`,
    actor: member,
    target: organisation,
    type: INTERACTION_TO_AS_TYPE[input.interactionType],
    summary: input.summary,
    context: input.context,
    published: input.published,
  };

  const built = buildLdnNotification(notification);
  const delivery = await sendLdnNotification(orgInbox, built);

  return {
    sent: built,
    deliveryStatus: delivery.status,
    deliveryLocation: delivery.location,
  };
}

/**
 * Build a Solid access-control rule that grants the organisation's
 * WebID read access to a member's resource. The member posts this to
 * their pod's ACL endpoint to grant the organisation access.
 */
export function buildAccessGrant(resource: string, agent: string, mode: string): Record<string, unknown> {
  const res = requireUri(resource, 'resource');
  const ag = requireUri(agent, 'agent');

  return {
    [LD_CONTEXT]: 'http://www.w3.org/ns/auth/acl',
    [LD_ID]: `${res}#acl-${Date.now()}`,
    [LD_TYPE]: 'Authorization',
    accessTo: { [LD_ID]: res },
    agent: { [LD_ID]: ag },
    mode: { [LD_ID]: `http://www.w3.org/ns/auth/acl#${mode}` },
  };
}
