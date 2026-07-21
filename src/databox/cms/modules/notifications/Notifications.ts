import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * Supported notification channels.
 */
export type NotificationChannel = 'in-app' | 'email' | 'sms' | 'push' | 'ldn';

/**
 * Input for creating a notification.
 */
export interface NotificationInput {
  readonly id: string;
  readonly recipient: string;
  readonly channel: NotificationChannel;
  readonly priority: 'low' | 'normal' | 'high' | 'urgent';
  readonly title: string;
  readonly body: string;
  readonly actionUrl?: string;
  readonly category: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

/**
 * Input for creating a notification channel subscription.
 */
export interface ChannelSubscriptionInput {
  readonly id: string;
  readonly agent: string;
  readonly channel: NotificationChannel;
  readonly endpoint: string;
  readonly topics: readonly string[];
  readonly active: boolean;
}

/**
 * Input for listing/filtering notifications.
 */
export interface NotificationQuery {
  readonly recipient: string;
  readonly channel?: NotificationChannel;
  readonly category?: string;
  readonly unreadOnly?: boolean;
  readonly limit?: number;
}

export interface NotificationRecord {
  readonly record: Record<string, unknown>;
  readonly channel: NotificationChannel;
  readonly priority: string;
  readonly unread: boolean;
}

export interface SubscriptionRecord {
  readonly record: Record<string, unknown>;
  readonly active: boolean;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A notification ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A notification ${field} must not be empty.`);
  }
  return trimmed;
}

function requireChannel(value: string): NotificationChannel {
  const valid: NotificationChannel[] = [ 'in-app', 'email', 'sms', 'push', 'ldn' ];
  if (!valid.includes(value as NotificationChannel)) {
    throw new BadRequestHttpError(`Notification channel must be one of: ${valid.join(', ')}.`);
  }
  return value as NotificationChannel;
}

function requirePriority(value: string): 'low' | 'normal' | 'high' | 'urgent' {
  const valid = [ 'low', 'normal', 'high', 'urgent' ] as const;
  if (!valid.includes(value as 'low' | 'normal' | 'high' | 'urgent')) {
    throw new BadRequestHttpError(`Priority must be one of: ${valid.join(', ')}.`);
  }
  return value as 'low' | 'normal' | 'high' | 'urgent';
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A notification ${field} must be a valid date.`);
  }
  return value;
}

/**
 * Build a notification record as schema.org JSON-LD.
 * The notification is an auditable, machine-readable alert that can be
 * delivered via multiple channels and tracked for read state.
 */
export function buildNotification(input: NotificationInput): NotificationRecord {
  const id = requireUri(input.id, 'id');
  const recipient = requireUri(input.recipient, 'recipient');
  const channel = requireChannel(input.channel);
  const priority = requirePriority(input.priority);
  const title = requireNonEmpty(input.title, 'title');
  const body = requireNonEmpty(input.body, 'body');
  const category = requireNonEmpty(input.category, 'category');
  const createdAt = requireDate(input.createdAt, 'createdAt');

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Message',
    [LD_ID]: id,
    recipient: { [LD_ID]: recipient },
    name: title,
    text: body,
    category,
    about: { [LD_TYPE]: 'Thing', name: channel },
    priority,
    dateSent: createdAt,
    isRead: false,
  };

  if (input.actionUrl) {
    record.url = requireUri(input.actionUrl, 'actionUrl');
  }
  if (input.expiresAt) {
    record.expiresAt = requireDate(input.expiresAt, 'expiresAt');
  }

  return { record, channel, priority, unread: true };
}

/**
 * Build a channel subscription record — declares that an agent wants to
 * receive notifications on a specific channel for given topics.
 */
export function buildSubscription(input: ChannelSubscriptionInput): SubscriptionRecord {
  const id = requireUri(input.id, 'id');
  const agent = requireUri(input.agent, 'agent');
  const channel = requireChannel(input.channel);
  const endpoint = requireUri(input.endpoint, 'endpoint');

  if (input.topics.length === 0) {
    throw new BadRequestHttpError('A subscription must include at least one topic.');
  }

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://www.w3.org/ns/activitystreams' ],
    [LD_ID]: id,
    [LD_TYPE]: [ 'Follow', 'Action' ],
    agent: { [LD_ID]: agent },
    object: { [LD_ID]: endpoint },
    instrument: { [LD_TYPE]: 'Thing', name: channel },
    topic: input.topics,
    actionStatus: input.active ? 'ActiveActionStatus' : 'CompletedActionStatus',
  };

  return { record, active: input.active };
}

/**
 * Mark a notification as read — returns the updated record fragment.
 */
export function markNotificationRead(notificationId: string, readAt: string): Record<string, unknown> {
  const id = requireUri(notificationId, 'id');
  const dateRead = requireDate(readAt, 'readAt');

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Message',
    [LD_ID]: id,
    isRead: true,
    dateRead,
  };
}

/**
 * Filter notifications by query criteria. Returns matching notification IDs
 * from a list of notification records.
 */
export function queryNotifications(
  notifications: readonly NotificationRecord[],
  query: NotificationQuery,
): NotificationRecord[] {
  const recipient = requireUri(query.recipient, 'recipient');
  const limit = query.limit ?? 50;
  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
    throw new BadRequestHttpError('Query limit must be between 1 and 200.');
  }

  return notifications
    .filter((n) => {
      const recordRecipient = (n.record.recipient as Record<string, unknown>)?.['@id'];
      if (recordRecipient !== recipient) return false;
      if (query.channel && n.channel !== query.channel) return false;
      if (query.category && n.record.category !== query.category) return false;
      if (query.unreadOnly && !n.unread) return false;
      return true;
    })
    .slice(0, limit);
}
