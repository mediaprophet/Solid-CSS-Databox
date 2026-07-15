/**
 * Databox durable notification delivery + outbox drain (component C14, DBX-21). Single-entry barrel that
 * re-exports the sibling modules of this directory (the one-entry-file-re-exports-siblings pattern), so the
 * package barrel needs a SINGLE line — `export * from './notification/NotificationDelivery'` — to surface
 * every symbol here (SSRF endpoint validator, minimal hint, SSRF-guarded outbound channel, transactional
 * outbox drainer + delivery evidence). See databox/handoffs/DBX-21.md.
 */

export * from './NotificationHint';
export * from './EndpointValidator';
export * from './OutboundNotificationChannel';
export * from './OutboxDrainer';
