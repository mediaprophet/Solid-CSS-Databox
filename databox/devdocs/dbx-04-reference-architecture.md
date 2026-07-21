# DBX-04 — Reference Architecture and Interface Boundaries

**Prompt:** DBX-04 (Wave A). **Agent level:** Hard. **Depends on:** DBX-01, DBX-02, DBX-03 (all accepted).
**Status:** complete. **Baseline:** CSS 7.1.9; decisions per [ADR register](decisions/README.md);
threats/boundaries per [DBX-03](dbx-03-threat-model.md).

## 1. Purpose and scope

This defines the **deployable architecture**: the components, their trust boundaries, the synchronous and
asynchronous interfaces between them, which system is **authoritative** for each piece of state, who owns
each **failure**, and the split between the **Track A (Solid)** and **Track B (LWS)** adapters. It does not
implement components — it fixes the names, contracts and state ownership that DBX-05…DBX-24 build against,
so that **deposit, submission, denial, notification failure, key rotation and policy update each trace end
to end without an undefined state transition** (the acceptance gate; §7 traces + §6 matrix).

Component and interface names introduced here are **normative** — later prompts reuse them verbatim.

## 2. Component inventory

Each component has one accountable owner and sits in exactly one plane (control vs data, per
[ADR-0002](decisions/ADR-0002-topology-tenancy-and-storage-controller.md)). `→ ADR` gives the deciding
record; `→ seam` gives the CSS 7.1.9 extension point from [DBX-01](dbx-01-extension-map.md).

### Data plane (public Solid request path)

| # | Component | Responsibility | Basis |
|---|---|---|---|
| C1 | **CSS resource server** | Solid/LDP storage, discovery, WAC authorization surface | CSS 7.1.9 core |
| C2 | **LWS adapter** | Track B storage descriptions, `application/lws+json`, AS-discovery challenge, LWS operation mapping | → ADR-0024/0025; seam: `TypedRepresentationConverter`, `StorageDescriptionAdvertiser` |
| C3 | **Authenticated-context extractor** | Build the immutable verified request context (WebID, client, issuer, audience, assurance, actor/delegation) | → ADR-0010; seam: `CredentialsExtractor`/`Credentials` (DBX-12) |
| C4 | **Composed Databox authorizer** | Conjunction: tenant ∧ WAC ∧ relationship ∧ assurance ∧ record-grade ∧ immutability ∧ ODRL precondition; narrow-never-broaden | → ADR-0003; seam: `PermissionReader` union / `Authorizer` (DBX-14) |
| C5 | **Tenant resolver** | Resolve+validate program tenant from origin/audience **before** authorization; carry tenant identity immutably into the op (TOCTOU-safe) | → ADR-0002; DBX-03 T-01/T-54; DBX-11 |
| C6 | **Append-only / quarantine store decorators** | Reject replace/delete on accepted resources (create-yes/replace-no); quarantine binary evidence | → ADR-0018/0022; seam: `PassthroughStore`/`ReadOnlyStore` |
| C7 | **Deposit/submission gateway** | Validate container, media type, size, shape, class, legal basis, purpose, policy ref, idempotency, issuer signature | → ADR-0016/0017; exchange flow |
| C8 | **Monitoring → outbox emitter** | Emit a committed-change event per accepted write into the transactional outbox | → ADR-0011; seam: `MonitoringStore` |

### Control plane (never reachable by an ordinary consumer/data-plane token — B9)

| # | Component | Responsibility | Basis |
|---|---|---|---|
| C9 | **Databox authorization server / broker** | Per-program IdP trust; RFC 8693 token exchange; resolve active grant for subject+client+realm; issue short, audience-bound, holder/sender-constrained access tokens | → ADR-0005/0006/0009 |
| C10 | **Provisioning service** | Idempotent box creation, opaque identifiers, policy install, relationship binding, suspension/revocation | → ADR-0002; seam: `PodManager`/`IdentifierGenerator` (DBX-10) |
| C11 | **Institutional integration plane** | Protected typed customerID→opaque mapping registry; source-outbox consumption; institutional signing; account-linking; submission intake → review routing | → ADR-0016 |
| C12 | **ODRL evaluator + obligation engine** | Validate/resolve immutable policy; evaluate permission/prohibition/precondition; durable duty state machine + handlers | → ADR-0012/0013/0014 |
| C13 | **Evidence ledger** | Append-only, external-to-Pod, hash-chained/WORM-equivalent; receipts, audit events, duty transitions, key history | → ADR-0019 |
| C14 | **Notification worker** | Drain outbox; deliver minimal LDN/Solid-Notifications hint; SSRF-guarded endpoint validation; delivery evidence | → ADR-0011; seam: notifications (net-new durability) |
| C15 | **Cursor/event-feed service** | Authenticated per-connection ordered feed over committed events; the authoritative missed-event recovery contract | → ADR-0011 |
| C16 | **Status service** | BitstringStatusList publication for credential + grant status | → ADR-0007 |
| C17 | **Review queue + disposition** | Human/governed submission review; append signed disposition; no direct system-of-record write | → ADR-0016/0023 |
| C18 | **Key management (KMS)** | Custody of program signing keys, credential-issuer keys, at-rest keys; rotation; separated from C10/C11 (boundary B10) | → ADR-0021; DBX-03 B10/T-33/T-58 |

### External / consumer side

| # | Component | Responsibility | Basis |
|---|---|---|---|
| C19 | **External IdP** (simulated in hackathon) | Human authentication + assurance assertion for onboarding/recovery/step-up | → ADR-0005; HAK-03 |
| C20 | **Consumer agent / vault** | Per-program connection registry; import credential; discover; obtain tokens with holder-key proof; retrieve+verify+retain; submit; present ODRL | → ADR-0024 |
| C21 | **Institutional bridge** (per program) | Consume committed source events; resolve mapping; sign; deposit; retain receipt | → ADR-0016; DBX-22 |

## 3. Deployment topology and trust boundaries

Boundaries B1–B10 are inherited from [DBX-03 §3](dbx-03-threat-model.md). Each program is a separate tenant
(distinct origin/subdomain preferred, ADR-0002).

```text
  C19 external IdP ──B6──▶ C9 broker/AS ◀──B6── C20 consumer vault (per-program connection registry)
                              │  RFC 8693 exchange; holder-key proof (ADR-0008)                 │
                              │                                                                  │ B8
              ┌───────────────┴─────────── DATA PLANE (per tenant) ──────────────────────────────▼──────┐
              │  C5 tenant resolver ─▶ C3 context ─▶ C4 composed authorizer ─▶ C6 append-only ─▶ C1 CSS │
              │        (B1 wall)              (assurance)     (narrow-never-broaden)   C7 gateway  + C2 LWS│
              │                                                     │ C8 monitoring→outbox              │
              └─────────────────────────────────────────────────────┼──────────────────────────────────┘
   B7 scoped   ▲                                                     │ committed event
   append-only │                                                     ▼
        C21 bridge ◀── committed source outbox ── C11 integration plane ─▶ C17 review queue
              ▲                                        │ (protected mapping; raw customerID stops here)
              │ system of record                       │
  ─ CONTROL PLANE (B9: no consumer token) ─────────────┼───────────────────────────────────────────────
        C10 provisioning   C12 ODRL/obligation   C13 evidence ledger   C14 notify worker ─▶ C15 cursor feed
              │                    │                    ▲                     │ (SSRF guard, B5 minimal)
              └──────── B10 ───────┴──── C18 KMS ───────┘                     ▼
              (key custody separated from provisioning/mapping)         C16 status service
```

**Authoritative rule:** HTTPS operations against the data plane (C1/C2) are the authoritative record of a
deposit/retrieval/submission (ADR-0011, invariant per review-item 7). Async components (C14/C15) are
delivery/recovery, never the source of truth. The control plane never acts through a consumer token (B9).

## 4. Interface catalog

Synchronous (S) interfaces are request/response on the hot path; asynchronous (A) interfaces are
event/queue. Each names its consumer, producer, and the failure owner (§6).

| IF | Type | From → To | Contract | Track |
|---|---|---|---|---|
| IF-01 | S | C20 → C9 | Token exchange: connection-credential ref + fresh holder-key proof → short-lived audience-bound access token (RFC 8693). **Provisional** — exact subject/actor-token wire semantics pending the Blocked sub-question in ADR-0005 → DBX-12 | B (A: Solid-OIDC) |
| IF-02 | S | C20/independent client → C1/C2 | Authenticated LDP op (GET/POST/PUT/PATCH/DELETE) with access token | A+B |
| IF-03 | S | C1 → C5 → C3 → C4 | Internal authorization pipeline: resolve tenant → build context → compose decision | A+B |
| IF-04 | S | C4 → C12 | ODRL precondition query for the target/action; returns allow/deny + activated duties. Runs under a **mediated internal service credential** — the consumer/data-plane token is never forwarded across B9 | A+B |
| IF-05 | S | C7 → C13 → C1 | **Commit protocol** (§7.0): append evidence event **and** outbox record atomically within C13 (single-store transaction, the commit point); on durable confirm, project bytes to C1 and issue receipt; C1 is a derived projection reconciled from C13 on divergence | A+B |
| IF-06 | S | C7 → C20/C21 | Signed acceptance receipt (after durable commit only) | A+B |
| IF-07 | A | C8 → C14 (via outbox in C13/store) | Committed-change event {opaque event id, tenant, resource ref, activity} | A+B |
| IF-08 | A | C14 → C20 | Minimal notification hint (opaque event id only; SSRF-guarded endpoint) | A (Solid Notifications) |
| IF-09 | S | C20 → C15 | Cursor pull: since-cursor → ordered committed events (authoritative recovery) | B (Databox ext.) |
| IF-10 | S | C21 → C11 | Source event ingest {typed customerID, source-event-id}; returns opaque relationship/Databox | control |
| IF-11 | S | C11 → C1/C2 | Bridge deposit (authenticated as program service identity, scoped append-only) | A+B |
| IF-12 | A | C7 → C17 (via C11) | Submission staged for review; returns nothing to data plane until disposition | control |
| IF-13 | S | C17 → C1/C2 | Signed disposition appended, linked to submission | A+B |
| IF-14 | S | C9/C4 → C16 | Credential/grant status check (BitstringStatusList). Mediated internal call; no consumer-token forwarding across B9 | B |
| IF-15 | S | C10 → C1 + C18 | Provision box + install policy + bind keys | control |
| IF-16 | S | C12 → C13 | Duty transition append (pending→…→fulfilled/failed) | control |
| IF-17 | S | any signer → C18 | Sign/rotate/revoke via KMS (keys never leave C18) | control |
| IF-18 | S | independent client → C1/C2 | Standard Solid discovery + Solid-OIDC auth (no broker token required) | A |
| IF-19 | S | C12 (admin) → C12 registry + C13 | Publish/admit a signed immutable policy version: verify signature + attestation + corpus digest, record {effective time, affected classes, prospective/retroactive rule, prior version}; **unattested → not admitted (fail closed)** | control |
| IF-20 | S | C9 → C19/C20 | Step-up challenge: issue a re-auth requirement; resume by re-entering IF-03 once a fresh external auth event (IF-01) raises the assurance context | A+B |

## 5. Track A / Track B adapter split

Per [ADR-0024](decisions/ADR-0024-track-separation-and-experimental-isolation.md), the two tracks are
separate config presets; enabling Track B must not mutate a Track A representation (S-25).

| Concern | Track A (Solid, production baseline) | Track B (LWS, experimental preset) |
|---|---|---|
| Authentication | Solid-OIDC via `@solid/access-token-verifier` (C3) | LWS auth suites: OIDC + self-signed Controlled Identifier (ADR-0006) |
| AS discovery | OIDC discovery (oidc-provider) | `WWW-Authenticate` AS challenge + metadata (C9) |
| Token acquisition | Solid-OIDC access token | RFC 8693 token exchange (IF-01) |
| Authorization surface | WAC (C1) narrowed by C4 | WAC + LWS ODRL Access Grant narrowed by C4 |
| Access agreement | WAC ACL | LWS ODRL Access Request/Grant + Databox ODRL profile |
| Media type | Turtle/JSON-LD | + `application/lws+json` (C2) |
| Storage discovery | Solid storage description | LWS storage description (C2) |
| Notifications (hint) | Solid Notifications channel | same Solid Notifications channel |
| Sender constraint | DPoP (existing) | Bearer baseline + profiled sender-constraint for high grades (ADR-0006) |

Both tracks share C4–C18 unchanged: the Databox invariants (tenant, assurance, append-only, ODRL, evidence)
are enforced identically regardless of track. Only the authentication/discovery/token front-end differs.
**The C15 cursor/event-feed recovery contract is track-agnostic** (shared C4–C18): every accepted deposit,
on either track, is recoverable through it (IF-09). The Solid Notifications channel is a same-on-both-tracks
low-latency hint only; it is never the recovery contract (ADR-0011).

## 6. Authoritative-state matrix (single owner per state)

The gate requires no undefined state transition; the prerequisite is that **exactly one component owns each
piece of state**, and every other component treats it as derived/read-only. Cross-references guarantee no
two components claim the same truth.

| State | Authoritative owner | Durability | Readers (derived) | Failure owner |
|---|---|---|---|---|
| **Evidence / audit / receipt / outbox** | C13 evidence ledger | append-only, external, hash-chained; **the commit anchor** | C1 (byte projection), C15, C20 | C13 |
| Record/submission **bytes** | C13 (source of truth) → **projected** into C1 | derived from C13; reconciled on divergence | C20 (retained copy) | C7 (rejects pre-commit); reconciler (repairs from C13) |
| **Relationship ↔ customer mapping** | C11 mapping registry | control-plane store | C9 (resolves grant), C10 | C11 |
| **Access grant + relationship status** | C9 authorization server | control-plane store | C4 (per request), C20 | C9 |
| **Delegation/guardianship grant** (scope, expiry, status) | C9 authorization server | control-plane store | C4 (per op, T-47) | C9 |
| **Credential + grant revocation status** | C16 status service | BitstringStatusList | C9, C4, C20 | C16 |
| **Assurance context** (per request) | C3 (from verified claims) | ephemeral (request-scoped) | C4 | C3 (fail closed) |
| **Step-up / re-auth-pending** | C9 (challenge issued, awaiting IF-01) | ephemeral, bounded | C3/C4 (resume via IF-03) | C9 |
| **Tenant identity** (per request) | C5 (before authz) | ephemeral, carried immutably | C4, C6, C7 | C5 |
| **ODRL policy version** | C12 policy registry | immutable, signed (admitted via IF-19) | C7 (binds in receipt), C13 | C12 |
| **Duty state** | C12 obligation engine | durable state machine + C13 | C15, C20 | C12 |
| **Notification delivery state** | C14 (+ evidence in C13) | outbox (in C13) + evidence | C20 | C14 (retry; never rolls back deposit) |
| **Committed-event feed + retention window** | C15 (server) | retention-bounded projection of C13 | C20 | C15 |
| **Cursor read offset** | C20 (client-held) | client-persisted | — | C20 (reconcile against C15) |
| **Keys** | C18 KMS | HSM-equivalent | signers (via IF-17 only) | C18 |
| **Box/resource identifiers** | C10 (CSPRNG) + protected map C11 | never reassigned | all | C10 |

## 7. Sequence traces (the six required flows)

Notation: `→` sync call, `⇒` async event, `⟂` fail-closed branch. Every terminal state is defined (accepted /
denied / challenged / failed-retryable / rejected / queued / superseded), and every arrow cites the IF and
owning component.

### 7.0 Commit protocol (shared by 7.1 and 7.2)

Cross-system atomicity between the in-Pod store (C1) and the external ledger (C13) is **not** assumed as a
primitive. The commit point is a single-store transaction inside C13:

```text
C7 gateway (validated) → IF-05 step 1: BEGIN C13 txn → append {evidence event + outbox record} → COMMIT
   ⟂ C13 commit fails → FAILED-RETRYABLE (5xx to caller); nothing accepted, no receipt, no event emitted
   → on durable C13 confirm: this deposit/submission is ACCEPTED (C13 is the source of truth)
   → IF-05 step 2: project bytes into C1 (append-only C6)
       ⟂ projection fails/diverges → the reconciler repairs C1 from C13 (C13 already authoritative);
         acceptance and receipt still stand — availability of the C1 read may lag, never correctness
   → IF-06: signed acceptance receipt (bound to the C13-committed digest) returned to caller
   ⇒ IF-07: the outbox record (already committed in C13) is drained by C14
```

This makes receipt-after-durable-commit, no-lost-events (outbox in the same txn), and no-events-for-
uncommitted-deposits all hold without a distributed transaction.

### 7.1 Deposit (institutional bridge → Databox)

```text
C21 bridge: source event committed  → IF-10 → C11 resolve mapping (raw customerID stays in C11)
  ⟂ mapping ambiguous/absent → fail closed → governed review (C17); no deposit → terminal REVIEW
C21 sign via IF-17(C18)  ⟂ KMS unavailable → deposit not attempted; retryable at source outbox → terminal FAILED-RETRYABLE
  → IF-11 → C1/C2 authenticated as program service identity
  → IF-03: C5 resolve+validate tenant (carried immutably into the op)  ⟂ wrong tenant → 403 (no existence leak) [T-01/T-02/T-54]
  → C3 build context  → C4 compose (WAC append ∧ relationship ∧ record class ∧ ODRL precondition IF-04→C12, mediated cred)
     ⟂ any layer denies → 403/401, deny event ⇒ C13 → terminal DENIED [T-25 policy substitution caught here]
  → C7 gateway validate {class, legal basis, purpose, policy ref, idempotency, signature, size/shape}
     ⟂ invalid → deterministic non-leaking error → terminal REJECTED
     ⟂ duplicate idempotency key → return original receipt (C13) → terminal ACCEPTED (idempotent replay) [T-24]
  → C6 append-only accept (create allowed; replace would be rejected) [T-26]
  → IF-05 commit protocol (§7.0): C13 txn commit is the accept point; bytes projected to C1; receipt after durable confirm
     ⟂ C13 commit fails → terminal FAILED-RETRYABLE (no acceptance, no receipt) [ADR-0019]
  → IF-06: signed acceptance receipt returned to C21
  ⇒ IF-07: outbox record (committed in C13) drained by C14
Terminal: ACCEPTED (durable) + receipt — or REVIEW / FAILED-RETRYABLE / DENIED / REJECTED, each defined. Notification is 7.4.
```

### 7.2 Consumer submission (vault → Databox)

```text
C20 vault: obtain token IF-01→C9 (holder-key proof; wrong realm/revoked → no token → terminal DENIED [T-08/T-49])
  → IF-02 POST to append-only submission container
  → IF-03 tenant/context/authorizer
     ⟂ assurance insufficient for submission class → C9 issues step-up (IF-20) → terminal CHALLENGED (awaiting step-up);
        resume: C20 completes a fresh external auth event (IF-01 raises assurance) → re-enter IF-03 [T-12]
  → C7 validate {relationship, client, assurance, purpose, payload}  ⟂ over-scoped/no explicit purpose → terminal DENIED [T-53]
  → C6 append-only accept  → IF-05 commit protocol (§7.0)  ⟂ C13 commit fails → terminal FAILED-RETRYABLE
  → IF-06 signed receipt to C20 [invariant 8, T-46]
  ⇒ IF-12 submission staged to C17 review queue (NOT applied to system of record) [ADR-0016]
  C17: human/governed disposition  → IF-13 signed disposition appended, linked to submission
       ⇒ IF-16 duty state (stageForReview → fulfilled) to C12/C13
Terminal: submission ACCEPTED + receipt (or CHALLENGED / DENIED / FAILED-RETRYABLE); disposition APPENDED later (linked).
Source-of-record write only via C11 after disposition.
```

### 7.3 Denial (unauthorized retrieval)

```text
C20/attacker: IF-02 GET protected resource
  → IF-03: C5 tenant ⟂ / C3 context ⟂ / C4 compose:
      - unauthenticated → 401 (Solid §2.1)
      - authenticated but no permission → 403
      - no Read permission AND resource would 404 anyway → 404 (existence hiding, reuse CSS reportAccessError) [T-07, invariant 3]
      - insufficient assurance for grade → 403 + step-up challenge (no existence leak) [T-12]
  ⇒ deny event → C13 (records actor/client/issuer/decision/reason, no protected content) [ADR-0019]
Terminal: DENIED with a defined status; no state mutated; audit-visible. Every branch returns a defined code.
```

### 7.4 Notification failure + recovery

```text
⇒ IF-07 committed event in outbox (deposit already ACCEPTED and durable — 7.1)
C14 worker: validate endpoint (SSRF guard: deny private/link-local, bounded redirects) [T-38]
  → IF-08 deliver minimal hint (opaque event id only) [T-36]
     ⟂ delivery fails → bounded-backoff retry; duty signalHolder state = attempted/failed (NOT fulfilled) [T-39/T-50]
        → deposit remains ACCEPTED (never rolled back) [invariant 7, ADR-0011]
Recovery: C20 reconnects → IF-09 cursor pull since last cursor → C15 replays ordered committed events exactly once [T-39]
  → C20 retrieves via IF-02, retains copy, updates cursor
Terminal states are distinct: queued / attempted / sent / durably-retrievable(cursor) / acknowledged / failed.
Notification never being fulfilled does NOT invalidate the accepted deposit or its receipt.
```

### 7.5 Key rotation

```text
C18 KMS: initiate rotation for a program signing/credential key (scheduled or post-compromise [T-33])
  → new key generated; OLD key **appended** to key history in C13 — this append is the rotation commit point — never destroyed [ADR-0019]
     ⟂ C13 key-history append fails → terminal ROTATION-ABORTED (prior key remains active; no state changed)
  → C16 status: mark affected credentials for rotation where required
     ⟂ C16 update fails after C13 commit → retry C16 (C13 history is authoritative; rotation already committed, status catches up)
  → new signatures use new key (IF-17); verification accepts old key for artefacts signed before rotation (key history)
  ⟂ rotation cannot preserve access to prior-key-encrypted data → terminal ROTATION-ABORTED, no orphaning [ADR-0021 failure]
Consequences that MUST hold: previously issued receipts still verify (old key in history) [T-28];
  a compromised old key is revoked via C16 so new tokens/credentials under it fail [T-33];
  connection credentials rotate per ADR-0007/0009 with holder-key re-proof.
Terminal: ROTATED; historical evidence still verifiable; obsolete access withdrawn.
```

### 7.6 Policy update

```text
C12: IF-19 publish/admit a new signed immutable policy version with {effective time, affected asset classes,
     prospective/retroactive rule, retained prior version} [ADR-0014]
  ⟂ compiled bundle unsigned/unattested/failed-digest → NOT admitted → terminal REJECTED; dependent actions fail closed [ADR-0015, T-25]
Accepted record BYTES and historical receipts remain immutable (never rewritten) [invariant 7]
Authorization/duties going forward use the new version; existing assets governed per the prospective/retroactive rule:
  - prospective (default): new version governs new assets only
  - authorized retroactive re-eval: explicit transition event; re-evaluation recorded in C13, history retained
New receipts/evidence bind {compiled-policy digest, corpus-manifest digest, attestation id, evaluator version} [T-25, ADR-0019]
Terminal: policy VERSIONED; each asset deterministically maps to the version that governed it; no silent change.
```

## 8. Failure ownership summary

| Failure | Owner | Behavior |
|---|---|---|
| Wrong tenant / TOCTOU | C5 | Fail closed before authz; 403 no leak (T-01/T-54) |
| Insufficient assurance | C3/C4 | Deny + step-up; never downgrade (T-12) |
| Invalid/duplicate deposit | C7 | Deterministic non-leaking error; duplicate → original receipt (T-24) |
| Non-durable commit | C7+C13 | No receipt issued before durable commit (ADR-0019) |
| Notification delivery | C14 | Retry; never roll back deposit; duty ≠ fulfilled (T-39) |
| Consumer disconnect | C15/C20 | Cursor recovery within retention window (T-39) |
| Broker/AS outage | C9 | No new tokens; durable records still retrievable per grant; no raw-external-token fallback (T-41) |
| Key compromise | C18/C16 | Rotate + revoke; key history preserved (T-33) |
| Unattested policy | C12 | Not admitted; fail closed (ADR-0015) |
| Module tampering | C10/DBX-28 | Startup integrity check rejects tampered preset (T-58) |

## 9. Architecture decisions recorded here (feed DBX-05)

1. **Tenant resolution (C5) precedes authorization (C4)** and the resolved tenant is carried immutably into
   the store op — closes T-01/T-54. (New requirement for DBX-11.)
2. **The commit point is a single-store C13 transaction** (evidence event + outbox record), not a
   distributed transaction across C1 and C13 (§7.0). C13 is the source of truth; C1 bytes are a projection
   reconciled from C13. Receipt is issued only after durable C13 confirm — the anchor for invariants 7/8,
   no-receipt-before-commit, no-lost-events (outbox in the same txn) and no-events-for-uncommitted-deposits.
3. **C15 cursor feed — not C14 outbox — is the consumer recovery contract.** The outbox is internal.
4. **KMS (C18) is a distinct component behind boundary B10**, separated from provisioning (C10) and mapping
   (C11) — closes T-33/T-58 custody concerns.
5. **C4 is authorization-system-neutral** (ADR-0003): WAC today, ACP-swappable; the same C4 conjunction runs
   on both tracks.
6. **Track A and Track B differ only in the C1–C3/C9 front-end** (§5); C4–C18 are identical — so a Track B
   experiment cannot weaken a Track A control.

## 10. Acceptance-gate self-check

- **"Deposit, submission, denial, notification failure, key rotation and policy update traced without an
  undefined state transition":** §7.1–7.6 — every flow terminates in a defined state and every branch
  (including ⟂ fail-closed) is specified. ✔
- **"Which system is authoritative for each state":** §6 matrix — exactly one owner per state, all others
  derived. ✔
- **"Trust boundaries, sync/async interfaces, failure ownership":** §3 (B1–B10), §4 (IF-01…IF-18 typed
  S/A), §8 (failure owners). ✔
- **"Separate Track A Solid and Track B LWS adapters; do not claim CSS supplies draft interfaces":** §5 —
  Track B front-end is explicitly the experimental preset (ADR-0024); C9/C2 are net-new (DBX-01 §9). ✔
- **"Include legal-source ingestion → compilation stages":** policy update (§7.6) consumes the attested
  compiled bundle from ADR-0015's pipeline via IF-19; the runtime never interprets law. ✔

## 11. Independent trace-check

An independent Hard architecture reviewer (that did not write this) verified the six flows against the gate.
It confirmed §7.3 (denial) was clean and that C5-before-C4 and the Track A/B split held, and found a
cross-cutting root cause: the draft treated "durable atomic commit" across the in-Pod store (C1) and the
external ledger (C13) as a primitive. All findings were incorporated: the **§7.0 commit protocol** (C13
single-store txn as the commit point, C1 as a reconciled projection, outbox inside the txn); a defined
**step-up** state and resume path (IF-20, §6 row, §7.2); named failure terminals (FAILED-RETRYABLE /
REJECTED / REVIEW / CHALLENGED / ROTATION-ABORTED) on every ⟂ branch; **B9 mediation** notes on IF-04/IF-14
(no consumer-token forwarding); a policy-publish interface (**IF-19**); a track-agnostic **cursor feed**;
split single-owner **cursor rows**; a **delegation/guardianship grant** state row (T-47); and IF-01 marked
**provisional** pending the Blocked ADR-0005 wire detail. With these, each of the six flows terminates in a
defined state with a single owner per state.
