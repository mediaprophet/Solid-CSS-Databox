# Handoff — DBX-23

**Prompt:** DBX-23 — Submission review and disposition workflow (component C17, DBX-04 §49/IF-12/IF-13;
the governed review queue + signed, append-only disposition — no direct system-of-record write).
**Status:** complete. BOTH tsc clean, eslint clean, **100% coverage** on every `src/databox/review/**/*.ts`
(6 files), **70 tests** across 5 suites. `build:components` exit 0 (no `.componentsignore` additions).
FailClosedStubs stays green (7).
**Agent level:** Medium.
**Baseline:** Community Solid Server 7.1.9.

**Consumes via imports (NOT modified):**
- `credential/Es256` (`signCompactJws`/`verifyCompactJws`/`decodeCompactJws` — the reviewer/governed
  disposition signature; no new crypto).
- `proof/Canonicalization` (`canonicalDigest`/`digestOfBytes`/`normalizeSha256` — the envelope digest,
  evidence targets and linkage).
- `policy/DutyEngine` (`DutyEngine`, `DutyHandler`, `DutyRunResult`) + `odrl/terms` (`DBX_DUTIES` —
  `stageForReview`/`recordDisposition`): the DBX-20 duty engine drives fulfil/fail; `queued != fulfilled`.
- `evidence/AuditEvidence` (`buildAuditRecord`) + `evidence/EvidenceLedgerStore`
  (`HashChainedEvidenceLedger`): every review action is hash-chained evidence, actor bound from the verified
  context.
- `context/DataboxRequestContext`, `profile/InstitutionProfile` (`AssuranceDimension`): the assurance gate.

**Decisions honoured:** ADR-0016 (a submission routes to a governed source-system case; the bridge/plane
does NOT directly write the system of record), ADR-0017 (the queue consumes the COMMITTED submission event,
not a notification), ADR-0018 (a disposition is a NEW appended resource linked to the submission, never an
in-place edit), ADR-0012 (`stageForReview` fulfilled when durably present in the governed queue;
`recordDisposition` fulfilled on the signed disposition; queued≠fulfilled), ADR-0023 (signed disposition,
response clock, reasoned outcomes: superseding record / conspicuously-linked statement / partial /
no-change-with-reasons+appeal / more-information / redirect; appeal≠step-up). Threat: **T-45** (forged
high-assurance self-asserted fact → review before source-of-record update; submitter identity + payload
digest preserved through the whole workflow).

## 1. Files created (all new, under `src/databox/review/**`)

| File | Purpose |
|---|---|
| `ReviewTypes.ts` | Pure value types + constants (`SUBMISSION_KINDS`, `DISPOSITION_OUTCOME_KINDS`, `SUPERSEDING_OUTCOMES`, `REVIEW_CASE_STATES`): `SubmitterIdentity`, `CommittedSubmissionEvent`, `ReviewCase`, `Reviewer`, `AssuranceRequirement`, `DispositionDecision`, `DispositionEnvelope`/`DispositionLinks`, `SignedDisposition`. Submitter identity + payload digest are structural fields carried end to end; every reference is opaque/`urn:sha256`. |
| `ReviewAssurance.ts` | The reviewer assurance gate (`evaluateAssurance`/`meetsAssurance`): assurance read ONLY from the verified `DataboxRequestContext`; absent assurance or any required dimension below its minimum (missing ⇒ `0`) fails closed, naming the shortfall dimension. |
| `GovernedReviewQueue.ts` | The governed queue (`GovernedReviewQueue`, `caseIdFor`): `stage` (idempotent consume of a committed event → `pending` case + response-clock `dueAt`), `claim` (assurance-gated, single-reviewer, fail closed), `markDisposed` (only the assigned reviewer of a claimed case), `overdue` (response clock visible), `list`/`get`/`require`. |
| `SignedDisposition.ts` | The signed disposition model (`buildSignedDisposition`/`verifyDisposition`): validates the per-outcome required reference, copies submitter + payload digest + policy verbatim, ES256-signs the canonical envelope; verify checks signature + `typ` + recomputed canonical digest (tamper-evident). |
| `AppendOnlyDispositionStore.ts` | The append-only store (`AppendOnlyDispositionStore`): `append` refuses overwriting an existing `dispositionId` (409, no in-place edit), links each disposition to its submission (`forSubmission`), never touches the source of record. |
| `DispositionWorkflow.ts` | **Barrel entry** + orchestrator (`DispositionWorkflow`) + `SyntheticSourceOfRecord`/`GovernedSourceCaseOpener`/`GovernedSourceCase`. Couples queue + assurance + signing + append + DBX-20 duties + DBX-19 evidence; enforces no-SoR-write-before-authorized-disposition and reconstructable actor transfers. |

Tests: `test/unit/databox/review/{ReviewTestSupport,ReviewAssurance,GovernedReviewQueue,SignedDisposition,AppendOnlyDispositionStore,DispositionWorkflow}.ts`.

`src/databox/index.ts` was **NOT** edited (forbidden). See §5 for the barrel line to add.

## 2. Design — stage → claim → dispose

1. **Consume the committed event (ADR-0017).** `workflow.stage(event)` stages the COMMITTED submission event
   (submitter identity + exact-bytes `payloadDigest` carried verbatim) into `GovernedReviewQueue` as a
   `pending` case with a computed response-clock `dueAt`. The stage IS the durable act, so the
   `stageForReview` duty is fulfilled (ADR-0012) — the SUBMITTER is bound as the acting party. Idempotent:
   re-staging the same `submissionRef` returns the original case and does not re-run the duty.
2. **Claim = staff assignment + assurance gate (fail closed).** `workflow.claim(caseId, reviewer, req)` gates
   on the reviewer's VERIFIED assurance (`ReviewAssurance`); an under-assured reviewer, or a case already
   claimed by another, is refused. The actor transfer to the reviewer is appended as a `review-claim`
   evidence record (reviewer bound as actor).
3. **Record the reasoned disposition (ADR-0018/0023).** `workflow.recordDisposition(reviewer, decision, req)`
   fails closed BEFORE any side effect unless the case is `claimed` by exactly this reviewer AND the reviewer
   still meets the assurance minimum. It then builds the reasoned envelope (submitter + payload digest +
   policy copied verbatim), ES256-signs it, and appends it linked to the submission — the durable append IS
   the `recordDisposition` fulfilment condition. On success the case is disposed, a `disposition-recorded`
   evidence record binds the outcome + envelope digest, and a SUPERSEDING outcome routes a governed
   source-of-record case. A failed append leaves the duty `failed` and VISIBLE, the case `claimed`, the SoR
   untouched.

## 3. How the acceptance-gate invariants hold

- **No SoR write before an authorized disposition (T-45).** `stage`/`claim` never call the source of record.
  Only `recordDisposition`, after the assurance+assignment gate AND the durable signed append, routes a
  governed case — and `SyntheticSourceOfRecord.openCorrectionCase` NEVER mutates the seeded record map (the
  correction is a new governed case referencing a superseding record, ADR-0016). Tests assert the seeded
  digest is unchanged and `cases()` stays empty through stage/claim, a failed append, and every fail-closed
  refusal.
- **Unassigned/under-assured reviewer cannot dispose (fail closed).** Three ordered guards (`claimed` state,
  reviewer identity match, live assurance re-check) each throw `ForbiddenHttpError` before any signing/append/
  routing — tested for pending, wrong-reviewer, and raised-requirement cases (store + SoR both empty).
- **Signed, appended, linked, never overwriting the submission (ADR-0018).** The disposition is an ES256 JWS
  over the canonical envelope; `AppendOnlyDispositionStore.append` refuses a duplicate `dispositionId`;
  `verifyDisposition` re-derives the canonical digest and rejects any tamper. The submission is never
  modified — the disposition is a distinct appended resource linked via `links.submissionRef`.
- **Submitter identity + payload digest preserved end to end.** Carried on `CommittedSubmissionEvent`, stored
  verbatim in the case, copied verbatim into the signed envelope; a verify test asserts the disposed
  envelope's `submitter.submitterRef` and `payloadDigest` equal the original event's.
- **Overdue + failed review duties visible.** `overdueCases(atIso?)` surfaces cases past `dueAt` and not
  disposed (response clock); `failedDuties()`/`duty(id)` surface a `failed` `recordDisposition` duty.
- **Actor transfers + decisions reconstructable.** Staging binds the submitter, claiming binds the reviewer,
  the disposition binds the reviewer + outcome + envelope digest — all appended to the hash-chained DBX-19
  ledger (chain `verify().valid` asserted).

## 4. Reconciliation with the bridge (DBX-22) + storage AppendOnly

- `GovernedSourceCaseOpener` is the integration-plane seam (ADR-0016). `SyntheticSourceOfRecord` is the
  reference model; production wires the **DBX-22 `DataboxBridge`** here so the correction opens/reconciles a
  governed source-system case (the bridge still does NOT directly write the legacy system of record).
- `AppendOnlyDispositionStore` deliberately mirrors `storage/AppendOnlyStore`'s create-yes/replace-no
  contract (ADR-0018). Production layers disposition resources behind the real append-only store; this
  governed-queue-local index enforces the same no-in-place-edit invariant for the unit plane.

## 5. Barrel symbols (NO edit to `src/databox/index.ts`)

`DispositionWorkflow.ts` re-exports all five siblings, so ONE line — added by whoever DI-wires C17 (mirrors
the DBX-15/18/22/24 one-entry-file pattern):

```ts
// Governed review queue + disposition workflow (C17, DBX-23)
export * from './review/DispositionWorkflow';
```

That transitively exposes every DBX-23 symbol: `DispositionWorkflow`, `DispositionWorkflowOptions`,
`DispositionResult`, `ReviewDutyRecord`, `SyntheticSourceOfRecord`, `GovernedSourceCaseOpener`,
`GovernedSourceCase`; `GovernedReviewQueue`, `GovernedReviewQueueOptions`, `caseIdFor`; `buildSignedDisposition`,
`verifyDisposition`, `DispositionSigningInput`; `AppendOnlyDispositionStore`; `evaluateAssurance`,
`meetsAssurance`, `AssuranceGateResult`; and the `ReviewTypes` values/constants (`SubmissionKind`,
`DispositionOutcomeKind`, `SUPERSEDING_OUTCOMES`, `ReviewCaseState`, `SubmitterIdentity`,
`CommittedSubmissionEvent`, `ReviewCase`, `Reviewer`, `AssuranceRequirement`, `DispositionDecision`,
`DispositionEnvelope`, `DispositionLinks`, `SignedDisposition`, `SUBMISSION_KINDS`,
`DISPOSITION_OUTCOME_KINDS`, `REVIEW_CASE_STATES`).

## 6. `.componentsignore` additions

**None.** componentsjs only processes classes reachable from the package `index.ts` barrel; DBX-23 does not
wire that line, so `npm run build:components` already exits 0 with no "Could not understand parameter type"
error for any `src/databox/review/` class. When DBX-25 adds the barrel line, the review classes take
function-typed options (`ledger`/`signingKey: KeyObject`/`now`) exactly like the already-ignored
`AcceptanceReceiptSigner`/`DataboxBridge`; if `build:components` then reports a parameter-type error for
`DispositionWorkflow`, `GovernedReviewQueue`, `AppendOnlyDispositionStore` or `SyntheticSourceOfRecord`, add
those class names to `.componentsignore` (none were needed in this prompt).

## 7. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) |
| `npx eslint src/databox/review test/unit/databox/review --max-warnings 0` | **PASS** (0 errors; only the shared `@stylistic` deprecation notice) |
| `npx jest test/unit/databox/review --coverage --collectCoverageFrom='src/databox/review/**/*.ts' --coverageReporters=text` | **PASS** — 5 suites, **70 tests**; **All files 100%** stmts/branch/funcs/lines |
| `npm run build:components` | **PASS** (exit 0; no `.componentsignore` additions) |
| `npx jest test/unit/databox/FailClosedStubs` | **PASS** — 7 tests (still green) |

Per constraints: did NOT run `git add`/`commit` or `npm ci`; did NOT edit `src/databox/index.ts` or any
gateway/storage/policy/credential/receipt/evidence/bridge file — all consumed via imports.

## 8. What DBX-25 (integration) consumes

- `DispositionWorkflow` is the C17 end of the correction flow: DBX-25 feeds it the COMMITTED submission event
  from the DBX-15 gateway / DBX-22 bridge outbox (built from `GatewayAcceptance` + the C13 commit), wires the
  real DBX-19 `HashChainedEvidenceLedger`, the program's reviewer signing key, and the DBX-22 `DataboxBridge`
  as the `GovernedSourceCaseOpener` (replacing `SyntheticSourceOfRecord`).
- The acceptance-gate properties proven here — no SoR write before an authorized disposition; fail-closed
  unassigned/under-assured; append-only signed linked disposition; preserved submitter identity + payload
  digest; visible overdue/failed duties; reconstructable actor transfers — are the invariants DBX-25 should
  assert survive against the real components.

## 9. Notes / limitations (honest)

- The `stageForReview` handler accepts unconditionally because `stage()` is the durable act (a throw never
  reaches the duty), matching ADR-0012 "fulfilled when durably present." The `recordDisposition` duty is the
  genuine fulfil/fail seam (a duplicate `dispositionId` append settles it `failed`, tested).
- `SyntheticSourceOfRecord` and the response-clock default (10 days) are CANDIDATE/synthetic per ADR-0023 —
  the CDR/APP compliance clock is gated behind the ADR-0015 legal-attestation gate and MUST NOT be asserted
  as compliance. All identifiers/keys in tests are synthetic (`node:crypto` test keys, `pairwise:*` refs).
- Appeal (substantive `no-change`) vs step-up (assurance gap) are kept distinct (ADR-0023): the disposition
  carries an `appealRoute`; the assurance gate's shortfall is the internal step-up signal. The consumer-facing
  step-up response shape is DBX-14's concern (not re-implemented here).
