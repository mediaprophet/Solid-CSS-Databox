# DBX-21 — Transactional outbox and durable notification delivery

**Prompt:** DBX-21 (Hard). **Components:** C14 notification worker + C15 cursor feed. **Interfaces:** IF-07
(outbox event), IF-08 (notification hint), IF-09 (cursor pull). **ADRs:** ADR-0011 (durable notification +
missed-event recovery), ADR-0012 (duty fulfilment states). **Threats:** T-38 (SSRF), T-39 (notification
rolls back / falsely fulfils), T-40 (outbox/retry flood).

## 1. Files

New (`src/databox/notification/`):
- `NotificationHint.ts` — the minimal hint (`NotificationHint`, `hintFromOutbox`, `serializeHint`). Opaque
  `eventId` + `classification` only; drops `resourceRef`/`tenantId`; frozen (ADR-0011 §4; IF-08).
- `EndpointValidator.ts` — `SsrfSafeEndpointValidator` + `HostResolver`/`EndpointValidatorOptions`. The
  net-new SSRF control CSS lacks (T-38). HTTPS-only, IPv4/IPv6 literal + resolved-IP range denial. Injected
  resolver → no network in tests.
- `OutboundNotificationChannel.ts` — `OutboundNotificationChannel`, `HttpsNotificationChannel`,
  `OutboundFetch`/`OutboundResponse`/`DeliveryAttemptResult`. Validates on every hop, bounds + re-validates
  redirects, injected transport. Acceptance = 2xx only (ADR-0011 review #8).
- `OutboxDrainer.ts` — `OutboxSource`, `LedgerOutboxSource`, `OutboxDrainer`, `DeliveryEvidence`,
  `DeliveryOutcome`, `CommittedEventProjection`, `OutboxDrainerOptions`. The durable drainer: retries,
  bounded backoff, dedup, endpoint rotation, delivery evidence, cursor projection, signalHolder coupling.
- `NotificationDelivery.ts` — one-entry barrel re-exporting the four siblings.

Extended (`src/databox/feed/`):
- `CursorFeed.ts` — added the real `RetentionBoundedCursorFeed` (C15) + `AuthorizedCursorFeed`
  (existence-hiding) + `CommittedEventInput`; extended `CommittedEvent` with `eventId` (dedup key). Kept
  `CursorFeed`/`CommittedEvent`/`CursorFeedPage` and **`NotImplementedCursorFeed`** (FailClosedStubs stays
  green).

Tests: `test/unit/databox/notification/{NotificationHint,EndpointValidator,OutboundNotificationChannel,
OutboxDrainer,NotificationDelivery}.test.ts` + `NotificationTestSupport.ts`;
`test/unit/databox/feed/CursorFeed.test.ts`.

## 2. Design

### Transactional outbox drain (C14, IF-07 → IF-08)
The outbox record is committed **inside** the §7.0 evidence-ledger append (DBX-19 `LedgerAppendInput.outbox`);
this prompt only **drains** committed records — `LedgerOutboxSource` maps ledger entries with an `.outbox` to
`OutboxRecord`s in commit order. `OutboxDrainer.deliver` attempts a minimal hint up to `maxAttempts` with
**bounded exponential backoff** (`min(base·2^(n-1), ceiling)`), **endpoint rotation** (`endpoints[attempt %
len]`), and settles to a frozen `DeliveryEvidence` (the C14 authoritative "notification delivery state").
**Dedup / exactly-once side effect:** once settled per `tenant+eventId`, redelivery returns the recorded
evidence without re-attempting. `drainTenant` projects each event into the C15 feed **first**, then delivers.

### SSRF endpoint validation (T-38, net-new)
`SsrfSafeEndpointValidator.validate` fails closed on: a malformed URL; a non-HTTPS scheme; an empty host; an
IP **literal** in a blocked range; a DNS name that does not resolve, or resolves to (or includes) any blocked
or unparseable address (DNS-rebind defence). **Ranges blocked** — IPv4: `0/8`, `10/8`, `127/8`, `100.64/10`,
`169.254/16` (**incl. metadata `169.254.169.254`**), `172.16/12`, `192.0.0/24`, `192.168/16`, `224/4`+`240/4`.
IPv6: `::`, `::1`, `fe80::/10`, `fc00::/7`, and IPv4-mapped `::ffff:x.x.x.x` classified by the embedded IPv4
(so `::ffff:169.254.169.254` is blocked). The channel re-validates the target on **every redirect hop** and
**bounds** redirect count, so a `Location` cannot bounce into a private/metadata range. The resolver is
injected — tests never touch the network.

### Cursor / event feed (C15, IF-09) — authoritative recovery
`RetentionBoundedCursorFeed` is an **ordered, dedup-keyed, retention-bounded** projection. Each ingested
event gets a strictly-monotonic sequence (never reset, even after eviction); `pull(tenant, sinceCursor)`
returns exactly the events with sequence `> sinceCursor`, in commit order. **Exactly-once recovery:** a
disconnected consumer presents its last cursor and recovers every missed event once; re-pulling the same
cursor is idempotent. **Dedup:** `record` is keyed on `eventId`, so at-least-once drain and post-crash
re-drain collapse to one logical event. **Retention floor is fail-closed:** a cursor below the retained floor
throws `ConflictHttpError` ("reconcile required") — never a silent reset or truncated history (ADR-0011).
`AuthorizedCursorFeed` scopes a feed to one connection's tenant and answers a cross-connection probe with
`NotFoundHttpError` (**404, not 403** — existence-hiding, DBX-01 §3).

### Duty coupling (ADR-0012; T-39/T-50)
`OutboxDrainer.signalHolderHandler(record)` returns a `DutyHandler` whose result reflects the **actual**
channel outcome: acceptance → `accepted` (duty fulfilled); exhaustion → `failed` (duty **not** fulfilled,
retryable). Driven through the DBX-20 `DutyEngine`, this yields `queued → attempted → accepted|failed`, each
transition appended to the C13 ledger.

## 3. How notification failure never rolls back / falsely fulfils (T-39)
The accepted deposit is a committed C13 ledger entry (DBX-19), independent of any push. The drainer never
mutates that entry: a delivery `failed` produces a `DeliveryEvidence{outcome:'failed'}` and drives the
`signalHolder` duty to `failed` (unfulfilled) — the deposit stays `accepted` and the chain still verifies.
Because `drainTenant` projects to the cursor feed **before** (and independent of) delivery, a failed hint
still leaves the event recoverable via IF-09. `queued`/`attempted`/`failed` are never fulfilling
(ADR-0012 rule 1), so a failed push can never read as "consumer was notified". Test:
`OutboxDrainer.test.ts` "delivery FAILURE keeps the duty unfulfilled + the deposit accepted (T-39)".

## 4. Threats mitigated
- **T-38 (SSRF):** ranges above blocked for literals + resolved IPs; HTTPS-only; bounded, re-validated
  redirects. Tests reject `127.0.0.1`, `169.254.169.254`, `10.x`, `[::1]`, `[fe80::1]`, non-HTTPS, DNS-rebind,
  and a redirect into `169.254.169.254`.
- **T-39 (rollback / false fulfilment):** delivery failure keeps deposit accepted + duty failed; cursor feed
  recovers every missed event exactly once.
- **T-40 (flood):** `maxAttempts` caps retries, backoff is ceiling-bounded, dedup prevents reprocessing a
  settled event.
- **T-56 (status-list herd):** n/a here (noted in prompt).

## 5. Exactly-once recovery
Ordering (monotonic sequence) + dedup (`eventId`) + retention floor (fail-closed `ConflictHttpError`) give a
disconnected consumer exactly-once recovery of every missed logical event within the window. A crash-restart
re-drain of the durable outbox re-projects and re-delivers, but the feed dedups by `eventId` and the consumer
recovers strictly-after its cursor → no loss, no duplication. Tests:
"a disconnected consumer recovers EVERY missed event exactly once", "a crash-restart re-drain neither loses
nor duplicates a logical event".

## 6. Barrel symbols (index.ts NOT edited)
- **Feed:** already covered by the existing `export * from './feed/CursorFeed'` — now also surfaces
  `RetentionBoundedCursorFeed`, `AuthorizedCursorFeed`, `CommittedEventInput`.
- **Notification (to add when DI-wiring):** `export * from './notification/NotificationDelivery';` — surfaces
  `SsrfSafeEndpointValidator`, `HostResolver`, `EndpointValidatorOptions`, `NotificationHint`,
  `hintFromOutbox`, `serializeHint`, `OutboundNotificationChannel`, `HttpsNotificationChannel`,
  `OutboundFetch`, `OutboundResponse`, `DeliveryAttemptResult`, `OutboxSource`, `LedgerOutboxSource`,
  `OutboxDrainer`, `DeliveryEvidence`, `DeliveryOutcome`, `CommittedEventProjection`, `OutboxDrainerOptions`.

## 7. .componentsignore additions
**None.** `npm run build:components` exits 0 with no "Could not understand parameter type" errors for the new
classes.

## 8. Residual HUMAN review gate (RECORDED — OPEN)
Per ADR-0011, a **named security reviewer** must sign off before the production profile is frozen on:
(a) the concrete **SSRF allowlist/denylist** ranges + redirect handling (this build fixes the mechanism +
vectors; the deployment policy value is theirs); (b) the **retention-window value(s)** (uniform vs
per-record-class — a storage-vs-recovery trade); (c) which **Solid notification channel(s)** are advertised
as hints in production (S-11 constraints); (d) that the **durable substrate** replacing the in-memory feed
log / delivery-state map preserves ordering, dedup and the fail-closed floor. Gate status: **OPEN**.

## 8b. Round-2 fixes (independent SSRF/recovery review)

The review CONFIRMED T-39 sound (§3 above) and found the following, all now fixed in
`src/databox/notification` (+ `feed`), each with a dedicated test asserting the fixed property:

- **H1 (HIGH — DNS-rebind/TOCTOU):** the channel discarded the validated IPs and let the transport
  re-resolve the hostname at connect time, bypassing the whole block-list. FIX: `OutboundFetch` now takes an
  `OutboundRequest{host, pinnedIps, body}` and returns the socket's actual `peerAddress`; the channel PINS
  the validated IPs, and after each hop verifies `peerAddress ∈ pinnedIps`, aborting (`SSRF`) otherwise.
  Test: `H1: aborts when the socket peer is NOT the pinned IP (DNS-rebind)` (public at validate, private at
  connect → abort) + a positive test asserting the pinned public IP is handed to the transport.
- **M1 (MED — auto-follow redirects):** the transport is now contractually MANUAL-mode (returns 3xx +
  `Location`; the channel owns following), the channel bounds hops and re-validates + re-pins EVERY hop; the
  peer-pin also catches a wrongly-auto-followed hop. Tests: `M1: channel-owned manual redirect re-validates +
  re-pins EVERY hop` and `M1: refuses a redirect into a blocked range`.
- **M2 (MED — deliver concurrency):** `OutboxDrainer.deliver` now serialises per `tenant+eventId` via an
  `inFlight` promise map (same pattern as `DutyEngine`); the synchronous check-settled/check-inflight/
  set-inflight section is atomic. Test: `M2: concurrent deliver() ... pushes + settles EXACTLY once`
  (single push, shared evidence).
- **L1 (LOW — IPv4-compatible `::x.x.x.x`):** `isBlockedIpv6` now classifies the `::/96` compatible range
  (`groups[5] === 0`) by its embedded IPv4 alongside the mapped range. Tests: `::127.0.0.1`, `::10.0.0.5`
  rejected.
- **L2 (LOW — extra ranges):** added IPv4 `198.18.0.0/15` (benchmarking) and IPv6 `64:ff9b::/96` (NAT64).
  Tests: `198.18.0.1`, `198.19.255.1`, `[64:ff9b::1.2.3.4]` rejected.
- **Alternate IP encodings (regression guard):** tests assert `2130706433`, `0x7f.0.0.1`, `0177.0.0.1`,
  `127.1` are rejected (safe today only because WHATWG-URL normalises them to `127.0.0.1` — the tests guard
  against a parser/resolver regression).

Residual human review gate (§8) is UNCHANGED and remains **OPEN**. Tests remain fully offline (injected
resolver + injected transport). Round-2 suite: **90 tests**, still 100% coverage.

## 9. Commands + results
| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) |
| `npx jest test/unit/databox/notification test/unit/databox/feed --coverage --collectCoverageFrom='src/databox/{notification,feed}/**/*.ts' --coverageReporters=text` | **PASS** — 6 suites, **90 tests** (round-2); **All files 100%** stmts/branch/funcs/lines |
| `npx eslint src/databox/notification src/databox/feed test/unit/databox/notification test/unit/databox/feed --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice) |
| `npm run build:components` | **PASS** (exit 0; no `.componentsignore` additions) |
| `npx jest test/unit/databox/FailClosedStubs` | **PASS** — 7 tests (NotImplementedCursorFeed still refuses; barrel intact) |

Per constraints: did NOT run `git add`/`commit` or `npm ci`. No raw crypto/network added — SSRF checks parse
the host/URL; DNS is an injected resolver; delivery transport is injected. LF endings.
