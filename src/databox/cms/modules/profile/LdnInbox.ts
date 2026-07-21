import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface LdnNotification {
  readonly id: string;
  readonly actor: string;
  readonly target: string;
  readonly type: string;
  readonly summary: string;
  readonly context?: string;
  readonly published: string;
}

export interface LdnInboxItem {
  readonly notification: Record<string, unknown>;
  readonly inboxUrl: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`An LDN notification ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`An LDN notification ${field} must not be empty.`);
  }
  return trimmed;
}

/**
 * Build an LDN (Linked Data Notifications) notification — a W3C LDN-compliant
 * ActivityStreams 2.0 object that can be POSTed to a Solid pod's inbox.
 * @see https://www.w3.org/TR/ldn/
 */
export function buildLdnNotification(input: LdnNotification): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const actor = requireUri(input.actor, 'actor');
  const target = requireUri(input.target, 'target');
  const type = requireNonEmpty(input.type, 'type');
  const summary = requireNonEmpty(input.summary, 'summary');
  const published = requireNonEmpty(input.published, 'published');

  const notification: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://www.w3.org/ns/activitystreams',
    [LD_ID]: id,
    [LD_TYPE]: type,
    actor: { [LD_ID]: actor },
    target: { [LD_ID]: target },
    summary,
    published,
  };

  if (input.context) {
    notification.context = { [LD_ID]: requireUri(input.context, 'context') };
  }

  return notification;
}

/**
 * Build an LDN inbox container description — a LDP Container that
 * advertises itself as a Solid inbox via the `ldp:inbox` predicate.
 */
export function buildInboxContainer(podUrl: string, inboxUrl: string): Record<string, unknown> {
  const pod = requireUri(podUrl, 'podUrl');
  const inbox = requireUri(inboxUrl, 'inboxUrl');

  return {
    [LD_CONTEXT]: [ 'https://www.w3.org/ns/ldp/v1', 'https://www.w3.org/ns/solid/v1' ],
    [LD_ID]: inbox,
    [LD_TYPE]: [ 'Container', 'BasicContainer' ],
    'ldp:contains': [],
    'solid:inbox': inbox,
    'solid:pod': pod,
  };
}

/**
 * Send a notification to a remote inbox — POSTs an LDN notification
 * to the target inbox URL. Returns the response status and location.
 */
export async function sendLdnNotification(
  inboxUrl: string,
  notification: Record<string, unknown>,
): Promise<{ status: number; location?: string }> {
  const inbox = requireUri(inboxUrl, 'inboxUrl');

  const response = await fetch(inbox, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ld+json',
    },
    body: JSON.stringify(notification),
  });

  return {
    status: response.status,
    location: response.headers.get('location') ?? undefined,
  };
}
