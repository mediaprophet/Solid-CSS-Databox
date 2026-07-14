# Handoff — DBX-17

**Prompt:** DBX-17 — Append-only resource enforcement (records / submissions / receipts / evidence)
**Status:** complete — compiles, lints clean, 100% coverage on `src/databox/storage/**`. **Residual HUMAN
review gate OPEN** (see §7).
**Agent level:** Hard (security-critical)
**Date:** 2026-07-15
**Baseline:** Community Solid Server 7.1.9
**Depends on:** DBX-09 (C6 `AppendOnlyStore` scaffold), ADR-0018 (append-only / supersession / tombstone),
ADR-0014 (supersession links), DBX-04 §7.0/§7.6, DBX-03 (T-26/T-27/T-29), DBX-01 §4.

## 1. Files

| File | Change | Purpose |
|---|---|---|
| `src/databox/storage/AppendOnlyStore.ts` | **extended** | C6 decorator: create-yes/replace-no (kept) + `supersedeResource` + `tombstoneResource` + tombstoned-recreate denial + read helpers. Re-exports the three sibling modules so the existing barrel line covers them. |
| `src/databox/storage/AppendOnlyEvidence.ts` | **new** | `AppendOnlyEvidence` / `SupersessionEvidence` / `TombstoneEvidence` event types + `AppendOnlyEvidenceSink` (what DBX-19 implements, DBX-18 consumes). Types-only. |
| `src/databox/storage/AppendOnlySupersession.ts` | **new** | `SupersessionLink`, `SupersessionRegistry` + `InMemorySupersessionRegistry` (prior↔next link store). |
| `src/databox/storage/AppendOnlyTombstone.ts` | **new** | `TombstoneRequest`, `TombstoneState`, `TombstoneRegistry` + `InMemoryTombstoneRegistry` (tombstone state; tombstoned-vs-never-existed). |
| `test/unit/databox/storage/AppendOnlyStore.test.ts` | **extended** | 34 tests: kept DBX-09 cases, per-actor bypass matrix, supersession, tombstone, both registries. |

**No** `src/databox/index.ts` edit. The existing `export * from './storage/AppendOnlyStore'` line transitively
re-exports the three new modules because `AppendOnlyStore.ts` does `export * from './AppendOnlyEvidence'`
(and `./AppendOnlySupersession`, `./AppendOnlyTombstone`). New barrel symbols now reachable from
`src/databox`: `AppendOnlyStoreOptions`, `SupersessionResult`, `AppendOnlyEvidence`, `AppendOnlyEvidenceKind`,
`SupersessionEvidence`, `TombstoneEvidence`, `AppendOnlyEvidenceSink`, `SupersessionLink`,
`SupersessionRegistry`, `InMemorySupersessionRegistry`, `TombstoneRequest`, `TombstoneState`,
`TombstoneRegistry`, `InMemoryTombstoneRegistry`.

## 2. Append-only + supersession + tombstone design

**Append-only (unchanged core, DBX-01 §4 sharp edge).** `setRepresentation` calls `hasResource` first:
create allowed, **replace denied**; it now ALSO denies recreating a **tombstoned** path (would resurrect
retired history). `modifyResource` (PATCH) and `deleteResource` (DELETE) always throw `ForbiddenHttpError`.
Fail-closed: an undeterminable `hasResource` (a throw) propagates as denial, never as an allow.

**Supersession = correction (ADR-0018 §2, ADR-0014).** `supersedeResource(newId, repr, prior)` appends a
**new** record that links to `prior` and leaves `prior`'s bytes retrievable/unchanged. It (a) rejects a
tombstoned prior, (b) rejects a `prior` that does not resolve to an existing accepted record — **no dangling
supersession**, (c) rejects a second supersession of the same `prior` — **no fork / linear chain**, then (d)
creates the new record **through the append-only create path** (so create-yes/replace-no still binds the new
id), records the prior→next link, and emits `SupersessionEvidence`. Returns `{ changes, evidence }`.

**Tombstone = lawful deletion (ADR-0018 §3, T-29).** `tombstoneResource(id, {recordClass, legalBasis})`
records tombstone state + emits `TombstoneEvidence` and **never calls `source.deleteResource`** — bytes are
not destroyed. A missing/blank `legalBasis` is rejected (no silent rewrite). Distinguishes states: already
tombstoned → **idempotent replay** (no re-emit, no destroy); never existed → `NotFoundHttpError` (404);
`isTombstoned(id)` exposes the distinction to read handlers. History remains retrievable (reads pass through).

**Evidence.** Events are returned to the caller AND, when an `AppendOnlyEvidenceSink` is injected, pushed to
it. Timestamps come from an injectable `now()` (default ISO-8601 `Date`).

## 3. How EVERY actor class is bound (below authorization)

The decorator is a `PassthroughStore` in the `ResourceStore` chain **below** WAC/owner (ADR-0018 §4, invariant
17). Denial is a property of the *store method*, not of the caller's permission — the store has no notion of
actor, so a consumer, a program service identity, the storage owner (`OwnerPermissionReader` `control`), and an
administrator are denied identically through ordinary Solid PUT/PATCH/DELETE. The `it.each([consumer, program,
owner, admin])` matrix asserts this explicitly for replace/modify/delete. The **only** mutation paths are the
two governed methods, and neither is reachable as a standard LDP verb (method denial, not method redefinition,
S-07): a generic Solid client still sees standard 403s. (Infrastructure/root access *below* the store —
backups, DB admin — remains an invariant-10 infra-control problem, out of scope; ADR-0018 §Privacy notes.)

## 4. Threats mitigated

- **T-26** (overwrite/delete an accepted record via PUT/PATCH/DELETE as consumer/program/owner/admin) — replace
  denied via `hasResource`, PATCH/DELETE denied unconditionally, tombstoned-recreate denied; per-actor matrix.
- **T-29** (tombstone used to destructively erase) — `tombstoneResource` records state+evidence and provably
  never invokes `source.deleteResource` (asserted); idempotent replay never destroys.
- **T-27** (evidence tamper) — accepted history stays retrievable; supersession/tombstone are appended, linked,
  evidence-emitting events, not rewrites. (The durable append-only ledger itself is DBX-19.)

## 5. Barrel symbols

Listed in §1. No manual `index.ts` line required — the DBX-09 `export * from './storage/AppendOnlyStore'`
already covers them via the transitive `export *` re-exports added at the top of `AppendOnlyStore.ts`.

## 6. Commands + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) |
| `npx jest test/unit/databox/storage --coverage --collectCoverageFrom='src/databox/storage/**/*.ts' --coverageReporters=text` | **PASS** — 34 tests; **100%** stmts/branch/funcs/lines on `AppendOnlyStore.ts`, `AppendOnlySupersession.ts`, `AppendOnlyTombstone.ts` (`AppendOnlyEvidence.ts` is types-only, no executable lines) |
| `npx eslint src/databox/storage test/unit/databox/storage --max-warnings 0` | **PASS** (exit 0; only the shared-config `@stylistic` deprecation *notice*, not an error) |
| `npx jest test/unit/databox/FailClosedStubs` | **PASS** — 7 tests (export surface intact; `AppendOnlyStore` barrel re-export unchanged) |

## 7. Residual HUMAN review gate (RECORDED — OPEN)

ADR-0018's decision owner marked a **security** residual gate: the "below the WAC/owner layer, no actor class
can bypass" placement is a security invariant whose enforcement point needs a **named security reviewer** before
production sign-off. This code fixes the *mechanism* (create-yes/replace-no/no-destroy, per-actor at the store);
a human security reviewer must still confirm the **store-chain insertion point** (ordering vs
`LockingResourceStore`/`MonitoringStore`, and that no store above it can satisfy a write the decorator would
deny) when C6 is spliced into the live chain. Wiring the decorator into the config chain is **not** done here
(DBX-09 §3 note: splice deferred); it remains for the integration prompt. Gate status: **OPEN**.

## 8. What DBX-18 (receipts) and DBX-19 (evidence ledger) consume

- **DBX-19 (evidence ledger, C13)** implements `AppendOnlyEvidenceSink.record`; inject it as
  `new AppendOnlyStore(source, { evidence: ledgerSink, now })` so each supersession/tombstone is committed to
  the append-only/WORM ledger under the §7.0 commit protocol. `SupersessionEvidence` / `TombstoneEvidence`
  carry only structural facts (paths, class, legal-basis ref, time) — no payload — so the ledger event never
  leaks record content (T-27, ADR-0018 §Privacy).
- **DBX-18 (receipts, C19)** binds the returned evidence into acceptance/correction/deletion receipts: a
  correction receipt references `SupersessionEvidence.supersedes`/`supersededBy`; a deletion receipt references
  `TombstoneEvidence.legalBasis` + `recordedAt`. `supersededBy(id)` / `isTombstoned(id)` give read/receipt
  handlers the "current version" and "tombstoned vs never-existed" answers. A previously issued acceptance
  receipt stays valid: tombstone does not destroy the bytes it attested (exchange-and-evidence.md §Immutability).
- **Store-chain splice + integration test** (verifying the decorator actually sits below C4 authorization for
  every actor in a running instance) is the remaining wiring step, owned by the integration prompt; the
  in-memory registries are reference impls a durable, access-audited store replaces without changing the
  contract.
