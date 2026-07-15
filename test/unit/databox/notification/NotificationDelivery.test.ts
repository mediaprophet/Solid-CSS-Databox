import * as NotificationDelivery from '../../../../src/databox/notification/NotificationDelivery';

describe('NotificationDelivery barrel', (): void => {
  it('re-exports every sibling symbol (one-entry-file-re-exports-siblings).', (): void => {
    expect(NotificationDelivery.SsrfSafeEndpointValidator).toBeDefined();
    expect(NotificationDelivery.HttpsNotificationChannel).toBeDefined();
    expect(NotificationDelivery.OutboxDrainer).toBeDefined();
    expect(NotificationDelivery.LedgerOutboxSource).toBeDefined();
    expect(NotificationDelivery.hintFromOutbox).toBeDefined();
    expect(NotificationDelivery.serializeHint).toBeDefined();
  });
});
