<!--
ADR — Databox decision register (DBX-02). Cluster: exchange & evidence.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0018 — Append-only records, supersession and tombstone deletion

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the "below the WAC/owner layer, no actor class can bypass" placement is a security invariant and its enforcement point needs a named security reviewer before production sign-off.
- **Sources adjudicated:** R-11 (immutability half); review-item #17 (immutability half); S-07; exchange-and-evidence.md Immutability and correction section; DBX-01 §3, §4.
- **Consumed by / blocks prompts:** DBX-17, HAK-07 (both blocked on the append-only enforcement contract fixed here).
- **Relates to:** ADR-0019 (receipts and evidence ledger — supersession and tombstone events are recorded there), ADR-0022 (quarantine state machine is layered above this store).

## Context

Invariant 7 forbids silent overwrite of accepted records; invariant 10 treats hosting-provider administration as a threat controlled *below* the RDF ACL layer. Review-item #17 splits into two halves: the immutability half (accepted bytes and historical evidence stay immutable) is adopted here; the "policy updates affect only new records" half — that authorization and legal obligations can still change — is owned by DBX-20 and is out of scope for this ADR. R-11 states accepted records, submissions, dispositions and receipts are append-only; correction is supersession, deletion is tombstone.

DBX-01 §4 identifies the exact CSS seam and its sharp edge. `ReadOnlyStore` (`src/storage/ReadOnlyStore.ts:13-45`) is a `PassthroughStore` subclass that throws `ForbiddenHttpError` on `addResource`/`deleteResource`/`modifyResource`/`setRepresentation` while passing reads through — the pattern to adapt. **The sharp edge:** `setRepresentation` is used by CSS for *both* create and replace (`ResourceStore.ts:44-58`). A blanket `ReadOnlyStore`-style throw would block legitimate creation. DBX-01 §3 also confirms there is no append-only concept anywhere in `src/authorization/` or `src/storage/` today (`ImmutableMetadataPatcher` protects only specific *metadata triples* from PATCH, not resource-level append-only). S-07 requires that append-only be enforced through authorization and **method denial**, not by redefining standard HTTP/LDP method semantics, so a generic conforming Solid client still sees standard operations and standard status codes.

## Decision

Accepted Databox resources — deposited records, consumer submissions, dispositions and issued receipts — are **append-only**. This is enforced as a `PassthroughStore` decorator in the `ResourceStore` chain (DBX-01 §4), positioned **below** authorization and the WAC/owner layer, adapting the `ReadOnlyStore` pattern.

1. **No in-place mutation.** On an accepted resource the decorator MUST reject `modifyResource` (PATCH) and `deleteResource` (DELETE) with `ForbiddenHttpError`, and MUST reject `setRepresentation` **only when the target already exists**. It MUST implement this by calling `hasResource` first and rejecting the replace case while allowing the create case (the DBX-01 §4 sharp edge). `addResource` (POST create into an append container) is permitted.

2. **Correction = supersession, never overwrite.** An incorrect record is corrected by appending a **new** record that is machine-linkably `supersedes` the prior version (the envelope's `supersedes` field, exchange-and-evidence.md). The prior bytes remain retrievable and unchanged. A consumer correction is a separate submission; a review outcome is a separate disposition — each is a new appended resource with its own receipt (ADR-0019), never an edit of the original.

3. **Lawful deletion = tombstone + evidence event, never destructive rewrite.** A lawful deletion replaces the resource's *served representation* with a tombstone marker (recording that the resource existed, its class, the deletion's legal basis reference, and time) and emits a deletion evidence event (ADR-0019). The original accepted bytes are never silently rewritten in place; where retention policy requires the source, they are retained under the tombstone. A tombstone is itself an append, not a mutation of history.

4. **Enforcement binds every actor class, below WAC/owner (invariant 17).** The decorator sits *below* the authorization layer in the store chain, so its denial applies to **every** actor that reaches the store through ordinary Solid operations — including an administrator or the storage owner. No WAC `control` permission, owner permission (`OwnerPermissionReader`), or ordinary Solid operation can bypass append-only. (Infrastructure/root access below the store — backups, DB admin — is a separate infrastructure-control problem per isolation-and-privacy.md and invariant 10; this ADR closes the *ordinary-operation* bypass, which is the class of bypass a Solid actor can attempt.)

5. **Method denial, not method redefinition (S-07).** PATCH, PUT, DELETE keep their standard HTTP/LDP semantics and standard status codes; append-only is expressed purely as denial of the mutating cases. A generic conforming Solid client that does not understand Databox policy still receives standard, non-misleading responses (invariant 12).

## Alternatives considered

- **Enforce append-only in the authorization/PermissionReader layer only (force `write`/`delete` to `false`).** Rejected as the *sole* mechanism: authorization is the right place to *also* deny, but placing enforcement only there leaves the owner/admin path — `OwnerPermissionReader` grants control to the owner (DBX-01 §2–3) — able to satisfy the permission check and mutate. Invariant 17 requires that even the owner cannot bypass, so the *store* decorator (below WAC/owner) is the binding layer; an authorization-layer denial MAY be added as defence-in-depth but is not sufficient alone.
- **Blanket `ReadOnlyStore` on accepted containers.** Rejected: it blocks legitimate `addResource`/create-via-`setRepresentation`, defeating append. The decorator must distinguish create from replace via `hasResource` (DBX-01 §4).
- **Redefine PUT/DELETE to mean "supersede"/"tombstone".** Rejected (S-07): redefining method semantics breaks generic Solid clients and invariant 12; supersession/tombstone are explicit appended operations, not overloaded verbs.
- **Destructive deletion for "right to erasure".** Rejected: it would silently rewrite history and invalidate the evidence chain (ADR-0019) and already-issued receipts. Lawful deletion is modelled as a tombstone + evidence event so erasure is auditable and receipts remain valid (exchange-and-evidence.md; ADR-0019).

## Consequences

- **Positive:** Invariant 7 and invariant 17 are enforced structurally, not by convention; HAK-07's gate ("accepted resources cannot be overwritten") is met by the store decorator. Correction and deletion produce auditable, linked events rather than lost history. Reuses a proven CSS pattern (`PassthroughStore`) — no core fork.
- **Negative / cost:** Every accepted-container write path pays a `hasResource` check before `setRepresentation`. Storage grows monotonically (supersessions and tombstones accumulate); retention/tombstone lifecycle must be governed. Genuine erasure obligations are satisfied by tombstone + retained-under-policy, which legal reviewers must confirm meets the applicable erasure standard (owned by the legal-policy workstream, R-12).
- **Privacy & threat notes:** Directly closes the "append-only bypass" threat (isolation-and-privacy.md; HAK-10) for any Solid actor including admin/owner. Does **not** by itself defend against infrastructure-level tampering (DB/backup access) — that is invariant-10 infrastructure control and the external evidence ledger (ADR-0019) is the cross-check. Tombstone markers MUST NOT leak deleted content or, via their metadata, another connection's existence.

## Failure behavior

Fail closed:
- Any mutating operation on an accepted resource whose disposition is ambiguous (cannot confirm whether the target exists, or whether it is an accepted resource) is **denied**, not allowed — the decorator defaults to reject when `hasResource` or classification is indeterminate.
- If the append and its evidence event cannot be committed atomically (ADR-0019), the append is rejected and no receipt is issued; the client retries under the same idempotency key.
- A supersession whose `supersedes` target does not resolve to an existing accepted record is rejected (no dangling supersession).
- A tombstone request lacking a recorded legal-basis reference is rejected; deletion is never performed as a silent in-place rewrite.
- Denials preserve the existence-hiding rule (404-not-403, DBX-01 §3) where the actor lacks read.

## Open sub-questions / residual gates

- The **tombstone lifecycle and retention schedule** (how long tombstoned bytes are retained per record class, when the tombstone marker itself may be pruned) is a Profile/legal-policy choice owned by DBX-20/R-12 legal workstream; not settled here.
- Whether policy/authorization changes re-evaluate access to already-accepted immutable bytes (review-item #17's *second* half) is explicitly **out of scope** and owned by DBX-20.
- The concrete store-chain insertion point and its ordering relative to `LockingResourceStore`/`MonitoringStore` is an implementation detail for DBX-17/HAK-07 to fix against DBX-01 §4; the *contract* (create-yes, replace-no, below-WAC, method-denial) is fully specified here.
