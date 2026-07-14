<!--
ADR — Databox decision register (DBX-02). Cluster: exchange & evidence.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0011 — Durable notification and missed-event recovery

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — outbound-delivery SSRF/endpoint-validation rules and the retention-window value are security-sensitive and need a named security reviewer before the production profile is frozen.
- **Sources adjudicated:** R-07; review-item #7; review-item #8; review-item #9; S-11; S-26; HD-07 (unattended sync); exchange-and-evidence.md Notifications section; DBX-01 §6.
- **Consumed by / blocks prompts:** DBX-21, HAK-08 (both blocked on the cursor-feed contract fixed here); consumed by DBX-04.
- **Relates to:** ADR-0012 (ODRL duty fulfilment states), ADR-0019 (evidence ledger and receipt states), ADR-0007 (connection credential carries the cursor/notification discovery entries).

## Context

A deposit must reach the consumer even across vault downtime, endpoint failure or missed pushes, without the notification channel itself becoming the record of what happened. Invariant 12 requires the standard Solid notification surface be preserved; invariants 6 and 8 require that the consumer learns of an event and can retrieve it without the organisation browsing the vault. Review-item #7 already answers "are WebSockets required?" — no; HTTPS operations are authoritative. Review-item #8 rejects "LDN is the mandatory durable baseline" and rejects "an HTTP POST success proves durable consumer access". Review-item #9 rejects "missed events can be recovered from the outbox/inbox" as stated: a provider outbox gives reliable dispatch, not a consumer recovery API.

DBX-01 §6 confirms the CSS 7.1.9 reality: notification channels (`WebSocketChannel2023`, `WebhookChannel2023`, `StreamingHTTPChannel2023`) exist but delivery is best-effort and in-memory — `WebhookEmitter.handle` does a single `fetch` with no retry, `WebSocket2023Emitter` discards if no live socket, and `ListeningActivityHandler` fires-and-forgets. There is **no cursor/"since" replay** (a `NotificationChannel` carries only a one-shot subscribe-time ETag diff, not an event log) and **no SSRF protection** (`WebhookEmitter` POSTs a client-supplied `sendTo` URL with no allowlist, scheme, private-IP or redirect control). The durable recovery subsystem is therefore net-new; nothing in CSS notifications can be reused for guaranteed missed-event recovery. S-26 further forbids using the incomplete LWS notification Working-Draft text as the durable contract.

## Decision

The Databox adopts a **notify-then-pull** model. The authoritative record of an event is the committed resource plus its ordered evidence event; notifications are non-authoritative hints.

1. **HTTPS is authoritative (review #7).** A deposit, submission, receipt or duty transition is real only when it is durably committed (ADR-0019) and retrievable over authenticated HTTPS. A WebSocket/Solid Notification/webhook signal MUST NOT be treated as, or substituted for, the record of a deposit, submission or duty. Loss of every hint channel MUST NOT lose an event.

2. **The per-connection cursor feed is THE authoritative missed-event recovery contract (R-07, review #9).** Each connection MUST expose an authenticated, connection-scoped, monotonic cursor feed over its committed events. A client presents a cursor position and receives every logical event after it, exactly once, in commit order. This feed — not the outbox, not the inbox, not the push channel — is the mechanism a disconnected vault reconciles from. The feed MUST provide:
   - **Total ordering** within a connection (a monotonic sequence/position; ties broken deterministically), so "after cursor X" is unambiguous.
   - **Deduplication keys** — every event carries a stable `eventId` and the originating idempotency key (HD-12 tuple / HMAC) so replay and at-least-once delivery collapse to exactly-once at the consumer.
   - **A declared, finite retention window** for replayable events, advertised in the connection's discovery data (ADR-0007). Recovery is guaranteed only within the window; beyond it the client MUST fall back to full state reconciliation, and the feed MUST signal that the requested cursor is below the retained floor rather than silently returning a partial history.

3. **"HTTP POST success = durable consumer access" is rejected (review #8).** A 2xx from an outbound delivery attempt proves at most that a byte stream was accepted by some endpoint. It is not evidence of durable receipt, retrieval or acknowledgement. Delivery states (queued, attempted, accepted, permanently-failed) are distinct from consumer states (retrieved, acknowledged) and are recorded as such (ADR-0012, ADR-0019).

4. **Any outbound delivery (push hint, webhook, LDN) MUST enforce** (net-new per DBX-01 §6): durable queueing with retries and bounded backoff; idempotency and duplicate tolerance keyed on `eventId`; endpoint validation with **SSRF protection** (scheme allowlist, DNS-resolution and private/link-local/loopback/metadata-range denial, no redirects into prohibited ranges, re-validation after redirect); success and permanent-failure evidence events; and consumer-controlled endpoint replacement. Notification payloads carry only an opaque event identifier and classification — never receipt line items, medical or dietary facts, or other sensitive content (isolation-and-privacy.md).

5. **LDN and Solid change-notifications are optional-per-profile, not baseline (review #8, S-11, S-26).** A program profile MAY require outbound LDN to a separately registered durable inbox or a specific Solid notification channel, in which case an explicit outbound sender with the §4 controls is required and its own duty state applies (ADR-0012 `dbx:deliverToInbox`). Absent such a profile clause, the low-latency Solid channel is a hint only and the cursor feed remains the sole guaranteed recovery path. Advertised Solid channels MUST be advertised exactly as the pinned Solid Notifications spec defines them and MUST NOT be described as, or conflated with, the Databox durable recovery API (S-11).

## Alternatives considered

- **LDN outbound as the mandatory durable baseline.** Rejected (review #8): it makes durability depend on the reachability and correctness of a consumer-operated inbox, converts every deposit into an outbound request the provider must make (enlarging SSRF surface and coupling acceptance to network conditions), and still cannot prove durable receipt from a POST result. Kept as an opt-in profile delivery mode only.
- **Outbox-as-recovery-API (consumer reads the provider outbox to catch up).** Rejected (review #9): the outbox is an internal reliable-dispatch mechanism; exposing it as a consumer API leaks dispatch internals and cross-tenant structure, lacks per-connection scoping and ordering guarantees, and conflates "provider tried to send" with "consumer can recover". The cursor feed is a purpose-built, per-connection, authorization-gated projection instead.
- **WebSocket/Solid Notifications as the durable record.** Rejected (review #7): delivery is best-effort and in-memory in CSS (DBX-01 §6); a dropped socket loses the signal with no replay. Real-time push is retained strictly as an acceleration hint.
- **Adopt the LWS Working-Draft notification section as the contract.** Rejected (S-26): the text is incomplete; only pinned, testable assertions may be implemented, and the separately specified durable cursor mechanism is retained and clearly labelled a Databox experiment for the hackathon.

## Consequences

- **Positive:** Durability no longer depends on any push channel; a vault can be stopped, records added, and every missed logical event recovered exactly once on restart (HAK-08 gate). Ordering + dedup + retention give DBX-21 a testable contract. Standard Solid clients keep working via advertised channels; the durable contract is additive.
- **Negative / cost:** The cursor feed, transactional outbox and SSRF guard are all net-new builds (DBX-01 §6) — the largest build in the exchange layer. Retention-window sizing is a real operational trade (storage vs recovery guarantee) that each profile must set and defend.
- **Privacy & threat notes:** Closes the "query another program through notifications" and "leak identifiers through notification previews" threats (isolation-and-privacy.md threat cases) by keeping payloads opaque and feeds connection-scoped and authorization-gated. Opens an SSRF/redirect-abuse surface on any outbound mode — mitigated by §4; a delivery endpoint controlled by an attacker must never let the provider reach internal networks. The cursor feed MUST enforce the same 404-not-403 existence-hiding rule as ordinary resources (DBX-01 §3) so a cursor probe cannot confirm another connection exists.

## Failure behavior

Fail closed, never fail open into silent loss:
- If the ordered event cannot be durably committed alongside the resource and receipt, the operation is **not** accepted and no receipt is issued (ADR-0019); the client sees a failure and retries under the same idempotency key.
- If a requested cursor is below the retained floor, the feed returns an explicit "cursor expired / reconcile required" signal — never a truncated history presented as complete.
- If endpoint validation fails or resolves into a prohibited range, outbound delivery is refused and recorded as a permanent-failure evidence event; the event remains retrievable via the cursor feed (delivery failure never rolls back an accepted deposit, but stays visible and retryable — exchange-and-evidence.md Atomicity).
- Ambiguous or duplicate delivery of the same `eventId`/idempotency key returns/records the original logical outcome, never a second logical event.
- An unauthenticated or cross-connection cursor request is denied with the existence-hiding response.

## Open sub-questions / residual gates

- The exact **retention-window value(s)** and whether they are uniform or per-record-class are a Profile choice to be set and security-reviewed in the DBX-21 production profile; the hackathon uses a short demo window (HAK-08). Owner: DBX-21.
- Which specific **Solid notification channel(s)** are advertised as hints in production (vs the CSS-supported channel used for the hackathon) is a profile/interop decision owned by DBX-21 with S-11 constraints.
- The SSRF allowlist/denylist policy detail (ranges, redirect handling) is specified in principle here; its concrete configuration and test vectors are owned by DBX-21 and gated on the named security reviewer.
- Everything required for the cursor-feed **contract itself** (ordering, dedup keys, retention semantics, fail-closed rules) is fully specified for its scope in this ADR.
