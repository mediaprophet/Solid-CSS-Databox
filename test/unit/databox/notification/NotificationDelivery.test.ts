import * as NotificationDelivery from '../../../../src/databox/notification/NotificationDelivery';
import { SsrfSafeEndpointValidator } from '../../../../src/databox/notification/EndpointValidator';
import { hintFromOutbox, serializeHint } from '../../../../src/databox/notification/NotificationHint';
import { HttpsNotificationChannel } from '../../../../src/databox/notification/OutboundNotificationChannel';
import { LedgerOutboxSource, OutboxDrainer } from '../../../../src/databox/notification/OutboxDrainer';

describe('NotificationDelivery barrel', (): void => {
  it('re-exports every sibling symbol (one-entry-file-re-exports-siblings).', (): void => {
    expect(NotificationDelivery.SsrfSafeEndpointValidator).toBe(SsrfSafeEndpointValidator);
    expect(NotificationDelivery.HttpsNotificationChannel).toBe(HttpsNotificationChannel);
    expect(NotificationDelivery.OutboxDrainer).toBe(OutboxDrainer);
    expect(NotificationDelivery.LedgerOutboxSource).toBe(LedgerOutboxSource);
    expect(NotificationDelivery.hintFromOutbox).toBe(hintFromOutbox);
    expect(NotificationDelivery.serializeHint).toBe(serializeHint);
  });
});
