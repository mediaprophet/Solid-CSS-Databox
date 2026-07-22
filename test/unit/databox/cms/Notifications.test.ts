import {
  buildNotification,
  buildSubscription,
  markNotificationRead,
  queryNotifications,
} from '../../../../src/databox/cms/modules/notifications/Notifications';

describe('Notifications module', () => {
  const baseNotification = {
    id: 'https://databox.example.org/notifications/n1',
    recipient: 'https://databox.example.org/members/alice',
    channel: 'in-app' as const,
    priority: 'normal' as const,
    title: 'New order assigned',
    body: 'Table 5 has placed a new order.',
    category: 'pos',
    createdAt: '2025-07-01T10:00:00Z',
  };

  describe('buildNotification', () => {
    it('builds a valid notification record', () => {
      const result = buildNotification(baseNotification);
      expect(result.record['@type']).toBe('Message');
      expect(result.record['@id']).toBe(baseNotification.id);
      expect(result.record.name).toBe('New order assigned');
      expect(result.record.isRead).toBe(false);
      expect(result.channel).toBe('in-app');
      expect(result.unread).toBe(true);
    });

    it('includes actionUrl and expiresAt when provided', () => {
      const result = buildNotification({
        ...baseNotification,
        actionUrl: 'https://databox.example.org/orders/123',
        expiresAt: '2025-07-02T10:00:00Z',
      });
      expect(result.record.url).toBe('https://databox.example.org/orders/123');
      expect(result.record.expiresAt).toBe('2025-07-02T10:00:00Z');
    });

    it('rejects invalid channel', () => {
      expect(() => buildNotification({ ...baseNotification, channel: 'fax' as any }))
        .toThrow('Notification channel must be one of');
    });

    it('rejects invalid priority', () => {
      expect(() => buildNotification({ ...baseNotification, priority: 'critical' as any }))
        .toThrow('Priority must be one of');
    });

    it('rejects non-URI id', () => {
      expect(() => buildNotification({ ...baseNotification, id: 'not-a-uri' }))
        .toThrow('must be an absolute URI');
    });

    it('rejects empty title', () => {
      expect(() => buildNotification({ ...baseNotification, title: '  ' }))
        .toThrow('must not be empty');
    });

    it('rejects invalid date', () => {
      expect(() => buildNotification({ ...baseNotification, createdAt: 'not-a-date' }))
        .toThrow('must be a valid date');
    });

    it('supports all channel types', () => {
      for (const channel of [ 'in-app', 'email', 'sms', 'push', 'ldn' ] as const) {
        const result = buildNotification({ ...baseNotification, channel });
        expect(result.channel).toBe(channel);
      }
    });
  });

  describe('buildSubscription', () => {
    it('builds a valid subscription record', () => {
      const result = buildSubscription({
        id: 'https://databox.example.org/subs/s1',
        agent: 'https://databox.example.org/members/alice',
        channel: 'push',
        endpoint: 'https://databox.example.org/inbox/alice',
        topics: [ 'pos', 'governance' ],
        active: true,
      });
      expect(result.record['@type']).toContain('Follow');
      expect(result.record.topic).toEqual([ 'pos', 'governance' ]);
      expect(result.active).toBe(true);
    });

    it('rejects empty topics', () => {
      expect(() => buildSubscription({
        id: 'https://databox.example.org/subs/s1',
        agent: 'https://databox.example.org/members/alice',
        channel: 'email',
        endpoint: 'https://databox.example.org/inbox/alice',
        topics: [],
        active: true,
      })).toThrow('at least one topic');
    });

    it('rejects non-URI endpoint', () => {
      expect(() => buildSubscription({
        id: 'https://databox.example.org/subs/s1',
        agent: 'https://databox.example.org/members/alice',
        channel: 'email',
        endpoint: 'not-a-uri',
        topics: [ 'pos' ],
        active: true,
      })).toThrow('must be an absolute URI');
    });
  });

  describe('markNotificationRead', () => {
    it('builds a read marker record', () => {
      const result = markNotificationRead(
        'https://databox.example.org/notifications/n1',
        '2025-07-01T11:00:00Z',
      );
      expect(result.isRead).toBe(true);
      expect(result.dateRead).toBe('2025-07-01T11:00:00Z');
    });

    it('rejects invalid notification id', () => {
      expect(() => markNotificationRead('bad-id', '2025-07-01T11:00:00Z'))
        .toThrow('must be an absolute URI');
    });
  });

  describe('queryNotifications', () => {
    const notifications = [
      buildNotification({ ...baseNotification, id: 'https://example.org/n1', category: 'pos' }),
      buildNotification({ ...baseNotification, id: 'https://example.org/n2', category: 'governance', channel: 'email' }),
      buildNotification({ ...baseNotification, id: 'https://example.org/n3', category: 'pos', priority: 'urgent' }),
    ];

    it('filters by recipient', () => {
      const results = queryNotifications(notifications, { recipient: baseNotification.recipient });
      expect(results).toHaveLength(3);
    });

    it('filters by channel', () => {
      const results = queryNotifications(notifications, {
        recipient: baseNotification.recipient,
        channel: 'email',
      });
      expect(results).toHaveLength(1);
      expect(results[0].record['@id']).toBe('https://example.org/n2');
    });

    it('filters by category', () => {
      const results = queryNotifications(notifications, {
        recipient: baseNotification.recipient,
        category: 'pos',
      });
      expect(results).toHaveLength(2);
    });

    it('filters by unreadOnly', () => {
      const readNotifications = notifications.map(n => ({ ...n, unread: false }));
      const results = queryNotifications(readNotifications, {
        recipient: baseNotification.recipient,
        unreadOnly: true,
      });
      expect(results).toHaveLength(0);
    });

    it('respects limit', () => {
      const results = queryNotifications(notifications, {
        recipient: baseNotification.recipient,
        limit: 2,
      });
      expect(results).toHaveLength(2);
    });

    it('rejects invalid limit', () => {
      expect(() => queryNotifications(notifications, {
        recipient: baseNotification.recipient,
        limit: 0,
      })).toThrow('between 1 and 200');
    });

    it('returns empty for non-matching recipient', () => {
      const results = queryNotifications(notifications, {
        recipient: 'https://example.org/someone-else',
      });
      expect(results).toHaveLength(0);
    });
  });
});
