import { hintFromOutbox, serializeHint } from '../../../../src/databox/notification/NotificationHint';
import { outbox } from './NotificationTestSupport';

describe('NotificationHint', (): void => {
  it('derives a minimal hint carrying ONLY the opaque event id + classification.', (): void => {
    const hint = hintFromOutbox(outbox(1));
    expect(hint).toStrictEqual({ eventId: 'evt-1', classification: 'Create' });
    expect(Object.isFrozen(hint)).toBe(true);
  });

  it('serialises a minimal payload with no resource reference, tenant or content.', (): void => {
    const body = serializeHint(hintFromOutbox(outbox(7, 'tenant-secret')));
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).toStrictEqual({ eventId: 'evt-7', classification: 'Create' });
    // Explicitly assert the wire form leaks neither the resource ref nor the tenant id.
    expect(body).not.toContain('res-7');
    expect(body).not.toContain('tenant-secret');
    expect(body).not.toContain('resourceRef');
  });
});
