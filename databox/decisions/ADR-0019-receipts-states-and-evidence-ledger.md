<!--
ADR — Databox decision register (DBX-02). Cluster: exchange & evidence.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0019 — Acceptance receipts, receipt states and the evidence ledger

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** cryptography — receipt signing, digest binding and signing-key-history retention are cryptographic choices; the concrete proof suite is pinned in ADR-0020 and needs the cryptographer named there. Also security for the WORM/hash-chain ledger placement.
- **Sources adjudicated:** R-11 (receipts/evidence half); review-item #18 (receipt must bind more than a version string); exchange-and-evidence.md Signed receipt, Audit and Atomicity sections; DBX-01 §4 (conditional-requests/idempotency reuse).
- **Consumed by / blocks prompts:** DBX-18, DBX-19, HAK-07 (receipt shape and states), and the audit projection consumed by DBX-14/DBX-23.
- **Relates to:** ADR-0018 (append-only records the ledger records), ADR-0020 (proof suite and status format the receipt uses), ADR-0011 (receipt/notification/duty states feed the cursor feed), ADR-0014 (compiled-policy digest binding).

## Context

Invariant 8 requires every accepted submission to produce a signed receipt the person can retain independently, and exchange-and-evidence.md requires that later provider deletion or alteration must not invalidate an already-issued receipt. Review-item #18 rejects "a policy-version *string* proves which corpus governed" — the receipt must bind the compiled-policy digest, corpus-manifest digest, attestation identifier and evaluator version, not a mutable label. The Atomicity section requires that the system never return an acceptance receipt before durable acceptance, and that duplicate delivery of an idempotency key returns the original outcome. The Audit section requires an append-only external store (signed hash chain, WORM, or equivalent), not ordinary application logs, recording both successful and denied access.

DBX-01 §4 notes reusable substrate: `BasicConditions`/`ETagHandler`/`DataAccessorBasedStore.validateConditions` for idempotency and receipt-digest checks. But there is no evidence-ledger, no receipt-state model and no external append-only store in CSS today; these are net-new. Production WORM/audit storage is explicitly deferred for the hackathon (hackathon-profile.md), so this ADR specifies the *contract* now and marks the production ledger substrate as the deferred part.

## Decision

### Receipt content and binding

Every accepted deposit or submission MUST produce a **signed acceptance receipt** bound to the canonical, immutable facts of the transaction:

- transaction identifier and assigned resource URI;
- **canonical payload digest** of the accepted bytes (the exact accepted payload — ADR-0020 fixes canonicalization);
- sender identity and addressed program-relationship (pairwise);
- server acceptance time;
- operation type;
- **compiled-policy digest and profile version+digest** — not a bare version string (review #18); where a legal corpus governs, also the corpus-manifest digest, interpretation/attestation identifier and evaluator version (review #18, R-12 interface; supplied by ADR-0014);
- ODRL policy identifier and the duties **activated** by acceptance (ADR-0012);
- **idempotency key** (HD-12 tuple or its tenant-keyed HMAC);
- signature and verification method (proof suite pinned by ADR-0020).

### Receipt states

A receipt is not a single fact; it tracks distinct, monotonic states, each a recorded evidence event:

- **accepted** — durably committed at the server (this is what the signed acceptance receipt attests);
- **notified** — an eligible notification signal was accepted by a channel (a hint state — see ADR-0011, does not prove receipt);
- **retrieved** — the consumer authenticated and fetched the resource;
- **acknowledged** — the consumer/vault returned an authenticated acknowledgement;
- **reviewed** — for submissions, a governed disposition was recorded;
- **disposed** — a terminal outcome (superseded, tombstoned per ADR-0018, or closed).

These map onto the duty states in ADR-0012; "accepted" MUST NOT be conflated with "notified/retrieved/acknowledged".

### Never accept before durable commit

The server MUST NOT return (or make retrievable) an acceptance receipt before the resource **and** its ordered evidence event are durably committed (exchange-and-evidence.md Atomicity; ADR-0011 §1). Use a transactional resource/evidence/outbox boundary, or an append-only event log as source of truth projected into Solid storage.

### Idempotency

An idempotency-key replay MUST return the **original logical outcome** (the original receipt and assigned resource), never create a second logical record. The CSS conditional-request substrate (DBX-01 §4) is reused for the digest/precondition mechanics; the idempotency ledger keying is net-new.

### Evidence ledger

The evidence ledger is **append-only and EXTERNAL to ordinary Pod mutation** — a signed hash chain, WORM store or equivalently controlled mechanism (exchange-and-evidence.md Audit; invariant 10). Ordinary application logs MUST NOT be treated as evidence. The ledger:

- records **both successful and denied** access, with the Audit-section fields (agent/client/issuer, assurance and record grade, operation/target/decision, pre- and post-operation digest, institutional actor/principal, receipt/notification/disposition outcomes, policy version and reason code, ODRL state);
- records denials **without leaking the protected content** or confirming another consumer's box exists (isolation-and-privacy.md; DBX-01 §3 404-not-403 rule);
- **retains signing-key history** and verification material so a receipt signed by a since-rotated key still verifies;
- exposes a **minimised consumer-visible audit projection** through the Databox while protecting staff identifiers and operational security.

### Receipt validity is independent of the provider

A validly issued receipt MUST remain verifiable after the underlying resource is later deleted, tombstoned or altered by the provider (invariant 8; exchange-and-evidence.md). The receipt binds a digest and is signed with a retained key; its validity depends on the retained signing-key history and the offline verification bundle (ADR-0020), not on the live resource or a mutable URL.

## Alternatives considered

- **Receipt binds only a policy-version string.** Rejected (review #18): a mutable label cannot prove which compiled policy/corpus governed; the receipt binds digests and attestation identifiers instead.
- **Store evidence in ordinary CSS resources / application logs.** Rejected (exchange-and-evidence.md Audit; invariant 10): a provider administrator or ordinary Pod mutation could rewrite it, and application logs are not tamper-evident. The ledger is external and append-only precisely so admin/owner cannot silently alter it — the same threat ADR-0018 closes for records.
- **Issue the receipt synchronously before the outbox/evidence commit for lower latency.** Rejected (Atomicity): a receipt issued before durable commit can attest an event that never durably happened. Acceptance follows durable commit, always.
- **Per-attempt idempotency keys.** Rejected (HD-12): a retry must reuse the same stable namespaced key so replays return the original outcome rather than duplicating logical records.
- **Let a receipt die with the resource it describes.** Rejected (invariant 8): the person's retained receipt must survive provider-side deletion; hence digest-binding + retained key history + offline bundle.

## Consequences

- **Positive:** The person holds portable, independently verifiable proof of acceptance that outlives the provider (invariant 8). Digest/attestation binding makes receipts legally meaningful (review #18). Denials-recorded-without-leak gives DBX-14/DBX-23 a safe audit projection. Idempotency gives HAK-07 its "duplicate key returns original outcome" gate.
- **Negative / cost:** An external WORM/hash-chain ledger and signing-key-history retention are net-new infrastructure (deferred for the hackathon per hackathon-profile.md, which uses append-only event records + signed receipts sufficient for the demo). Transactional resource/evidence/outbox coupling adds commit complexity and latency (acceptance waits for durable commit).
- **Privacy & threat notes:** Closes tamper and repudiation threats for both parties and closes "logs/audit reveal another box exists" (isolation-and-privacy.md) via the minimised projection and 404-not-403 rule. The ledger MUST use program-local identifiers only (isolation-and-privacy.md Analytics) — it must not become a cross-program correlation key. Signing-key-history retention is itself sensitive material requiring the same protection as active keys.

## Failure behavior

Fail closed:
- If durable commit of the resource + evidence event fails, **no receipt is issued** and the operation is reported as failed; the client retries under the same idempotency key (ADR-0011 §Failure).
- If a receipt cannot be signed (key unavailable/invalid), acceptance MUST NOT be reported as completed — a signable, retained-key receipt is part of "accepted".
- An idempotency-key collision whose stored outcome cannot be read is treated as retryable failure, never as a fresh accept that duplicates the logical record.
- Denied requests are recorded in the ledger with reason codes but MUST NOT include protected content or confirm another box's existence.
- If the evidence ledger write fails, the acceptance path fails closed (the ledger is part of durable acceptance, not a side effect).

## Open sub-questions / residual gates

- The **production ledger substrate** (specific WORM store / hash-chain implementation and its operational controls) is deferred for the hackathon (hackathon-profile.md) and owned by DBX-19; the *contract* (append-only, external, key-history, denial-without-leak, receipt-survives-deletion) is fully specified here.
- The concrete **receipt proof suite, canonicalization and credential-status format** are pinned in ADR-0020 (do not re-decide here).
- The **compiled-policy/corpus-manifest/attestation digest inputs** the receipt binds are supplied by the policy pipeline; their production values await the legal-policy workstream (R-12) but the *binding requirement* is fixed here and owned for production by DBX-18/ADR-0014.
- The exact **audit projection minimisation rules** (which staff fields are suppressed) are a privacy/legal profile choice owned by DBX-23.
