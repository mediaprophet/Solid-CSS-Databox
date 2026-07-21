import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface MemberPodInput {
  readonly id: string;
  readonly owner: string;
  readonly organisation: string;
  readonly podUrl: string;
  readonly inboxUrl: string;
  readonly outboxUrl: string;
  readonly role: string;
  readonly issuedAt: string;
}

export interface MemberPodRecord {
  readonly pod: Record<string, unknown>;
  readonly webId: string;
  readonly status: 'active' | 'suspended' | 'revoked';
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A member pod ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A member pod ${field} must not be empty.`);
  }
  return trimmed;
}

/**
 * Provision a member/person pod — creates the WebID profile document,
 * inbox/outbox declarations, and organisation binding.
 * @see https://solidproject.org/TR/protocol
 */
export function provisionMemberPod(input: MemberPodInput): MemberPodRecord {
  const id = requireUri(input.id, 'id');
  const owner = requireUri(input.owner, 'owner');
  const organisation = requireUri(input.organisation, 'organisation');
  const podUrl = requireUri(input.podUrl, 'podUrl');
  const inboxUrl = requireUri(input.inboxUrl, 'inboxUrl');
  const outboxUrl = requireUri(input.outboxUrl, 'outboxUrl');
  const role = requireUri(input.role, 'role');
  const issuedAt = requireNonEmpty(input.issuedAt, 'issuedAt');

  const profile: Record<string, unknown> = {
    [LD_CONTEXT]: [
      'https://www.w3.org/ns/solid/v1',
      'https://www.w3.org/ns/ldp/v1',
      'https://schema.org/',
    ],
    [LD_ID]: owner,
    [LD_TYPE]: [ 'PersonalProfileDocument', 'Person' ],
    inbox: inboxUrl,
    outbox: outboxUrl,
    'solid:pod': podUrl,
    'solid:storage': `${podUrl}storage/`,
    affiliation: { [LD_ID]: organisation },
    jobTitle: role,
    dateCreated: issuedAt,
  };

  return {
    pod: profile,
    webId: owner,
    status: 'active',
  };
}

export interface MemberLifecycleInput {
  readonly webId: string;
  readonly organisation: string;
  readonly action: 'suspend' | 'reactivate' | 'revoke';
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly reason: string;
}

/**
 * Record a lifecycle state change for a member pod — suspension, reactivation, or revocation.
 * Produces a schema.org Action record that can be stored as a Solid resource for audit.
 */
export function recordMemberLifecycleChange(input: MemberLifecycleInput): Record<string, unknown> {
  const webId = requireUri(input.webId, 'webId');
  const organisation = requireUri(input.organisation, 'organisation');
  const decidedBy = requireUri(input.decidedBy, 'decidedBy');
  const decidedAt = requireNonEmpty(input.decidedAt, 'decidedAt');
  const reason = requireNonEmpty(input.reason, 'reason');

  const actionStatus = input.action === 'suspend'
    ? 'SuspendedActionStatus'
    : input.action === 'reactivate'
      ? 'ActiveActionStatus'
      : 'FailedActionStatus';

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Action',
    [LD_ID]: `${webId}#lifecycle-${input.action}-${Date.now()}`,
    object: { [LD_ID]: webId },
    agent: { [LD_ID]: decidedBy },
    participant: { [LD_ID]: organisation },
    actionStatus,
    description: input.action,
    result: reason,
    endTime: decidedAt,
  };
}
