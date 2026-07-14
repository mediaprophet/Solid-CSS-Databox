# DBX-03 — Adversarial-Test Backlog

**Prompt:** DBX-03 (Wave A). **Consumed by:** DBX-25 (integration), DBX-26 (adversarial suite), DBX-27 (conformance).
**Companion:** [threat model](dbx-03-threat-model.md) (T-ids). **Status:** complete.

Each `AT-nn` verifies the control(s) for the matching `T-nn`. IDs are stable and map 1:1 to threats. Every
test states the **attack setup**, the **expected safe outcome** (what "pass" means), and the **evidence to
capture** for the DBX-26 findings bundle. A test **fails** if the attack succeeds OR if the denial leaks
protected information (existence, identifiers, cross-program facts). "Fail closed" outcomes must also be
audit-visible (evidence ledger, ADR-0019).

Priority: **P1** = critical isolation/identity/evidence; must pass before any release (DBX-26 gate). **P2**
= important; **P3** = hardening/robustness. Net-new-control tests (no CSS precedent, DBX-01) are marked ⚠.

## Tenant escape & cross-program (B1)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-01 | P1 | Take a valid token for box A, rewrite host/path to box B's URL | 401/403 with no existence disclosure; tenant check fails before authz | Request/response, audit deny event with tenant mismatch reason |
| AT-02 | P1 | Use program A's bridge service credential to append to program B containers | Denied at WAC + Databox validation (program/relationship/issuer mismatch) | Deny event, WAC decision, Databox validation reason |
| AT-03 | P1⚠ | Given two pairwise subjects, attempt to prove they are the same person using only tokens/URLs/logs/analytics | No global identifier present anywhere; correlation not possible from protocol artefacts | Grep of tokens/URLs/logs/metrics for any shared correlator (must be none) |
| AT-04 | P2 | On a path-only-tenancy deployment, craft a URL that walks into another tenant | Rejected; and config lint flags path-only tenancy as discouraged | Response + config-warning assertion |
| AT-05 | P2 | Deposit a record with RDF links to another box; request server-side dereference on the auth path | Server does not follow cross-tenant links to make an authz decision | Trace showing no cross-tenant fetch |

## Consumer↔consumer (B2)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-06 | P1 | Brute-force/guess box and resource identifiers of another consumer | No hit within budget; every op requires authz regardless of URL knowledge | Enumeration attempt log, all denied/404 |
| AT-07 | P1 | Compare responses for existing-but-forbidden vs non-existent resources | Indistinguishable (404-not-403 rule); no timing oracle beyond threshold | Paired responses + timing distribution |
| AT-08 | P1 | Present consumer X's access token/credential to program Y's realm | Denied (audience/program/holder mismatch) | Deny event with binding-mismatch reason |

## No wallet browsing (B3)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-09 | P1 | As a program, attempt to read the consumer's registered inbox/WebID/storage | No read capability from registration alone; requires explicit narrow grant | Attempted GETs denied; grant-scope check |
| AT-10 | P2 | Infer other connections/wallet contents from submission shape/timing | Only the explicitly submitted purpose-scoped fields are visible | Submission payload diff vs vault contents |
| AT-11 | P1 | Issue a general "read consumer profile" query to the program surface | No such endpoint; only explicit consumer-initiated create exists | 404/405 on any general-query attempt |

## Identity / broker / confused deputy (B6)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-12 | P1⚠ | Inject assurance/actor/delegation claims via header or unverified JWT segment | Ignored; assurance taken only from verified signed claims; high-grade denied | Deny + step-up; assertion that header/unverified claims were dropped |
| AT-13 | P1 | Present a cryptographically valid token from an issuer not in the program trust list | Broker rejects (issuer not approved) even though signature verifies | Broker deny event, issuer-not-trusted reason |
| AT-14 | P1 | Simulated approved-IdP assertion for the wrong human; attempt to bind a customer record | Linking fails without account-linking challenge + holder proof + audited confirmation | Ceremony transcript showing fail-closed at linking |
| AT-15 | P1 | Request token exchange for a realm the subject holds no grant for | No token issued (no active grant for subject+client+realm) | Broker deny; grant-lookup result |
| AT-16 | P1 | Attempt full flow with an independent Solid-OIDC client + external issuer (no broker token) | Succeeds for permitted access — the standard path is not blocked | Successful independent-client transcript |

## Token & credential replay

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-17 | P1 | Present the connection-credential document itself as a bearer access token | Rejected; access requires fresh holder-key proof | Deny event; "credential is not a token" reason |
| AT-18 | P2 | Search the vault/store for a reusable long-lived bearer/refresh token | None exists; only short-lived holder-key-derived JWTs | Store inspection showing no refresh token at rest |
| AT-19 | P1 | Capture a 5-min access token, replay from a different client / after expiry / wrong audience | Rejected on each; sender-constraint blocks high-grade replay | Replay attempts + denials |
| AT-20 | P1 | Use a stolen bridge signing key to forge an institutional record | Record proof verifies key identity + history; revoked key rejected | Proof validation result; revocation check |

## Deposit / submission gateway (B7)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-21 | P1⚠ | Deposit malicious JSON-LD: remote `@context`, entity/expansion bomb, unknown terms | Pinned contexts used; bounded parse; unknown terms fail closed; no remote fetch | Parse trace; deny/normalise result |
| AT-22 | P2 | Deposit oversized / zip-bomb binary evidence | Rejected by size/media-type bound; quarantined not served | Size-limit deny; quarantine state event |
| AT-23 | P1 | Deposit to wrong container / wrong purpose / wrong record class | Deterministic deny with non-leaking reason | Deny event with validation reason |
| AT-24 | P1 | Replay the same source event id multiple times | Exactly one logical record; duplicates return original outcome/receipt | Idempotency-key evidence; single record |
| AT-25 | P1 | Attach a forged/weaker ODRL policy to a deposited record | Rejected; receipt binds compiled-policy+corpus+attestation digests; substitution detected | Policy-digest mismatch deny |

## Append-only / evidence integrity

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-26 | P1⚠ | PUT/PATCH/DELETE an accepted record as consumer, program, owner, and admin in turn | All four actor classes denied replace/delete; create still works | Four deny events across actor classes |
| AT-27 | P1 | Attempt to edit/reorder evidence-ledger entries via ordinary Pod ops | Denied; ledger is external append-only; tamper detectable | Integrity-check result; deny event |
| AT-28 | P1 | Provider deletes a record, then challenge a previously exported receipt | Receipt still verifies independently | Offline receipt verification pass post-deletion |
| AT-29 | P2 | Invoke deletion and check whether bytes are destructively erased | Tombstone + evidence event created; history retained per retention | Tombstone event; retained history |

## Provider operator / support / control plane (B4/B9) — invariant 10

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-30 | P1 | As operator, read payloads directly from storage backend/object store | In an at-rest-encrypted/provider-blind profile: ciphertext only; in custodian profile: access is audited + disclosed | Key-boundary check; audit event; profile disclosure |
| AT-31 | P1⚠ | Attempt to obtain/use a platform-wide data-plane credential | No such credential exists; control plane cannot act via a consumer token | Absence proof; deny event |
| AT-32 | P1 | Use backup/restore or support tooling to alter or resurrect data outside evidence | Tenant-aware, audited; evidence ledger unaffected/ tamper-evident | Restore audit; ledger integrity check |
| AT-33 | P2 | Simulate signing/encryption key compromise; rotate and revoke | Old key revoked, new key in history; prior receipts still verify; access via old key fails | Rotation evidence; revocation effect |
| AT-34 | P1 | As tenant admin, try to reconstruct the cross-program identity graph from admin views | No global key; admin scope tenant-bound; graph not reconstructable | Admin-view scope assertion; no correlator |

## Metadata / analytics leakage (B5)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-35 | P1 | Scrape URLs, logs, queue names, metrics labels, tracing baggage, notification previews, backups for identifiers | No PII/correlator in any surface | Automated scan across all surfaces (must be clean) |
| AT-36 | P1 | Inspect a notification payload at the transport/endpoint | Only opaque event id + classification; no record content | Captured notification payload |
| AT-37 | P2 | Attempt to enable cross-program aggregation via a config/feature | No protocol feature exists; blocked without independent legal basis | Absence proof; config assertion |

## Outbound delivery / SSRF

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-38 | P1⚠ | Register a notification/webhook endpoint at 127.0.0.1 / 169.254.169.254 / internal host / redirect chain | Rejected; private/link-local blocked; redirects bounded to non-private | Endpoint-validation deny; redirect trace |
| AT-39 | P1 | Force notification delivery to fail after an accepted deposit | Deposit stays accepted; duty state = failed/queued, not fulfilled; retryable | Deposit state + duty state divergence |
| AT-40 | P3 | Flood outbox/retry to exhaust resources | Bounded backoff + dedup hold; no unbounded growth | Queue metrics under load |

## Availability & interop

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-41 | P2 | Take the broker/AS offline | New tokens fail; already-durable records still retrievable per grant; no raw-external-token fallback | Behaviour under broker outage |
| AT-42 | P1 | Enable Track B (LWS) and re-run Track A conformance | Track A representations/controls unchanged | Track A diff before/after Track B enable |
| AT-43 | P2 | Cross-origin browser client with ambient credentials attempts CSRF | Blocked by defined CORS/credentials/CSRF rules | CORS preflight + rejection |

## Coerced / malicious consumer (B8)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-44 | P2 | Coerced consumer deletes their vault copy and demands the institutional record vanish | Institutional record + evidence persist; independent receipt still valid | Persistence proof; receipt verification |
| AT-45 | P1 | Submit a forged high-assurance self-asserted "fact" | Marked self-asserted; not applied to source of record without review; crypto validity ≠ truth | Submission classification; review gate |
| AT-46 | P2 | Make a submission, then repudiate it | Signed receipt binds sender+digest+time; repudiation refuted | Receipt verification |

## Lifecycle, agent-side, injection & supply-chain (red-team additions)

| AT | Pri | Attack setup | Expected safe outcome | Evidence |
|---|---|---|---|---|
| AT-47 | P1 | Appointed guardian reads outside delegated scope; then acts after guardian expiry/revocation | Both denied and audited; delegation scope + status checked per op | Two deny events (scope, post-revocation) |
| AT-48 | P1 | Trigger email-only recovery and request a record that originally required strong proofing; rotate a key and check old grants | High-proof record denied at low assurance; rotated-out key/grant no longer resolves | Recovery-assurance deny; post-rotation grant check |
| AT-49 | P1 | Revoke a relationship/credential, then use an already-issued, not-yet-expired token (sensitive + low grade) | Sensitive grade denied within stated bound via per-request re-check; low-grade window bounded + disclosed | Deny event + status re-check evidence; window measurement |
| AT-50 | P1 | Force a non-notify duty handler (retention deletion, prior-recipient propagation, correction clock) to no-op/fail | Duty state = failed/pending, never fulfilled; unevaluated fails closed; audit shows it | Duty state machine trace; audit event |
| AT-51 | P1⚠ | Deposit a record with active links / rendering directives / ODRL crafted to make the agent exfiltrate or auto-submit | Reference agent performs no outbound fetch/auto-submission; record treated as inert data | Agent network trace (no exfil); rendering-safety assertion |
| AT-52 | P1⚠ | Relay/MITM the ceremony step-5 holder-key proof to bind the credential to an attacker key | Binding fails; proof is channel-bound/nonce'd; step-7 confirms the intended key | Ceremony transcript; bind-mismatch deny |
| AT-53 | P2 | Make a submission without explicit per-purpose consumer authorization; write to a push inbox beyond its named scope/after expiry | Rejected; explicit authz required per submission; push grant scope/expiry enforced per write | Deny events; grant-scope check |
| AT-54 | P1⚠ | Mutate the tenant mapping / move the target between tenant resolution and the store op | Op does not land in the wrong tenant; store re-validates target tenant binding | Trace showing re-validation; deny on mismatch |
| AT-55 | P2 | Submit fields with CRLF / malicious triples in WebID, purpose, reason, policy-ref; read the audit ledger and consumer audit-view | No injected log lines or triples; untrusted values escaped/encoded | Ledger + audit-view inspection (clean) |
| AT-56 | P2 | Observe status-list index / herd size / status-endpoint access across many checks | No usable correlator; adequate herd; private/aggregated retrieval | Status-check traffic analysis |
| AT-57 | P2 | Deposit a crafted policy/credential that forces expensive ODRL conflict resolution / chained VC verification | Bounded by complexity limit + verification budget; exceed → fail closed, not hang | Timing under attack; fail-closed event |
| AT-58 | P1⚠ | Swap a security decorator (append-only store / SSRF guard / tenant resolver) for a permissive module in the preset | Startup integrity check / digest pinning rejects the tampered preset; server refuses to start or flags | Integrity-check failure; SBOM/digest evidence |

## Coverage note

58 tests ↔ 58 threats ↔ 12 invariants (threat-model §7). ⚠-marked tests (AT-03, 12, 21, 26, 31, 38, 51,
52, 54, 58, and the identity path) exercise **net-new controls with no CSS precedent** (threat-model §6)
and are the highest-value entries for DBX-26. AT-47…AT-58 were added from the independent red-team pass
(threat-model §10) and concentrate on lifecycle, agent-side abuse, audit injection and supply-chain. DBX-25
runs the positive-path equivalents; DBX-26 runs these negative paths and must reproduce every P1 before
release (its acceptance gate).
