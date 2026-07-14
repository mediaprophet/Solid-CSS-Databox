<!--
ADR — Databox decision register (DBX-02). Cluster: exchange & evidence.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0022 — Binary evidence handling and malware quarantine

- **Status:** Adopted-with-scope (quarantine state machine and evidence events specified now; production scanner deferred)
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the scan/release gate and size/media-type bounds are security-sensitive; the production scanner integration and its allow/deny policy need a named security reviewer before a program serves untrusted binary deposits.
- **Sources adjudicated:** DBX-15 prompt (bounded binary handling + quarantine contract); exchange-and-evidence.md (large/resumable evidence; transcripts of source recordings; immutability/derivative-record rules). **This is a GAP — production malware scanning is explicitly deferred in hackathon-profile.md, stated below.**
- **Consumed by / blocks prompts:** DBX-15, DBX-16.
- **Relates to:** ADR-0018 (append-only + derivative/source records), ADR-0019 (quarantine transitions are evidence events; receipt not issued as "accepted-and-served" until release), ADR-0011 (large/resumable upload profile).

## Context

**This is a gap:** hackathon-profile.md explicitly defers "production malware scanning, retention and lawful-deletion operations". But DBX-15 requires a *contract* for bounded binary handling and quarantine so that unscanned bytes are never served as accepted, and exchange-and-evidence.md requires that derivative records (a transcript or summary of a source recording) record their method, agent and verification-status while the source remains authoritative where retention policy requires. Without a specified state machine now, DBX-15 would either build an ad-hoc one or serve unscanned bytes — both unacceptable. So this ADR specifies the **quarantine state machine and its evidence events now**, and scopes the **production scanner as deferred**.

CSS 7.1.9 has no scanning, no quarantine and no size/media-type gate on binary bodies beyond ordinary request handling (nothing in DBX-01 indicates one); the store chain (DBX-01 §4) is where a quarantine decorator would sit, above the append-only decorator (ADR-0018).

## Decision

1. **Bound size and media type (Adopted).** Binary deposits MUST be bounded: each program profile declares a maximum size and an allowed media-type set per record class. A deposit exceeding the size bound or presenting a disallowed/mismatched media type (declared type ≠ sniffed type) is rejected at intake. Large or resumable evidence uses the profiled HTTPS upload protocol (implementation-decisions.md Transport table; ADR-0011 relation).

2. **Quarantine contract / state machine (Adopted).** Every binary deposit flows through an explicit, evidence-emitting state machine:
   - **accepted-into-quarantine** — bytes are durably committed to a **quarantine namespace** that is NOT servable as an accepted resource. An acceptance-into-quarantine receipt MAY be issued (ADR-0019) but its state is `quarantined`, distinct from `accepted`-and-servable.
   - **scanning** — the bytes are submitted to the scan step (a scanner in production; a stubbed/mock verdict in the hackathon, see §5).
   - **released** — on a clean verdict, the resource transitions to the accepted, servable append-only store (ADR-0018) and its evidence event records the scan verdict, scanner identity/version and time; the servable acceptance receipt is now issuable/updated.
   - **rejected** — on a malicious/failed verdict, the bytes are NOT served, are retained or tombstoned per policy (ADR-0018), and a rejection evidence event records the verdict.
   
   **Invariant: unscanned or unreleased bytes MUST NEVER be served as an accepted resource.** Retrieval of a resource still in `quarantined`/`scanning` state MUST NOT return the bytes; it returns a state indication (or the existence-hiding denial where the requester lacks read — DBX-01 §3).

3. **Every transition is an evidence event (Adopted).** accepted-into-quarantine, scanning, released and rejected are each recorded in the evidence ledger (ADR-0019) with digest, time, actor and verdict. The quarantine state is part of the resource's receipt-state model (ADR-0019 states), so a consumer/auditor can see why bytes are or are not available.

4. **Derivative records (Adopted).** Where a source binary (e.g. a recording) is represented by a transcript or summary, the derivative record MUST record its **method, agent and verification-status** (exchange-and-evidence.md; consistent with ADR-0020 §4 valid-vs-true and review-item #13 attestation). The **source remains authoritative where retention policy requires its retention**; the derivative is a linked, non-authoritative record, superseding nothing (ADR-0018 supersession rules apply to corrections, not to derivative substitution). A derivative MUST NOT be presented as the source.

5. **Production scanning deferred; contract present now (Adopted-with-scope).** Production malware scanning is **deferred** (hackathon-profile.md). The hackathon implements the **state machine and evidence events** with a deterministic stub verdict (e.g. a fixture that marks synthetic-clean, and one synthetic-malicious fixture to exercise the reject path); it MUST label the scanner as stubbed in the demo README and MUST NOT claim production scanning. The state machine is built so that dropping a real scanner into the `scanning` step later requires no change to the accept/release/serve contract.

## Alternatives considered

- **Scan synchronously inline and only then accept (no quarantine namespace).** Rejected: large/resumable evidence and slow scans would block the deposit path and couple acceptance latency to scanner throughput; the quarantine namespace lets bytes be durably captured (with a `quarantined` receipt) and released asynchronously on a clean verdict.
- **Accept and serve immediately, scan in the background.** Rejected outright: it serves unscanned bytes as accepted — precisely the outcome DBX-15 forbids. Fail-closed requires unreleased bytes never be served.
- **Defer the whole quarantine design because scanning is deferred.** Rejected: hackathon-profile.md defers the *scanner*, not the *contract*; without the state machine now, DBX-15 has nothing safe to build against and would serve unscanned bytes or invent an ad-hoc gate.
- **Let a derivative transcript supersede/replace the source recording.** Rejected (exchange-and-evidence.md): the source stays authoritative where retention requires; the derivative is linked and records method/agent/verification-status, never a silent replacement.
- **No media-type/size bound (accept any binary).** Rejected: unbounded untrusted binary is a denial-of-service and malware surface; profile-declared bounds are mandatory.

## Consequences

- **Positive:** DBX-15 gets a concrete, testable contract (accept→quarantine→scan→release/reject) and a clean seam to insert a real scanner later without touching the serve path. Unscanned bytes are structurally unservable. Derivative-record provenance is explicit, reinforcing ADR-0020's valid-vs-true stance.
- **Negative / cost:** A quarantine namespace, a state machine, and its evidence events are net-new build (store-chain decorator above ADR-0018). The stubbed scanner must be unmistakably labelled so the deferral is not misread as implemented (hackathon-profile.md rule that deferred items cannot be represented as implemented).
- **Privacy & threat notes:** Closes "serve malware as an accepted record" and reduces DoS via bounds. Quarantine-state responses MUST preserve existence-hiding (DBX-01 §3) so probing a quarantined resource cannot confirm another box/connection exists. Binary media and its derived transcripts may contain sensitive content — quarantine namespace, scan logs and derivative records are subject to the same isolation, minimisation and no-leak rules as any payload (isolation-and-privacy.md); scanner integrations must not exfiltrate payloads cross-tenant.

## Failure behavior

Fail closed:
- No scan verdict, an error verdict, or an unavailable scanner leaves the resource in `quarantined`/`scanning` — it is **never** released or served on scanner failure (unknown fails closed, exactly as ADR-0020 status-unknown does).
- A deposit exceeding size or with mismatched/disallowed media type is rejected at intake with an evidence event; it does not enter quarantine as servable.
- Retrieval of a non-released resource returns state/denial, never the bytes.
- If the quarantine→released transition cannot durably commit alongside its evidence event (ADR-0019 atomicity), the resource stays quarantined and is not served.
- A derivative lacking method/agent/verification-status is rejected (no unattributed derivative masquerading as evidence).

## Open sub-questions / residual gates

- The **production scanner selection and its allow/deny/verdict policy** are deferred (hackathon-profile.md) and owned by DBX-15/DBX-16 under the named security reviewer; the *state machine and evidence contract* are fully specified here.
- Concrete **size limits and allowed media-type sets per record class** are a Profile choice each program declares (owner: DBX-15 fixtures / program profile).
- The **retention/tombstone treatment of rejected (malicious) bytes** follows ADR-0018 and the legal-policy retention workstream (R-12); this ADR fixes that rejected bytes are never served, not their retention duration.
