# Handoff — DBX-19

**Prompt:** DBX-19 — Evidence ledger and audit binding (component C13; ADR-0019, ADR-0018; DBX-04 §7.0
commit protocol, §6 authoritative-state matrix; exchange-and-evidence.md §Audit/§Atomicity).
**Status:** complete. BOTH tsc clean, eslint clean, **100% coverage** on every `src/databox/evidence/**/*.ts`,
**36 tests** across 5 suites. The DBX-09 `NotImplementedEvidenceLedger` stub is KEPT and stays green.
**Agent level:** Hard — REAL security-critical code. **Residual HUMAN review gate OPEN** (see §7).
**Baseline:** Community Solid Server 7.1.9.
**Depends on / REUSES (consumed via imports, NOT modified):** DBX-16 `proof/Canonicalization`
(`canonicalDigest` = the hash-chain digest primitive; `digestOfBytes` for path-digesting; `normalizeSha256`)
— **no new crypto here**; DBX-12 `context/DataboxRequestContext` (the verified actor/assurance/delegation
bound into each entry); DBX-17 `storage/AppendOnlyEvidence` (`AppendOnlyEvidence`/`AppendOnlyEvidenceSink` —
this prompt IMPLEMENTS that sink, no name duplication); DBX-18 `receipt/*` (the `receiptDigest`/receipt the
ledger anchors — conceptual, bound as an optional digest field).
**Decisions honoured:** ADR-0019 (append-only external hash-chained ledger; records allow/deny/partial;
denials without content leak; minimised consumer projection; §7.0 commit anchor = evidence event + outbox
appended atomically), ADR-0018 (append-only), ADR-0014 (policy DIGEST bound, not a bare version string).

## 1. Files

| File | Purpose |
|---|---|
| `src/databox/evidence/Evidence.ts` | **extended**: kept `EvidenceEvent`/`AcceptanceReceipt`/`EvidenceLedger` + the fail-closed `NotImplementedEvidenceLedger` (FailClosedStubs stays green) and added four `export *` lines so the barrel covers the real ledger. |
| `src/databox/evidence/EvidenceChain.ts` | **new**: the hash-chain primitive — `GENESIS_PREV_DIGEST`, `LedgerEntry`/`EntryDigestInput`, `computeEntryDigest` (binds `prevDigest` via `canonicalDigest`), `verifyChain` (`ChainVerification` — detects `sequence-out-of-order` / `prev-digest-mismatch` / `entry-digest-mismatch`). |
| `src/databox/evidence/AuditEvidence.ts` | **new**: the bound audit record — `EvidenceDecision`, `BoundActor`, `bindActorFromContext` (binds ONLY verified `DataboxRequestContext` fields), `PolicyEvaluation`, `AuditEvidenceRecord`/`AuditRecordInput`, `OutboxRecord`, `buildAuditRecord` (validates + fails closed; target must be a digest/`opaque:` ref, never a raw path/payload), `assertNonEmpty`. |
| `src/databox/evidence/EvidenceLedgerStore.ts` | **new**: `HashChainedEvidenceLedger` (append-only, external, hash-chained; `append`=§7.0 atomic commit of evidence event + outbox; `verify`/`entries`/`tenants`; NO update/delete surface), `LedgerAppendInput`, `LedgerSinkOptions`, `LedgerEvidenceSink` (the DBX-17 `AppendOnlyEvidenceSink` against C13; digests the path). |
| `src/databox/evidence/AuditProjection.ts` | **new**: `projectForConsumer` → minimised `ConsumerAuditView`/`ConsumerAuditEntry` (subject-owned events only; omits staff id / issuer / assurance / outbox / pre-post digests). |
| `test/unit/databox/evidence/*.test.ts` (5 suites) + `EvidenceTestSupport.ts` | 36 tests; 100% coverage. |

`src/databox/index.ts` was **NOT** edited — its existing `export * from './evidence/Evidence'` transitively
re-exports every new module via the four `export *` lines added to `Evidence.ts`.

## 2. Design

**Hash chain (T-27).** Every `LedgerEntry` binds the prior entry's `entryDigest` as its `prevDigest`; the
first binds `GENESIS_PREV_DIGEST`. `entryDigest = canonicalDigest({ sequence, tenantId, recordedAt,
prevDigest, record, outbox })` — a STRUCTURED canonicalization, never string concatenation. Modifying any
committed field changes the recomputed digest (`entry-digest-mismatch`); reordering breaks the sequence
(`sequence-out-of-order`) or the linkage (`prev-digest-mismatch`). `verifyChain` walks the chain and returns
the first break. Entries are `Object.freeze`d at commit; `entries()` returns a defensive copy.

**Append-only + external (T-27/T-32).** `HashChainedEvidenceLedger` is its own store reachable only through
`append` — there is deliberately **no update/set/delete method**. Ordinary Solid PUT/PATCH/DELETE never reach
it, so an owner/admin cannot rewrite it through the Pod. (In-memory chains are the reference substrate a
durable WORM store replaces behind the same surface — ADR-0019 §Open sub-questions.)

**§7.0 atomic commit.** `append({ tenantId, record, outbox? })` binds the evidence event AND the outbox
record into ONE digested, frozen entry with a single `push` AFTER all validation — either the whole entry
commits or nothing does (fail closed on blank tenant / non-object record / cross-tenant outbox). This is the
commit anchor: no half-committed evidence, and the outbox rides the same entry (IF-05/IF-07).

**Actor bound from the VERIFIED context, never headers.** `bindActorFromContext(context)` reads only the
immutable, frozen `DataboxRequestContext` (C3): actor (default WebID), represented entity (or delegation
`onBehalfOf`), delegation grant ref, client, issuer, audience, assurance grade/dimensions/crosswalk, authTime.
There is no header input path — an attacker cannot inject an actor.

**Deny/partial without leak (T-55).** `buildAuditRecord` accepts `decision: allow|deny|partial` and binds
the actor + policy + reason code + target DIGEST. The target must match `urn:sha256:<hex>` or `opaque:<token>`
(no slashes) — a raw path or content string is REJECTED, so the ledger never stores payload or another
tenant's facts. Attacker-controlled fields (WebID, reason) are structured JSON members, escaped by
canonicalization — they cannot inject a chain link or CRLF.

**Minimised consumer projection (T-34; ADR-0019).** `projectForConsumer(entries, subject)` keeps only events
the subject OWNS (actor OR webId OR represented entity — a subject appearing only as `institutionalPrincipal`
is excluded) and maps each to `{ recordedAt, operation, decision, reasonCode, targetDigest, state,
policyVersion, odrlState }`. It drops the staff/institutional principal, issuer/client, assurance internals,
outbox and pre/post digests; a denial is retained but carries no content.

## 3. Threats mitigated (DBX-03)

- **T-27** (tamper/reorder the ledger): hash chain + `verifyChain` detect a mutated entry (digest) and a
  reordered chain (sequence/linkage). Tests assert both.
- **T-32** (support tooling edits outside evidence): the ledger is external and append-only with no
  update/delete surface — a committed entry is frozen and cannot be rewritten through the object.
- **T-34** (operator reconstructs a cross-subject graph): the consumer projection is scoped to owned events
  and strips staff/operational fields; a staff-only event never appears in the subject's view.
- **T-55** (audit/log injection): entries are structured + canonicalized, never string-concatenated; the
  target is constrained to a digest/opaque ref so no raw path/payload/other-tenant fact enters the ledger.

## 4. Barrel symbols (NO edit to `src/databox/index.ts`)

`Evidence.ts` now does `export * from './EvidenceChain' | './AuditEvidence' | './EvidenceLedgerStore' |
'./AuditProjection'`, so the existing `export * from './evidence/Evidence'` line covers them all. Reachable:
`GENESIS_PREV_DIGEST`, `EntryDigestInput`, `LedgerEntry`, `ChainVerification`, `computeEntryDigest`,
`verifyChain`; `EvidenceDecision`, `BoundActor`, `bindActorFromContext`, `PolicyEvaluation`,
`EvidenceRecordState`, `AuditRecordInput`, `AuditEvidenceRecord`, `OutboxRecord`, `buildAuditRecord`,
`assertNonEmpty`; `LedgerAppendInput`, `HashChainedEvidenceLedger`, `LedgerSinkOptions`, `LedgerEvidenceSink`;
`ConsumerAuditEntry`, `ConsumerAuditView`, `projectForConsumer`; plus the kept DBX-09 `EvidenceEvent`,
`AcceptanceReceipt`, `EvidenceLedger`, `NotImplementedEvidenceLedger`.

## 5. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) |
| `npx jest test/unit/databox/evidence --coverage --collectCoverageFrom='src/databox/evidence/**/*.ts' --coverageReporters=text` | **PASS** — 5 suites, **36 tests**; **All files 100%** stmts/branch/funcs/lines |
| `npx eslint src/databox/evidence test/unit/databox/evidence --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice) |
| `npx jest test/unit/databox/FailClosedStubs` | **PASS** — 7 tests (NotImplementedEvidenceLedger still refuses; barrel intact) |

Per constraint 4: did NOT run `git add`/`commit`, `npm run build`, or `npm ci`. Only the two tsc invocations,
scoped jest, scoped eslint. No new raw crypto — hashing reuses DBX-16 `Canonicalization`.

## 6. Reconciliation with DBX-17 `AppendOnlyEvidenceSink`

`LedgerEvidenceSink implements AppendOnlyEvidenceSink` — this prompt provides the C13 implementation DBX-17
documented, with NO duplicated/conflicting export names. Inject it as `new AppendOnlyStore(source, { evidence:
new LedgerEvidenceSink(ledger, { tenantId, context, policy }), now })` so each supersession/tombstone commits
to the hash chain. The sink digests `evidence.target` (never stores the raw path).

## 7. Residual HUMAN review gate (RECORDED — OPEN)

ADR-0019 marks a residual **security** (WORM/hash-chain ledger placement) and **cryptography** gate. This
code fixes the *mechanism* (hash chain, append-only-external, atomic commit, deny-without-leak, minimised
projection). A named reviewer must still sign off, before production, on: (a) the **durable WORM substrate**
that replaces the in-memory chains (operational controls; genesis provenance; that infra/root/backup access
below the object cannot rewrite it — invariant 10, out of scope here); (b) the digest/canonicalization choice
for the chain (reused DBX-16 — confirm no raw crypto added); (c) the exact **projection minimisation rules**
(which staff/operational fields are suppressed) — a privacy/legal profile owned by DBX-23; (d) that the §7.0
transaction placement in the live commit path uses this atomic append as the accept point. Gate status: OPEN.

## 8. What DBX-20 / DBX-21 consume

- **DBX-20 (duty transitions):** append a `duty-transition` `AuditEvidenceRecord` (kind/operation
  `duty-transition`, `odrlRule`/`odrlState` in `PolicyEvaluation`, `recordState` for current/superseded/
  disputed) via `HashChainedEvidenceLedger.append` — each transition is a hash-chained evidence event, and
  `projectForConsumer` already surfaces `odrlState` in the consumer view. The actor is bound from the verified
  context exactly as here.
- **DBX-21 (outbox in the same append):** `LedgerAppendInput.outbox` (`OutboxRecord`) is the atomically-bound
  outbox record — DBX-21 supplies it on the accept path so the evidence event + outbox commit together (IF-05/
  IF-07); C14 drains the outbox from the committed entry. The `receiptDigest` field binds the DBX-18 receipt
  anchored after the durable commit.
