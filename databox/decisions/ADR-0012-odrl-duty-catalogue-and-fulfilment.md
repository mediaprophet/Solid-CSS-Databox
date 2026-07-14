# ADR-0012 — ODRL duty catalogue and fulfilment states

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** none — this is a deterministic operational-duty catalogue; the legal *meaning* attached to a duty is bound later by an attested compiled policy (ADR-0015), not here.
- **Sources adjudicated:** R-08; review-item #10; rights-and-obligations.md (Duties and evidence); exchange-and-evidence.md (Signed receipt, Notifications, Atomicity).
- **Consumed by / blocks prompts:** DBX-07 (technical ODRL profile), DBX-20 (deterministic evaluator + obligation engine), DBX-21 (durable notification/recovery), HAK-05 (Access-Grant/obligation demo).
- **Relates to:** ADR-0011 (immutability, receipts and evidence), ADR-0013 (conflict/precedence), ADR-0019 (verification binding), ADR-0023 (correction duties reuse this machine).

## Context

The concept documents originally spoke of a single duty, `notifyHolder`, whose completion condition was undefined. Review-item #10 (implementation-decisions.md) records that "queued, attempted, sent, HTTP-accepted, durably retrievable and consumer-acknowledged are distinct states" and that a single "notified" verb hides that distinction. rights-and-obligations.md already warns that "a queued task is not proof of fulfillment." R-08 replaces the ambiguous verb with a typed duty set, each carrying its own fulfilment condition.

Why this matters to an invariant: invariant 11 requires that "rights, prohibitions and obligations travel with records as versioned ODRL policies and produce auditable duties," and invariant 8 requires a signed receipt per accepted submission. A duty whose fulfilment condition is undefined cannot produce auditable evidence, and it silently degrades an obligation ("the consumer was notified") into a weaker fact ("we queued a message"). That is a false-assurance failure of the kind the register is designed to reject.

CSS 7.1.9 reality (DBX-01 §6): notification delivery is best-effort and in-memory — `WebhookEmitter` does a single fetch with no retry, no durable queue, no cursor. There is no obligation engine in CSS at all. The duty state machine and its evidence ledger are therefore net-new (DBX-20/DBX-21), and this ADR fixes their vocabulary so the evaluator, the obligation workers and the evidence schema agree.

## Decision

The Databox ODRL profile MUST define the following typed duties, replacing the single `dbx:notifyHolder`. `notifyHolder` MUST NOT be used in any new policy template; it is retired to a deprecated alias that the compiler rejects with a diagnostic.

| Duty IRI (`dbx:` = `https://w3id.org/solid-databox/ns#`) | Fulfilment condition (the ONLY state that counts as `accepted`) |
|---|---|
| `dbx:makeAvailable` | the target resource **and** its ordered event are durably committed and retrievable via authenticated GET. |
| `dbx:signalHolder` | an eligible notification signal has been **accepted by the selected channel** (channel returned success). Delivery/read is NOT implied. |
| `dbx:deliverToInbox` | a **success response from the registered durable inbox** has been received. A local POST attempt is not sufficient. |
| `dbx:acknowledge` | an **authenticated consumer/vault acknowledgement** referencing the event has been durably recorded. |
| `dbx:issueReceipt` | a **valid signed receipt is durably committed** and returned synchronously or retrievable. |
| `dbx:stageForReview` | the submission is **durably present in the governed review queue** (not merely POSTed to the container). |

Each duty instance MUST progress through an explicit state machine whose states are pairwise distinct and every transition of which is appended to the evidence ledger:

```text
queued ──▶ attempted ──▶ accepted
   │           │
   │           └─▶ failed ──▶ remedied        (a consequence/remedy path was applied)
   │
   └─▶ (superseded/cancelled by an authorized policy event)

acknowledged is a SEPARATE terminal state reachable only for duties whose
fulfilment condition is consumer acknowledgement (dbx:acknowledge), and only
from accepted-delivery, never inferred from signalHolder or makeAvailable.
```

Normative rules:

1. **`queued` != `fulfilled`.** No duty is fulfilled in state `queued` or `attempted`. Only `accepted` (and, for acknowledgement duties, `acknowledged`) count as fulfilled. A receipt or audit event MUST NOT report a duty as fulfilled unless the duty instance is in a fulfilling state at the recorded evidence time.
2. **Every transition is evidence.** Each transition records: policy+rule id, target asset, assigner/assignee/responsible processor, activation event and time, constraints evaluated, due time (if any), the fulfilment event and its digest, failure reason and retry history, applicable consequence/remedy, and signature + audit-chain reference (rights-and-obligations.md Evidence list). The ledger is append-only (ADR-0011); a state change never rewrites a prior evidence entry.
3. **Retries are idempotent.** A retry of a duty MUST reuse the duty instance's stable idempotency key and MUST NOT create a second logical duty or a second logical side effect. Re-running `dbx:signalHolder` after a transient channel error re-attempts the *same* signal; a duplicate acceptance returns the original outcome (consistent with exchange-and-evidence.md Atomicity: "duplicate delivery of the same idempotency key must return the original outcome"). The idempotency key is per-duty-instance, not per-attempt.
4. **Fulfilment condition is selected by the policy, not by the worker.** Each policy template selects exactly the duty it requires. A worker MUST NOT "upgrade" `dbx:signalHolder` to imply delivery, nor "downgrade" `dbx:deliverToInbox` to accept a mere local queue.
5. **Failure is first-class.** A duty that cannot reach its fulfilment condition within its due time transitions to `failed` and activates its declared consequence/remedy; `failed` is audit-visible and retryable. Notification failure MUST NOT roll back an already-accepted deposit (exchange-and-evidence.md), but MUST remain visible.

**Hackathon scope (per hackathon-profile / HD set):** implement exactly two duties end-to-end — `dbx:issueReceipt` and `dbx:signalHolder` — with their full state machine and evidence transitions. The remaining four duties MUST exist in the profile vocabulary with defined fulfilment conditions and MUST be parseable, but their workers MAY be stubbed to `queued` in the hackathon build. No hackathon policy template may *depend* on a stubbed duty for a fulfilment claim.

## Alternatives considered

- **Keep a single `notifyHolder` with a per-policy "level" operand** — rejected. A single verb with a graded operand still tempts callers to treat "notified" as one fact and hides which grade actually fired in the evidence. Review-item #10 explicitly requires the states be *distinct*, and R-08 requires distinct duties. A graded operand also complicates conflict evaluation (ADR-0013) because two policies could disagree on the grade of the "same" duty.
- **Model states as free-text status strings** — rejected. Free text defeats deterministic evaluation, breaks the conformance tests every custom ODRL term requires (rights-and-obligations.md: "Every custom term needs … a conformance test"), and makes cross-program audit comparison unreliable.
- **Collapse `dbx:makeAvailable` into `dbx:issueReceipt`** — rejected. Availability of the record and issuance of a receipt are genuinely separate facts with separate failure modes: a receipt can be committed while a projection to the retrievable resource lags, and vice versa. Collapsing them would let a receipt assert availability that did not durably exist.
- **Implement all six duties end-to-end for the hackathon** — deferred, not rejected. `dbx:deliverToInbox` and `dbx:acknowledge` depend on the durable inbox/cursor contract that DBX-21 builds from scratch (DBX-01 §6 confirms nothing in CSS can be reused). Forcing all six into the hackathon would couple the demo to the largest net-new subsystem. Two duties prove the state machine and evidence chain without that dependency.

## Consequences

- **Positive:** the evaluator, obligation engine and evidence schema share one vocabulary; "fulfilled" becomes a checkable claim bound to a specific state and digest; retries cannot double-count or double-act; a consumer or auditor can see exactly which delivery guarantee a program actually offered per record class.
- **Negative / cost:** six duties with distinct workers and a full state machine is more implementation than one verb, and the obligation engine plus durable ledger are net-new (DBX-20/DBX-21). Policy authors must now choose the correct duty, which requires the profile documentation to explain the guarantee each conveys.
- **Privacy & threat notes:** closes a *false-assurance* attack where a program claims a person was informed when only a best-effort push was queued (directly relevant to the correction/awareness rights in ADR-0023). `dbx:signalHolder` signals MUST carry only an opaque event id, never record content (exchange-and-evidence.md Notifications), so promoting notification to a typed duty does not widen what a notification discloses. The durable-inbox and outbound-delivery paths inherit the SSRF/endpoint-validation requirements owned by DBX-21 (DBX-01 §6 notes CSS has no SSRF protection today).

## Failure behavior

Fail closed. If a policy references an unknown duty IRI, an unsupported operand, or a duty whose fulfilment condition the deployment cannot evaluate, the compiled policy is rejected at ingestion (ADR-0015) and, if encountered at runtime, the evaluation fails closed and is audit-visible (ADR-0013). A duty whose evidence is missing or whose signature does not verify MUST be treated as **not fulfilled**, never as fulfilled-by-default. On worker crash between `attempted` and `accepted`, recovery re-reads the idempotency key and either observes the completed side effect (transition to `accepted`) or re-attempts; it MUST NOT assume success. A receipt MUST NOT be returned before durable acceptance of the operation it attests (exchange-and-evidence.md).

## Open sub-questions / residual gates

- Per-duty default retry budgets, backoff and due-time defaults are a **profile choice** owned by DBX-07/DBX-20; this ADR fixes only the states and the idempotency rule.
- The concrete durable-inbox success contract for `dbx:deliverToInbox` and the acknowledgement transport for `dbx:acknowledge` are owned by **DBX-21** (durable notification/recovery); until DBX-21 lands, those two duties remain vocabulary-only and MUST NOT back a fulfilment claim.
- Binding a fulfilled duty to the governing legal provision is **not** in scope here; that binding is added by the attested compiled-policy bundle (ADR-0015) and recorded per ADR-0019.
- No item here is Blocked: the operational duty catalogue is fully specified for its scope.
