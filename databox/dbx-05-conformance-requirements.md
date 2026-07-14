# DBX-05 — Executable Conformance Requirements

**Prompt:** DBX-05 (Wave A). **Agent level:** Hard. **Depends on:** DBX-01, DBX-02, DBX-03, DBX-04 (all accepted).
**Status:** complete. **Baseline:** CSS 7.1.9; specifications pinned by [ADR-0001](decisions/ADR-0001-specification-baseline-pinning.md).
**Companion:** [test-identification scheme](dbx-05-test-identification-scheme.md) (CR→test mapping, blocked items).
**Consumed by:** DBX-25 (integration), DBX-26 (adversarial), DBX-27 (conformance/interop).

## 1. Purpose, method and how to read a requirement

This document translates the twelve README **invariants** and the adopted **ADR** decisions into uniquely
identified, **executable** conformance requirements. It is the contract DBX-25/26/27 build test suites
against. Every requirement is written so that a reader can *run something and measure a result* — not
inspect the source for the presence of a class or a config key.

**Method.** Each requirement walks from an invariant + ADR + (where an attack exists) a DBX-03 threat, to a
normative MUST/SHOULD/MAY statement, to a single **OBSERVABLE pass/fail condition** (what you measure), to
the tests that exercise it. IDs are stable and never renumbered; a new requirement gets a new number
(mirroring the DBX-03 T-id discipline).

**Conformance classes (five).** A requirement binds exactly one accountable party, so each has its own id
prefix and section:

| Class | Prefix | Accountable party | Principal DBX-04 components |
|---|---|---|---|
| Server | `CR-SRV-nn` | The running Databox server (CSS + Databox/LWS adapters) | C1–C9, C12–C18 |
| Institutional bridge | `CR-BRG-nn` | Per-program bridge + integration-plane software the organisation runs | C11, C21 |
| Provider / operator | `CR-PRV-nn` | The hosting operator (infrastructure, KMS custody, support, backups) | infra around C13/C18 |
| Deployment | `CR-DEP-nn` | The party that assembles + signs a specific server configuration | config presets, manifests |
| Consumer agent | `CR-AGT-nn` | The person's chosen agent/vault software | C20 |

The **Solid compatibility matrix** (§8, ids `CR-SRV-C01…C10`) is a distinct section of server requirements
covering invariant 12 against the pinned baseline, split Track A / Track B per
[ADR-0024](decisions/ADR-0024-track-separation-and-experimental-isolation.md).

**Category tags.** Every requirement is tagged **POS** (a granted capability must work), **NEG** (an attack
must fail safely — tied to an AT-id), or **EVD** (something must be independently verifiable — receipt,
ledger, audit). Test ids: `AT-nn` = the existing DBX-03 adversarial test (negatives, DBX-26); `IT-nn` = new
integration/positive test (DBX-25); `CT-nn` = new conformance test (DBX-27); `EV-nn` = new evidence-
verification test. The full test-id scheme, ranges and blocked items are in the companion document.

**Normative keywords** MUST / SHOULD / MAY are used per RFC 2119/8174.

---

## 2. Server conformance class (`CR-SRV`)

### 2.1 Tenant isolation & topology

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-01** | POS | The server MUST resolve and validate the program tenant from the request origin/audience **before** any authorization layer runs, and MUST carry the resolved tenant identity immutably into the ResourceStore operation. | An internal request trace shows the tenant-resolution step (C5) completes before the first `PermissionReader` (C4) executes; a fuzzer that mutates the tenant mapping between resolution and store execution cannot land the op in another tenant (store re-validates and denies). **Fail** if any op reaches the store without a validated tenant, or if the resolve→execute race lands cross-tenant. | 1 | 0002 | T-01, T-54 | AT-01, AT-54, IT-01 |
| **CR-SRV-02** | NEG | Rewriting the host/path of an otherwise valid access token to address another program's box MUST be denied without disclosing existence. | The rewritten request returns 401/403 (or 404 per CR-SRV-C10) whose status **and** body are identical to the response for a non-existent box; a deny event with a "tenant mismatch" reason is written to the ledger. **Fail** if the response differs from the non-existent case in any observable byte or timing beyond the CR-SRV-03 threshold. | 1, 3 | 0002 | T-01 | AT-01 |
| **CR-SRV-04** | POS | Box and per-resource identifiers MUST be independent CSPRNG values of ≥128 bits with no PII or slug/name derivation. | Sampled identifiers pass a min-entropy estimate ≥128 bits and contain no substring of any provisioning input (customer name/email/id); an enumeration campaign within a stated request budget yields **zero** hits. **Fail** on any name-derived identifier or any enumeration hit. | 2, 3 | 0002 | T-06 | AT-06, IT-04 |
| **CR-SRV-21** | NEG | The server MUST NOT expose any platform-wide data-plane credential, and the control plane MUST NOT act through a consumer/data-plane token (boundary B9). | An attempt to obtain or use a platform-wide data-plane credential finds none exists (absence proof: no credential resolves for more than one tenant realm); a control-plane call presented with a consumer token is refused. **Fail** if any single credential authorizes data-plane access across two tenants. | 1, 10 | 0002, 0016 | T-31 | AT-31 |

### 2.2 Existence hiding & knowing-a-URL-is-not-access

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-03** | NEG | A request lacking Read on a resource MUST return the same response the server gives for a non-existent resource (reuse the CSS 404-not-403 `reportAccessError` rule); denials MUST NOT create a 403-vs-404 existence oracle. | Paired probes — (a) existing-but-forbidden, (b) non-existent — return byte-identical status line and body, and response-time distributions overlap within a declared threshold (no timing oracle). **Fail** if (a) and (b) are distinguishable by code, body, headers, or timing. | 3, 2 | 0025, 0023 | T-06, T-07 | AT-06, AT-07 |

### 2.3 Assurance-aware authorization

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-06** | POS | Access to a graded record MUST require the *current* authenticated assurance to meet the record grade, where assurance is derived **only** from verified signed claims — never from a request header or an unverified token segment. Insufficient assurance MUST yield deny + a step-up challenge, never a downgrade. | Given a record graded *G*: a session whose verified assurance ≥ *G* reads it; a session that injects assurance via header/unverified JWT segment is treated as the unenhanced grade and is denied with a step-up challenge; the constructed request context exposes an assurance value populated only from the verified claim. **Fail** if any unverified assurance signal raises access, or if under-assurance returns anything but deny+step-up. | 9 | 0010 | T-12 | AT-12, IT-06 |
| **CR-SRV-07** | NEG | A token from a cryptographically valid but per-program **untrusted** issuer MUST be rejected. | With a token whose signature verifies but whose issuer is absent from the program trust contract, the broker/context rejects it with an "issuer not approved" reason even though the signature is valid. **Fail** if any valid-signature token from an untrusted issuer is admitted. | 9 | 0005 | T-13 | AT-13 |
| **CR-SRV-19** | POS | For sensitive grades the server MUST re-check relationship/grant status **per request** (not only at token mint); for low grades the revocation-latency window MUST be bounded and disclosed. | After revoking a relationship, a not-yet-expired token presented against a sensitive-grade resource is denied within the stated bound (per-request status re-check evidence captured); the low-grade window is measured to be ≤ the disclosed token lifetime. **Fail** if a revoked sensitive-grade grant remains usable past the stated bound. | 4, 9 | 0009 | T-49 | AT-49, IT-19 |

### 2.4 Append-only records & evidence integrity

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-08** | NEG | An accepted record MUST NOT be replaced or deleted by *any* actor class (consumer, program, owner, admin); create MUST still succeed. The enforcing decorator MUST sit below authorization so no permission tier bypasses it. | PUT/PATCH/DELETE (and `setRepresentation` on an existing resource) as consumer, program, owner **and** admin each return a deny; POST create of a new resource returns 201. **Fail** if any of the four actor classes can replace/delete, or if create is blocked. | 7 | 0018 | T-26 | AT-26, IT-08 |
| **CR-SRV-09** | EVD | The evidence ledger MUST be append-only and external to the Pod (hash-chained/WORM-equivalent); ordinary Pod operations MUST NOT edit or reorder it, and tampering MUST be detectable. | An attempt to edit/reorder ledger entries via LDP ops is denied; an independent integrity check recomputes the hash chain and detects any injected/reordered entry. **Fail** if a ledger entry can be silently altered or the chain check passes over a tamper. | 7, 8 | 0019 | T-27 | AT-27, EV-09 |
| **CR-SRV-10** | EVD | Every accepted deposit/submission MUST produce a signed acceptance receipt binding {transaction id, canonical payload digest, pairwise sender, acceptance time, operation type, compiled-policy+corpus+attestation digests, idempotency key}, issued **only after** durable commit, and verifiable offline. | The receipt verifies against its signing key with no network access; its payload digest equals the digest of the committed bytes; no receipt is emitted for a transaction whose commit did not durably confirm. **Fail** if a receipt is issued pre-commit, fails offline verification, or binds a bare version string instead of the digests. | 8 | 0019, 0020, 0014 | T-46 | EV-10, IT-10 |
| **CR-SRV-11** | EVD | The commit point MUST be a single-store C13 transaction appending {evidence event + outbox record}; bytes are projected to C1 only after durable confirm; a failed commit MUST leave nothing accepted, no receipt and no emitted event. | Injecting a C13 commit failure yields a 5xx, no receipt, and no outbox/notification event; on success exactly one outbox event exists for the deposit and C1 bytes reconcile from C13. **Fail** if an uncommitted deposit produces a receipt or an event, or if a committed deposit produces zero or duplicate events. | 7 | 0019, 0011 | T-24, T-39 | IT-11, EV-11 |
| **CR-SRV-25** | NEG | Attaching a forged or weaker ODRL policy to a deposited record MUST be rejected; an unsigned/unattested compiled policy bundle MUST NOT be admitted (fail closed); the receipt MUST bind the compiled-policy/corpus/attestation digests so substitution is detectable. | A deposit carrying a substituted policy is denied on digest mismatch; publishing an unattested policy version via the policy interface is refused with the version not admitted; a receipt's bound digests match the admitted version only. **Fail** if a weaker/forged/unattested policy is ever accepted or governs a record. | 11 | 0014, 0015, 0019 | T-25 | AT-25, IT-25 |
| **CR-SRV-55** | EVD | Untrusted fields (WebID, purpose, reason, policy-ref) written to the ledger or the RDF audit projection MUST be escaped/typed so they cannot inject log lines or malicious triples. | Submitting fields containing CRLF and injection triples, then reading the ledger and the consumer audit-view, shows no injected log lines and no injected triples (values appear escaped/encoded). **Fail** on any injected line or triple. | 7, 8 | 0019 | T-55 | AT-55 |

### 2.5 Deposit/submission gateway & no-wallet-browsing

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-16** | NEG | The gateway MUST parse RDF/JSON-LD with pinned/offline contexts and bounded resources; remote `@context`, entity-expansion, unknown terms and pathological ODRL/VC chains MUST fail closed within a verification budget — never fetch remotely and never hang. | A deposit with a remote `@context`, an expansion bomb and unknown terms is parsed with no outbound fetch (trace confirms), unknown terms are rejected, and a crafted expensive ODRL/VC input hits the budget and returns a fail-closed event rather than exceeding the timeout. **Fail** on any remote fetch, unbounded parse, or hang. | 11, 12 | 0013, 0012 | T-21, T-57 | AT-21, AT-57 |
| **CR-SRV-17** | NEG | The server MUST expose no general query/read surface over consumer or wallet data; only explicit consumer-initiated create exists. Each submission MUST require explicit per-purpose authorization; a push-inbox grant MUST be resource/purpose-scoped, expiring, and verified on every write. | A "read consumer profile"/general-query request returns 404/405 (no such endpoint); a submission with no explicit purpose or over its granted scope is denied; a write to a push inbox beyond its named scope or after expiry is denied. **Fail** if any general read surface exists or an over-scoped/expired write succeeds. | 5, 6 | 0017 | T-11, T-53 | AT-11, AT-53 |

### 2.6 Token & credential binding

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-18** | NEG | The connection-credential *document* MUST NOT be accepted as a bearer access token; a captured short-lived access token replayed from the wrong client, after expiry, or against the wrong audience MUST be rejected; high grades MUST be sender-constrained. | Presenting the credential document as a bearer token is rejected ("credential is not a token"); a captured 5-min token replayed from a different client / after expiry / wrong audience is rejected on each; a store search finds no reusable long-lived bearer/refresh token at rest. **Fail** if the credential document or any replayed token authorizes access. | 4 | 0007, 0009, 0006 | T-17, T-18, T-19 | AT-17, AT-18, AT-19 |

### 2.7 Metadata leakage & outbound delivery

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-05** | NEG | No PII or cross-program correlator may appear in URLs, logs, queue names, metric labels, tracing baggage, notification previews or backups. | An automated scan across all of those surfaces for any customer identifier or a value shared across two pairwise relationships returns **zero** matches. **Fail** on any hit. | 2 | 0011, 0004 | T-35, T-36 | AT-35, AT-36 |
| **CR-SRV-12** | NEG | Outbound notification/webhook endpoints MUST be validated: private/link-local/metadata addresses denied, redirects bounded to non-private targets. | Registering an endpoint at `127.0.0.1`, `169.254.169.254`, an internal host, or a redirect chain into a private range is rejected by endpoint validation. **Fail** if any private/link-local target or unbounded redirect is delivered to. | 5 | 0011 | T-38 | AT-38 |
| **CR-SRV-13** | POS | A notification/duty delivery failure MUST NOT roll back an accepted deposit; duty states MUST be typed and an unevaluated/failed duty MUST NEVER be recorded as fulfilled. | Forcing delivery failure after acceptance leaves the deposit ACCEPTED with duty state `attempted`/`failed`; a duty handler that no-ops reports `failed`/`pending`, never `fulfilled`; every transition is in the ledger. **Fail** if a deposit rolls back or any unfulfilled duty shows `fulfilled`. | 7, 11 | 0011, 0012 | T-39, T-50 | AT-39, AT-50 |
| **CR-SRV-14** | EVD | Every accepted deposit MUST be recoverable through the authenticated since-cursor feed exactly once within the retention window, independently of best-effort notification. | Dropping the notification, then reconnecting and issuing a cursor pull since the last cursor, replays the missed committed event **exactly once**; the low-latency notification channel is never presented as the recovery API. **Fail** on a missed or duplicated event, or if recovery depends on the notification channel. | 7 | 0011 | T-39 | IT-14, EV-14 |

### 2.8 Token-exchange (Track B) — BLOCKED

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-22** 🔒 | NEG | *(BLOCKED — pending DBX-12.)* The RFC 8693 token exchange (IF-01) MUST bind the connection-credential reference **and** a fresh holder-key proof such that the broker issues a short-lived, single-audience token only when an active grant exists for subject+client+realm; a confused-deputy exchange for an ungranted realm MUST be refused. | Intended observable: a token-exchange request for a realm the subject holds no grant for yields no token (grant-lookup deny). **This requirement's exact subject-token/actor-token wire semantics are BLOCKED** by the ADR-0005 §residual sub-question (owner: DBX-12); its pass/fail cannot be finalised until that wire binding is decided. Recorded, not resolved. | 1, 4, 9 | 0005, 0009 | T-15 | AT-15 *(blocked; see companion §5)* |

---

## 3. Institutional-bridge conformance class (`CR-BRG`)

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-BRG-01** | NEG | A bridge MUST authenticate as its per-program service identity, scoped append-only to its assigned containers, and MUST NOT write to another program's containers. | Program A's bridge credential used against program B containers is denied at WAC + Databox validation (program/relationship/issuer mismatch reason recorded). **Fail** if program A's credential writes anywhere in program B. | 1 | 0016 | T-02 | AT-02 |
| **CR-BRG-02** | POS | Deposits MUST be idempotent on a namespaced idempotency key (org/program/system/type/event-id); a replayed source event MUST yield exactly one logical record and return the original receipt. | Replaying the same source-event-id N times produces one stored record and N identical original receipts. **Fail** if a replay creates a second logical record or a divergent receipt. | 7 | 0016, 0019 | T-24 | AT-24, IT-24 |
| **CR-BRG-03** | NEG | The bridge/gateway MUST validate container, record class, legal basis, purpose, policy reference and issuer signature; a misaddressed/wrong-purpose/wrong-class deposit MUST be denied deterministically with a non-leaking reason. | A deposit to the wrong container / purpose / class returns a deterministic deny whose reason discloses no protected content. **Fail** if such a deposit is accepted or the error leaks existence/identity. | 1, 11 | 0016 | T-23 | AT-23, IT-23 |
| **CR-BRG-04** | EVD | Institutional records MUST be signed via KMS; the record proof MUST carry key identity + history so a stolen or revoked key is rejected. | A record forged with a stolen/revoked key fails proof validation (revocation checked, key not in valid history). **Fail** if a revoked-key signature verifies as a valid institutional record. | 4, 7 | 0020, 0019, 0009 | T-20 | AT-20, EV-20 |
| **CR-BRG-05** | POS | The raw customer identifier MUST stop at the integration plane (C11); only the opaque pairwise relationship id may appear in deposited resources, URLs and logs. | Inspection of any deposited artefact, its URL and the request log shows only the opaque relationship id — never the raw customerID. **Fail** on any raw customerID downstream of C11. | 2, 5 | 0016, 0004 | T-03, T-35 | AT-03, IT-05 |
| **CR-BRG-06** | EVD | The bridge MUST retain the signed acceptance receipt independently and be able to verify it offline after issuance. | The bridge-held receipt verifies offline; it still verifies after the server-side record is later deleted. **Fail** if the retained receipt cannot be independently verified. | 8 | 0019 | T-28 | EV-06, AT-28 |

---

## 4. Provider / operator conformance class (`CR-PRV`)

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-PRV-01** | NEG | At-rest storage/ledger/backups MUST be encrypted with **independent per-tenant** keys; in a provider-blind profile an operator reading the backend MUST see ciphertext only; in the custodian profile the read MUST be audited and the readability disclosed. | An operator reading the storage backend obtains ciphertext (provider-blind) or triggers an audit event + a disclosed-readability record (custodian); no single at-rest key spans two tenants. **Fail** if plaintext is readable with no audit in a custodian profile, or if a shared platform key is found. | 10 | 0021, 0016 | T-30 | AT-30, EV-30 |
| **CR-PRV-02** | NEG | The provider MUST NOT be able to mint/use a platform-wide data-plane credential; the control plane MUST NOT act through a consumer token. | Attempting to obtain a platform-wide data-plane credential finds none; a control-plane action attempted via a consumer token is refused. **Fail** if any credential authorizes cross-tenant data-plane access. | 1, 10 | 0016, 0002 | T-31 | AT-31 |
| **CR-PRV-03** | EVD | Backup/restore and support tooling MUST be tenant-aware and audited; the external evidence ledger MUST be unaffected/tamper-evident when they run; restore MUST NOT resurrect data outside evidence. | A restore/support action is scoped to one tenant and audited; the ledger integrity check still passes and shows no out-of-band resurrection. **Fail** if tooling edits/resurrects data without a corresponding tamper-evident ledger state. | 7, 10 | 0019, 0021 | T-32 | AT-32, EV-32 |
| **CR-PRV-04** | POS | KMS key custody MUST be separated from provisioning and mapping (boundary B10); rotation MUST append the old key to history (never destroy it), keep prior receipts verifiable, and revoke a compromised key so new tokens/credentials under it fail. | Post-rotation: previously issued receipts still verify (old key in history); a token/credential minted under the revoked old key fails; the KMS component is deployed separately from provisioning/mapping. **Fail** if rotation orphans prior receipts or the old key still mints valid access. | 4, 10 | 0021, 0009, 0019 | T-33 | AT-33, EV-33 |
| **CR-PRV-05** | NEG | A tenant admin MUST NOT be able to reconstruct the cross-program identity graph; there is no global consumer key and admin scope is tenant-bound. | From tenant-admin views, an attempt to join two programs' subjects to one person finds no shared correlator and no admin view spanning tenants. **Fail** if any admin surface exposes a cross-program correlator. | 2, 10 | 0004 | T-34 | AT-34 |
| **CR-PRV-06** | NEG | Config-declared security modules (append-only store, SSRF guard, tenant resolver) MUST be digest-pinned with a startup integrity check + SBOM; swapping one for a permissive module MUST cause the server to refuse to start or flag. | Substituting a permissive module for a pinned security decorator fails the startup integrity/digest check (server refuses to start or raises a conformance flag); the SBOM records the pinned digests. **Fail** if a tampered preset boots and serves silently. | 10, 12 | 0024 | T-58 | AT-58 |
| **CR-PRV-07** | NEG | Cross-program aggregation MUST NOT be a protocol feature; no configuration may enable it absent an independent legal basis. | No config toggle enables cross-program aggregation; an attempt to switch it on finds no such feature (absence proof). **Fail** if any feature/flag aggregates across programs. | 2 | 0016 | T-37 | AT-37 |
| **CR-PRV-08** 🔒 | NEG | *(BLOCKED — pending ADR-0002 custodianship/legal determination + named security reviewer.)* A high-assurance **provider-blind** profile MUST render authored payloads unreadable to the provider even with infrastructure access. | Intended observable: in the provider-blind profile an operator with full infrastructure access recovers only ciphertext for authored payloads. **BLOCKED**: whether/how this profile is offered is unresolved (ADR-0021 §residual). TLS (CR-PRV-01 transit) and at-rest per-tenant keys are **not** blocked and are required now; only the provider-blind variant is deferred. | 10 | 0021 | T-30 | *(blocked; see companion §5)* |

---

## 5. Deployment conformance class (`CR-DEP`)

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-DEP-01** | EVD | The deployment MUST carry a **signed** compatibility manifest pinning CSS 7.1.9, the dated Track A Solid reports, the pinned Track B LWS drafts, and RFC 8693 / VC-JOSE-COSE ES256 / Bitstring Status List; no track-labelled claim may be made except by citing a manifest entry. | A build that asserts a Solid/LWS claim without a matching signed manifest entry **fails its conformance gate**; the manifest signature verifies against the named key. **Fail** if any conformance claim ships without a dated, signed pin. | 12 | 0001 | — | CT-01 |
| **CR-DEP-02** | NEG | Track B MUST ship as a separate config preset; a Track A/production config MUST NOT import LWS adapter components; assembly under a Track A label while importing them MUST fail. Enabling Track B MUST NOT change any Track A representation. | Assembling a Track A-labelled server that imports LWS components fails assembly/gate; a byte-diff of a Track A resource representation before vs after loading the Track B preset is identical. **Fail** if experimental code loads under a Track A label, or a Track A representation changes when Track B is enabled. | 12 | 0024 | T-42 | AT-42, CT-02 |
| **CR-DEP-03** | POS | Distinct origin/subdomain per program SHOULD be used; path-only tenancy MUST be flagged by config lint as discouraged and MUST still reject cross-tenant URL walking. | A path-only-tenancy config emits a lint warning; a crafted URL that walks into another tenant is rejected regardless of topology. **Fail** if path-only passes lint clean or a cross-tenant walk succeeds. | 1 | 0002 | T-04 | AT-04, CT-03 |
| **CR-DEP-04** | NEG | The deployment MUST define and advertise CORS/credentials/redirect/cookie/CSRF rules for cross-origin clients; ambiguous origin ⇒ deny; never wildcard-with-credentials; state-changing cross-origin requests without CSRF protection MUST be refused. | A CORS preflight from an unlisted origin is refused; no response combines `Access-Control-Allow-Origin: *` with credentials; a cross-origin CSRF attempt on a state-changing op is blocked. **Fail** on wildcard-with-credentials or an accepted cross-origin CSRF. | 3, 12 | 0025 | T-43 | AT-43, CT-08 |
| **CR-DEP-05** | EVD | The deployment MUST publish **two** separate conformance manifests (Track A, Track B), never merged; every conformance statement MUST name its track. | No published artefact makes a merged "Solid/LWS conformant" claim; each statement cites Track A or Track B. **Fail** on any un-tracked or merged conformance claim. | 12 | 0001, 0024 | T-42 | CT-05 |
| **CR-DEP-06** 🔒 | EVD | *(BLOCKED — pending the DBX-07 legal-policy prompt + human legal attestation.)* A deployment MUST NOT make a **legal-compliance release claim** (e.g. the CDR profile of ADR-0023) until (1) the legislation corpus is ingested + content-digest-pinned and (2) an authorized human has attested the legal→ODRL mapping. | Intended observable: a legal-compliance claim is accompanied by a verifiable corpus-digest pin + a signed human attestation id. **BLOCKED** by ADR-0015 §residual. All technical work on *synthetic* policies (CR-SRV-25) is explicitly **not** gated by this; only the legal-compliance *claim* is. | 11 | 0015, 0023 | — | *(blocked; see companion §5)* |

---

## 6. Consumer-agent conformance class (`CR-AGT`)

| Id | Cat | Normative statement | OBSERVABLE pass/fail | Invariant | ADR | Threat | Test |
|---|---|---|---|---|---|---|---|
| **CR-AGT-01** | POS | The agent MUST prove possession of the holder key with a channel-bound/nonced proof and MUST store the credential holder-bound, never presenting the credential document itself as a bearer access token. | A relayed/MITM'd holder-key proof (ceremony step 5) fails to bind an attacker key (step-7 issuance confirms the intended key); the agent never sends the credential document where a token is expected. **Fail** if a relayed proof binds, or the agent uses the credential as a bearer token. | 4 | 0008, 0007 | T-52 | AT-52 |
| **CR-AGT-02** | NEG | Retrieved records MUST be treated as inert data: no auto-dereference of embedded links, no auto-submit, no execution of active/rendering directives. | Given a deposited record crafted with active links, rendering directives and ODRL designed to exfiltrate, the agent's network trace shows **no** outbound fetch and no auto-submission; rendering is safe. **Fail** on any auto-fetch or auto-submit. | 5, 6 | 0017 | T-51 | AT-51, IT-51 |
| **CR-AGT-03** | POS | Submissions MUST be made only with explicit per-purpose user authorization; the agent MUST NOT over-scope a submission or a push-inbox grant. | Each submission the agent sends is traceable to an explicit per-purpose user authorization; a scope-expansion attempt is not performed by the agent. **Fail** if the agent submits without or beyond explicit authorization. | 6 | 0017 | T-53 | AT-53, IT-03 |
| **CR-AGT-04** | EVD | The agent MUST retain signed receipts and retrieved copies independently, verify them offline, and recover missed events via the client-held cursor reconciled against the server feed. | The agent verifies a retained receipt offline; after a missed notification it replays exactly the missing committed events by cursor pull and updates its cursor; a made submission cannot be repudiated (receipt binds sender+digest+time). **Fail** if receipts don't verify offline or recovery misses/duplicates events. | 7, 8 | 0019, 0011 | T-39, T-46 | EV-46, IT-14 |
| **CR-AGT-05** | POS | The agent MAY hold many per-program credentials, but no credential may disclose the person's other connections; nothing the agent presents to one program may correlate to another. | Inspection of a stored credential and of what the agent presents to a program reveals no other-connection data and no cross-program correlator. **Fail** if any credential or presentation leaks another connection. | 1, 5 | 0007 | T-10 | AT-10, IT-05 |

---

## 7. Solid compatibility matrix (`CR-SRV-C01…C10`)

Invariant 12: after the connection ceremony an **independent conforming Solid client** (accepted external
Solid-OIDC issuer + user-controlled WebID) MUST exercise its granted access with no Databox SDK, proprietary
transport or proprietary token ([ADR-0025](decisions/ADR-0025-solid-interoperability-guarantee.md)). Each row
is testable against the pinned baseline ([ADR-0001](decisions/ADR-0001-specification-baseline-pinning.md)) and
split Track A (Solid, production) / Track B (LWS, experimental preset) per
[ADR-0024](decisions/ADR-0024-track-separation-and-experimental-isolation.md). "CSS today" cites the
[DBX-01 extension map](dbx-01-extension-map.md) finding for what CSS 7.1.9 already provides vs what is net-new.

| Id | Surface | Track A requirement (observable) | Track B requirement (observable) | CSS today (DBX-01) | Inv | ADR | Test |
|---|---|---|---|---|---|---|---|
| **CR-SRV-C01** | Discovery | A generic client GETs the root and finds a standard `Link rel="…solid#storageDescription"`; the served description + Linked-Data connection document let it locate capabilities with **no hidden SDK registry**. | Additionally advertises the LWS storage description + AS-discovery `WWW-Authenticate` challenge as **additive** RDF a generic client can ignore. | Provides: `StorageDescriptionAdvertiser`/`Handler` (§4). Net-new: LWS description + AS challenge (C2/C9, §9). | 12 | 0025, 0024 | CT-C01 |
| **CR-SRV-C02** | Authentication | An independent Solid-OIDC client authenticates using an accepted external issuer + user WebID and reaches permitted resources — no broker token required. | LWS auth suites (OIDC + self-signed Controlled Identifier) authenticate over the experimental preset without breaking the Track A path. | Provides: Solid-OIDC/DPoP via `@solid/access-token-verifier` (§2). Net-new: LWS suites, RFC 8693 (§9). | 12 | 0025, 0005, 0006 | AT-16, CT-C02 |
| **CR-SRV-C03** | WebID / client identification | Standard Solid-OIDC client identification/registration is honored; a user-controlled **pairwise** WebID is accepted; trust restriction is documented independently of any wallet vendor. | RFC 8693 exchange binds client identity into the audience-scoped token without a proprietary client registry. | Provides: Client-ID-Document verification on IdP side (§2). Net-new: resource-server issuer trust list (§2). | 12 | 0025, 0004, 0005 | CT-C03 |
| **CR-SRV-C04** | HTTP / LDP methods | GET/POST/PUT/PATCH/DELETE/HEAD behave per the published **capability matrix** per resource class; append-only is enforced by **method denial, not method redefinition**. | LWS operation semantics map onto the same LDP methods via an additive adapter; unsupported LWS op with preset unloaded → standard unsupported response. | Provides: all six method handlers (§1, §4). Net-new: LWS op mapping (§9, additive). | 7, 12 | 0025, 0018 | CT-C04, AT-26 |
| **CR-SRV-C05** | RDF content negotiation | `Accept: text/turtle` and `application/ld+json` return the correct representation or a standard 406/415; the Track A representation is unchanged whether or not Track B is loaded. | `application/lws+json` is served **only** on explicit LWS content negotiation; never substituted for a Track A request. | Provides: `ChainedConverter` Turtle/JSON-LD (§4). Net-new: `application/lws+json` converter (§4, §9). | 12 | 0025, 0024 | CT-C05, AT-42 |
| **CR-SRV-C06** | Conditional requests | `If-Match`/`If-None-Match`/ETag behave per HTTP; a stale precondition returns 412; the same mechanism backs receipt/idempotency digests. | Same conditional semantics; no Track B divergence. | Provides: `BasicConditionsParser` → `validateConditions` (§4). Net-new: none. | 7, 12 | 0025, 0019 | CT-C06 |
| **CR-SRV-C07** | WAC (per HD-03) | WAC is the advertised authorization surface; a Databox `PermissionReader` may only **narrow** the WAC result — a broad WAC grant is still denied by tenant/assurance/ODRL, and no layer broadens a denial. | WAC + LWS ODRL Access Grant, narrowed by the **same** composed authorizer (C4); Track B adds no broadening path. | Provides: `WebAclReader`, union `PermissionReader` (§3). Net-new: composed narrowing authorizer (§3). | 3, 12 | 0025, 0003 | CT-C07, IT-06 |
| **CR-SRV-C08** | CORS | Cross-origin browser clients get defined CORS/credentials/redirect/cookie rules; ambiguous origin ⇒ deny; never wildcard-with-credentials (see CR-DEP-04). | Same rules apply to the experimental preset's endpoints. | Provides: baseline CORS handler; program-bound rules net-new (§2 topology). | 3, 12 | 0025 | AT-43, CT-C08 |
| **CR-SRV-C09** | Notifications | An advertised standard Solid Notifications channel is subscribable exactly as the pinned spec defines; it is a **hint only** — never presented as the recovery API. | Same Solid Notifications channel on both tracks; durable recovery remains the separate cursor feed. | Provides: WebSocket/Webhook/StreamingHTTP channels, `notify:subscription` (§6). Net-new: durability is **not** reused (§6). | 5, 12 | 0025, 0011, 0024 | CT-C09, IT-14 |
| **CR-SRV-C10** | Error / challenge behavior | Denials use standard status codes/challenges/headers with the **404-not-403** existence rule; `WWW-Authenticate` on 401; machine-safe reason/step-up data rides in a profiled representation that does not break a generic client. | Same standard error surface; an unsupported Track B feature with preset unloaded returns a standard unsupported/does-not-exist response, never a spoofed Track B body. | Provides: `reportAccessError` 404-not-403 (§3); `HttpError` codes/challenges (§3). Net-new: profiled reason/step-up representation. | 3, 12 | 0025, 0024 | AT-07, CT-C10 |

---

## 8. Invariant → requirement coverage table (acceptance gate)

Every one of the twelve invariants has ≥1 requirement with an observable pass/fail (mirrors DBX-03 §7).

| Invariant | Requirements |
|---|---|
| 1 — one program, one relationship | CR-SRV-01, CR-SRV-02, CR-SRV-21, CR-BRG-01, CR-BRG-03, CR-PRV-02, CR-DEP-03, CR-AGT-05 |
| 2 — no identifying data in URLs/logs/paths | CR-SRV-04, CR-SRV-05, CR-BRG-05, CR-PRV-05, CR-PRV-07 |
| 3 — knowing a URL never grants access | CR-SRV-02, CR-SRV-03, CR-DEP-04, CR-SRV-C07, CR-SRV-C10 |
| 4 — credential holder-bound; tokens short/audience-bound | CR-SRV-18, CR-SRV-19, CR-BRG-04, CR-PRV-04, CR-AGT-01 |
| 5 — no wallet/other-box browsing | CR-SRV-12, CR-SRV-17, CR-BRG-05, CR-AGT-02, CR-AGT-05, CR-SRV-C09 |
| 6 — submissions are explicit disclosures | CR-SRV-17, CR-AGT-02, CR-AGT-03 |
| 7 — no silent overwrite; linked auditable events | CR-SRV-08, CR-SRV-09, CR-SRV-11, CR-SRV-13, CR-SRV-14, CR-SRV-55, CR-BRG-02, CR-PRV-03, CR-AGT-04, CR-SRV-C04 |
| 8 — independently retainable signed receipt | CR-SRV-09, CR-SRV-10, CR-BRG-06, CR-AGT-04 |
| 9 — sensitivity vs current assurance, not ownership | CR-SRV-06, CR-SRV-07, CR-SRV-19 |
| 10 — provider administration is a threat | CR-SRV-21, CR-PRV-01, CR-PRV-02, CR-PRV-03, CR-PRV-04, CR-PRV-05, CR-PRV-06, CR-PRV-08 🔒 |
| 11 — rights/duties travel as versioned ODRL, auditable | CR-SRV-13, CR-SRV-16, CR-SRV-25, CR-BRG-03, CR-DEP-06 🔒 |
| 12 — preserve standard Solid surface for independent clients | CR-SRV-C01…C10, CR-DEP-01, CR-DEP-02, CR-DEP-05, CR-PRV-06 |

Every invariant is covered by at least one **non-blocked** requirement; the two 🔒 blocked requirements are
*additional* hardening on invariants 10 and 11, which are already covered independently.

---

## 9. Self-check (acceptance gate)

**Gate: every normative requirement has an observable pass/fail condition, and no requirement merely says a
config file or class exists.**

- **Observable, not structural.** Each row's "OBSERVABLE pass/fail" column names a measurement (a paired
  response diff, a byte-diff, an entropy estimate, a network trace, an offline verification, an enumeration
  budget, a startup integrity failure), plus an explicit **Fail** condition. No requirement is satisfied by
  the presence of a class or a config key. Illustrative rewrites of the anti-pattern:
  - *Not* "an append-only decorator class exists" → **CR-SRV-08**: "PUT/PATCH/DELETE as consumer, program,
    owner **and** admin each return a deny; POST create returns 201."
  - *Not* "a compatibility manifest exists" → **CR-DEP-01**: "a build asserting a claim without a matching
    signed manifest entry **fails its conformance gate**."
  - *Not* "a tenant resolver is wired in" → **CR-SRV-01**: "a fuzzer mutating the mapping between resolution
    and store execution cannot land the op in another tenant."
- **Three categories present.** POSITIVE (e.g. CR-SRV-06, CR-BRG-02, CR-AGT-03), NEGATIVE tied to AT-ids
  (e.g. CR-SRV-02→AT-01, CR-SRV-08→AT-26, CR-PRV-06→AT-58), and EVIDENCE / independently verifiable (e.g.
  CR-SRV-09 ledger integrity, CR-SRV-10 offline receipt, CR-BRG-06, CR-AGT-04) all appear in every class
  where applicable.
- **12/12 invariants covered** by a non-blocked requirement (§8).
- **Blocked items are marked, not resolved.** CR-SRV-22 (RFC 8693 wire binding → DBX-12), CR-PRV-08
  (provider-blind encryption → ADR-0002 + legal + named security reviewer) and CR-DEP-06 (legal-compliance
  release claim → DBX-07 legal-policy + attestation) carry 🔒 and record their unblocking input per
  [decisions/README §6](decisions/README.md); their non-blocked siblings (CR-SRV-15 synthetic policy,
  CR-PRV-01 at-rest/TLS) remain required now.
- **No invariant weakened.** Requirements only narrow, never broaden (CR-SRV-C07); append-only binds every
  actor class (CR-SRV-08); provider is modelled as adversary (CR-PRV-*); WAC/ACP↔ODRL separation preserved
  (CR-SRV-C07 narrows, CR-SRV-25 governs policy).
