# ADR-0017 — Data exchange and social-sharing boundary

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** privacy — the two-copy WAC model and the "no vault crawl" rule are the personal-storage-isolation boundary; privacy sign-off required.
- **Sources adjudicated:** R-10 (data exchange and social sharing); HD-04 (social-sharing boundary), HD-15 (consumer submission return path); HD-14 (initial exported records); isolation-and-privacy.md (No wallet browsing).
- **Consumed by / blocks prompts:** DBX-15 (append/create + receipt operations), DBX-23 (submission intake + disposition), DBX-24 (consumer agent retrieval/retention), HAK-07 (bridge deposit), HAK-09 (consumer submission demo).
- **Relates to:** ADR-0016 (integration plane — the org side of the bridge), ADR-0018 (service identities), ADR-0011 (signed receipts/append-only), ADR-0023 (submission is the substrate for correction requests).

## Context

The Databox is a two-way, relationship-scoped post-box, not the person's general wallet (README). Records flow organisation→consumer (deposits) and consumer→organisation (submissions). Two boundaries must hold simultaneously:

- **Org→consumer:** the organisation deposits and controls its institutional copy; the consumer *retrieves and retains an independent copy* and may reshare *their* copy — without touching the institutional record or exposing their other Databox connections (invariants 5, 6, 8; HD-04).
- **Consumer→org:** the consumer submits by an *explicit disclosure* (a POST/create), never by the organisation reading the vault (invariant 6; isolation-and-privacy.md "No wallet browsing": "The program never executes a general query such as 'read the consumer profile'").

R-10 fixes the shape: bridges append signed records to org-controlled containers; consumers retrieve via standard Solid/LWS HTTP and keep independent copies; submissions are authenticated append/create followed by review; the org does not crawl the vault. HD-04 fixes the two-copy WAC split; HD-15 fixes the return path and the status of LDN/Notifications.

CSS 7.1.9 reality (DBX-01 §4): the append-only behaviour is a `PassthroughStore` decorator (`ReadOnlyStore` pattern) that must allow `addResource`/create but reject replace-of-existing via a `hasResource` check — a plain read-only throw would wrongly block legitimate creation. Retrieval/append use the standard LDP spine (DBX-01 §1). Notifications are best-effort hints only, never durable transport (DBX-01 §6).

## Decision

**Deposits (org→consumer).** Organisation bridges (ADR-0016, authenticating as their own program-scoped service agent, ADR-0018) **append signed records** to organisation-controlled Databox containers via authenticated POST/PUT. Storage appends the record and evidence atomically and returns a signed acceptance receipt (ADR-0011). Records are append-only: an incorrect record is **superseded** by a new linked record, never overwritten (invariant 7; the decorator allows create, rejects replace-of-existing).

**Retrieval and independent retention (consumer side).** The consumer retrieves via **standard Solid/LWS HTTP + RDF content negotiation** using an independent conforming client (invariant 12; implementation-decisions.md Solid interoperability requirement) and **retains an independent copy** wherever they choose. The organisation is not required for the consumer to keep or verify that copy; a signed receipt retained by the consumer survives later provider deletion/alteration (exchange-and-evidence.md).

**Two copies, two WAC controllers (HD-04, R-10).**

- The **organisation controls WAC on its institutional copy.** The consumer MUST NOT rewrite that ACL. This copy is the org's accountable record.
- The **consumer controls WAC on the copy in their own vault** and MAY perform ordinary WebID-based social sharing there.
- Sharing a vault copy **MUST NOT** modify the institutional source record's ACL and **MUST NOT** reveal the vault's other Databox connections (invariant 5; README security boundary). The two ACLs are independent; a change to one never propagates to the other.

**Submissions (consumer→org) are explicit disclosures, never reads (invariant 6; isolation-and-privacy.md).** The organisation **MUST NOT crawl or query the vault.** A consumer submission is an **authenticated POST/create into the program's append-only submission container** (HD-15). On durable acceptance the Databox **immediately returns a signed acceptance receipt** (invariant 8). The integration plane then consumes the committed submission event and places it in a **staff-review queue**; a reviewer appends a **disposition** returned through the Databox (ADR-0016; exchange-and-evidence.md submission flow). A submission is **never applied directly to the system of record**; it is staged for review.

**Notifications are hints, not transport (HD-15).** LDN, Solid Notifications or chat MAY alert a participant that something happened, carrying only an opaque event id and no sensitive content (exchange-and-evidence.md Notifications). They are **not** the authoritative submission or deposit transport, and they **never directly update the legacy system**. Authoritative transport is the authenticated HTTP operation + durable commit + signed receipt; missed events are recovered from the durable cursor feed (owned by DBX-21), not from a notification.

**Initial demo records (HD-14).** RetailCo exports a digital receipt (synthetic warranty/product/allergen metadata) then a synthetic recall update; AgencyCo exports a synthetic service notice — sufficient to demonstrate multiple sources, policy classes, supersession and aggregation without real institutional data.

## Alternatives considered

- **Let the organisation pull corrections/preferences by reading the consumer's Pod** — rejected (invariant 6; isolation-and-privacy.md). That is exactly the "read the consumer profile" query the design forbids; it would turn a relationship credential into background storage access. Consumer→org data moves only by explicit submission.
- **One shared record with a single ACL both parties edit** — rejected (HD-04). A single mutable ACL couples the org's accountable copy to the consumer's sharing choices and risks leaking other connections or letting one party rewrite the other's access. Two independent copies with independent WAC is the boundary.
- **Overwrite an incorrect record in place** — rejected (invariant 7; ADR-0011). Append-only + supersession preserves history and the validity of already-issued receipts. The store decorator must allow create but reject replace-of-existing (DBX-01 §4 sharp edge).
- **Make LDN the authoritative durable submission transport** — rejected (HD-15; implementation-decisions.md #8; DBX-01 §6). CSS notification delivery is best-effort/in-memory with no retry or replay; an HTTP-POST success to an inbox is not proof of durable consumer access. The authenticated operation + signed receipt is authoritative; notifications accelerate only.
- **Have the submission directly update the legacy system** — rejected (HD-15; exchange-and-evidence.md). Direct writes bypass review, validation and governed disposition. Submissions are staged; the source system is updated only through the governed correction/review connector (ADR-0016/0023).

## Consequences

- **Positive:** the person gets a durable, independently-verifiable copy they fully control and can reshare, while the organisation keeps an accountable, append-only institutional record; neither side can silently rewrite the other; the vault's connection graph stays private; submissions are consent-shaped explicit acts with signed receipts.
- **Negative / cost:** two copies means the consumer's reshared copy can diverge from a later-corrected institutional record — mitigated by supersession links and the correction-propagation duties (ADR-0023); the append-only decorator needs the careful create-vs-replace logic (DBX-01 §4); durable submission transport + receipts are more work than fire-and-forget notifications.
- **Privacy & threat notes:** closes the *vault-crawl* threat (org cannot read personal storage) and the *connection-graph-leak* threat (sharing one copy never exposes other Databoxes). Because notifications carry only opaque ids, an intercepted hint discloses nothing about record content. The submission container is append-only and per-program, so a compromised org identity cannot read back or delete a consumer's prior submissions across programs.

## Failure behavior

Fail closed. A deposit/submission that does not durably commit → **no receipt is returned** (exchange-and-evidence.md: never return acceptance before durable acceptance). A replace-of-existing on an append-only container → rejected (`ForbiddenHttpError`-style), record untouched. A submission whose relationship/client/assurance/declared-purpose does not validate → rejected, no staging (exchange-and-evidence.md submission flow). A notification-delivery failure → MUST NOT roll back an accepted deposit/submission; it remains visible and retryable and the consumer recovers via the durable feed. Any attempt by an org identity to read or query the vault → denied. Sharing a vault copy MUST NOT be able to alter the institutional ACL; if the two could ever couple, the operation fails rather than propagate.

## Open sub-questions / residual gates

- The durable cursor/event-feed that backs missed-event recovery (and makes "notifications are hints" safe) is owned by **DBX-21**.
- The disposition schema and reviewer workflow are shared with **DBX-23** (submission intake) and **ADR-0023** (correction as governed exchange).
- The append-only store decorator's exact create-vs-replace semantics are an implementation detail owned by **DBX-15/HAK-07** (DBX-01 §4 gives the pattern).
- No item here is Blocked: the exchange and social-sharing boundary is fully specified for its scope.
