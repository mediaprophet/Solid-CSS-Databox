# Handoff — DBX-20

**Prompt:** DBX-20 — ODRL evaluator + obligation engine (component C12, IF-04/IF-16/IF-19; ADR-0012
duties, ADR-0013 conflict/precedence, ADR-0014 versioning/effective-time, ADR-0015 legal-compilation
boundary; DBX-04 §6 "Duty state"/"ODRL policy version" owner; DBX-03 T-25/T-50/T-57).
**Status:** complete. BOTH tsc clean, eslint clean, **100% coverage** on every
`src/databox/policy/**/*.ts` (11 files), **87 tests** across 11 suites. FailClosedStubs stays green (7).
**Agent level:** Hard — REAL security-critical code. **Residual HUMAN + independent-Hard policy review
gate OPEN** (see §7).
**Baseline:** Community Solid Server 7.1.9.
**Depends on / REUSES (consumed via imports, NOT modified):** DBX-07 `odrl/terms` + `odrl/TermSupport`
(`checkTermSupport`/`isProfileSupported` — the fail-closed term gate + the duty/source/strategy IRIs);
DBX-16 `proof/Canonicalization` (`canonicalDigest`/`digestOfBytes` — the bundle content digest + fulfilment
evidence digests, **no new crypto**); DBX-13 `credential/Es256` (`decodeCompactJws`/`verifyCompactJws` — the
bundle signature) + DBX-16 `proof/IssuerTrustStore` (trusted program key resolution, key-history aware);
DBX-18 `receipt/AcceptanceReceiptSigner` (the `issueReceipt` duty); DBX-19 `evidence/*`
(`HashChainedEvidenceLedger`/`buildAuditRecord` — every duty transition is appended evidence); DBX-17
`storage/AppendOnlyTombstone` (`TombstoneRegistry` — the `tombstone` duty); DBX-12
`context/DataboxRequestContext` (the verified actor bound into each transition); DBX-14
`authorization/DataboxAuthorizationInput` (`OdrlPreconditionDecision` — the C4 conjunct this feeds).

## 1. Files (all NEW, under `src/databox/policy/**` + `test/unit/databox/policy/**`)

| File | Purpose |
|---|---|
| `PolicyBundle.ts` | Compiled-bundle value types + `EVALUATOR_VERSION`, `SOURCE_RANK_ORDER`, `computeBundleDigest` (structured canonical digest over the load-bearing fields, excludes attestation + the bound digest), `isBundleSubstituted` (T-25). |
| `BundleAdmission.ts` | `admitBundle(jws, trust)` (ADR-0015): verify signed envelope → trusted-key signature → synthetic label → supported profile → **attested** attestation present → digest bindings present → evaluator version → content-digest match. `AdmissionReason` reason codes. Every failure ⇒ `admitted:false`, fail closed. |
| `PolicyRegistry.ts` | Immutable append-only registry (ADR-0014). `register` (admitted-only + anti-substitution re-check), `versionsFor`, `resolve(assetClass, atTime)` — deterministic effective-time selection; `no-governing-version`/`ambiguous-version`/`malformed-time`/`malformed-interval` fail closed. |
| `ConstraintEvaluation.ts` | `evaluateConstraint`/`evaluateConstraints` → `satisfied`/`unsatisfied`/`indeterminate`; a missing value or an operator this build does not compute is `indeterminate` (⇒ ambiguous ⇒ fail closed). |
| `ComplexityGuard.ts` | `checkComplexity`/`exceedsComplexity` + `DEFAULT_COMPLEXITY_BUDGET` — caps rules/constraints/duties (T-57). |
| `ConflictStrategy.ts` | `resolveConflict` — the ONE deterministic ADR-0013 strategy: stage 1 external invariants → stage 2 source ordering → stage 3 same-rank ODRL operand (more-protective-wins; unsupported ⇒ fail closed) → fail-closed default. |
| `PolicyEvaluator.ts` | `PolicyEvaluator.evaluate(request)` — resolve version → anti-substitution → complexity → term support → constraint match → conflict compose. Total (never throws); every non-permit is a reasoned fail-closed/deny with the version binding. |
| `DutyStateMachine.ts` | `DUTY_STATES`, `isFulfilled` (ONLY `accepted`/`acknowledged`), `canTransition`/`assertTransition` — the ADR-0012 transition table. |
| `DutyEngine.ts` | `DutyEngine` — durable duty instances (stable idempotency key), `activate`/`run`/`retry`/`remedy`/`supersede`/`acknowledge`; every transition appends a `duty-transition` record to the DBX-19 ledger; idempotent replays. Owns the authoritative "Duty state". |
| `DutyHandlers.ts` | `issueReceiptHandler` (DBX-18), `signalHolderHandler` (queued), `retainEvidenceHandler`, `tombstoneHandler` (DBX-17), `stageForReviewHandler`; `RetentionRegistry`/`ReviewQueue` reference stores. |
| `PolicyEngine.ts` | **Entry file** re-exporting all ten siblings + `toPreconditionDecision` (EvaluationResult → C4 `OdrlPreconditionDecision`). |
| `test/unit/databox/policy/*.test.ts` (11 suites) + `PolicyTestSupport.ts` | 87 tests; 100% coverage. |

`src/databox/index.ts` was **NOT** edited (forbidden). See §5 for the barrel line to add.

## 2. Design

**Bundle admission (ADR-0015, T-25).** A bundle enters ONLY through `admitBundle`, a total ordered gate:
malformed envelope / untrusted-or-bad signature → `bad-signature`; missing issuer/kid/issuedAt →
`malformed-bundle`; then `not-synthetic` → `unsupported-profile` → `unattested` (no attestation) → `proposed`
(status≠attested) → `missing-digest` → `incompatible-evaluator` → `failed-digest`. The signature is verified
with the reused hardened `verifyCompactJws` against a key resolved from the program `IssuerTrustStore` (never
the JWS header). The runtime reads only `attestation.status` and the digest/version bindings — it interprets
**no law** (see §4).

**Immutable registry + effective-time (ADR-0014).** `resolve(class, t)` selects the single version whose
`[effectiveFrom, effectiveUntil)` contains `t` and whose classes include `class`; zero matches, >1 match
(overlap), or a malformed time/interval all fail closed. History is append-only (`versionsFor` returns a
copy); a substituted bundle cannot be registered (digest re-check).

**Deterministic conflict strategy (ADR-0013).** `resolveConflict`: (1) external non-relaxable invariants
(tenant-isolation / cross-program / assurance) deny first and are **code-level gates outside the corpus** — a
policy cannot express or relax them; (2) WebCivics source ordering `mandatoryBaseline > guardianPolicy >
userPreference`, a prohibition at the top rank wins; (3) a genuine same-rank permission↔prohibition conflict
resolves to the **more protective** result (`prohibited`) — an unsupported declared conflict-strategy fails
closed (`unsupported-policy`); (4) fail-closed default (`no-applicable-rule`/`ambiguous-rank`). Two-plane
separation is structural: the evaluator only ever emits `permitted` (carrying duties) or a deny — a
permission never broadens reachability; C4 (DBX-14) consumes it as a narrow-only conjunct.

**Evaluator flow.** `resolve → isBundleSubstituted (T-25) → exceedsComplexity (T-57) → request-action support
→ per-rule term support → constraint match (indeterminate ⇒ ambiguous ⇒ fail closed) → resolveConflict`.
Unsupported/ambiguous always denies with a specific audit reason and the `{policyVersion, policyDigest}`
binding.

**Duty state machine + engine (ADR-0012, T-50).** States are pairwise distinct; ONLY `accepted`/
`acknowledged` are fulfilled — `queued`/`attempted`/`failed` are NOT. `activate` creates a `queued` instance
(idempotent per stable `dutyId`); `run(handler)` drives `queued/failed → attempted → accepted|failed`,
appending each transition to the DBX-19 hash-chained ledger with the actor bound from the **verified context**
(never headers), the duty action/state in `PolicyEvaluation`, and the receipt digest bound when accepted.
A `queued` handler outcome (signalHolder — delivery is DBX-21) leaves the duty **queued**, so it is never
reported fulfilled. Retries are idempotent: a second `run` on an already-fulfilled instance returns the
ORIGINAL without re-invoking the handler or appending a duplicate transition. `acknowledge` is permitted only
for a `dbx:acknowledge` duty from `accepted`.

**Handlers reuse, never re-implement.** `issueReceipt`→DBX-18 signer (no receipt before durable commit;
`failed` if refused); `signalHolder`→queued signal only (DBX-21 delivers); `retainEvidence`/`stageForReview`
→reference registries; `tombstone`→DBX-17 `TombstoneRegistry`.

## 3. How it fails closed

- **unsupported term** — `checkTermSupport` (DBX-07) on the requested action and every matching rule's
  source/operand/operator/duty; any unsupported ⇒ `unsupported-term` deny.
- **ambiguous** — an indeterminate constraint ⇒ `ambiguous-constraint`; an unknown source rank ⇒
  `ambiguous-rank`; an unsupported same-rank conflict strategy ⇒ `unsupported-policy`.
- **unattested / proposed / failed-digest** — bundle not admitted (ADR-0015); dependent evaluation has no
  governing version and denies.
- **complexity** — a crafted bundle exceeding the rule/constraint/duty caps ⇒ `complexity-exceeded` before
  any evaluation (T-57).
- **duty** — `queued`/`attempted`/`failed` are never fulfilled; missing/failed evidence is never
  fulfilled-by-default; an illegal transition throws.

## 4. How it does NOT interpret law (ADR-0015)

The evaluator consumes a signed, human-attested compiled bundle and applies its **results**. It never decides
commencement/repeal/transition/jurisdiction: `effectiveInterval`, `updateEffect`, `attestation`,
`jurisdiction` are copied/consumed verbatim, and `admitBundle` inspects only `attestation.status` +
digests/version. Every bundle here is machine-labelled `syntheticFixture:true` (a non-synthetic bundle is
inadmissible in this build) so no output can assert legal compliance.

## 5. Barrel symbols (NO edit to `src/databox/index.ts`)

`PolicyEngine.ts` re-exports all ten siblings, so ONE line — **`export * from './policy/PolicyEngine'`** —
added to `src/databox/index.ts` by whoever DI-wires C12 will cover the whole plane (mirrors the
DBX-18/DBX-19 pattern; the central barrel was deliberately not edited). Public symbols: `EVALUATOR_VERSION`,
`SOURCE_RANK_ORDER`, `PolicyConstraint`, `PolicyRule`, `PolicyAttestation`, `EffectiveInterval`,
`CompiledPolicyBundle`, `computeBundleDigest`, `isBundleSubstituted`; `AdmissionReason`, `AdmissionResult`,
`admitBundle`; `ResolutionReason`, `GoverningResolution`, `PolicyRegistry`; `ConstraintResult`,
`OperandValues`, `evaluateConstraint`, `evaluateConstraints`; `ComplexityBudget`,
`DEFAULT_COMPLEXITY_BUDGET`, `ComplexityReason`, `checkComplexity`, `exceedsComplexity`; `PolicyOutcome`,
`NonRelaxableInvariants`, `CandidateRule`, `ConflictInput`, `ConflictResolution`, `resolveConflict`;
`EvaluationRequest`, `EvaluationResult`, `PolicyEvaluator`; `DUTY_STATES`, `DutyState`, `isFulfilled`,
`canTransition`, `assertTransition`; `DutyInstance`, `HandlerOutcome`, `DutyHandler`, `DutyRunResult`,
`DutyEngineContext`, `DutyActivation`, `DutyEngine`; `RetentionEntry`, `RetentionRegistry`, `ReviewItem`,
`ReviewQueue`, `issueReceiptHandler`, `signalHolderHandler`, `retainEvidenceHandler`, `tombstoneHandler`,
`stageForReviewHandler`; `toPreconditionDecision`.

**`.componentsignore` additions:** NONE. `npm run build:components` exits 0 with no
"Could not understand parameter type" error for any `src/databox/policy/` class.

## 6. Threats mitigated (DBX-03)

- **T-25** (policy substitution): `computeBundleDigest`/`isBundleSubstituted` bind evaluation to the pinned
  content digest; a tampered rule set fails admission (`failed-digest`) and, defence-in-depth, registry
  registration and the evaluator (`policy-substitution`). The signature is checked against trusted keys, not
  the header. Tested end to end.
- **T-50** (duty unfulfilled-but-marked-fulfilled / unevaluated): only `accepted`/`acknowledged` are
  fulfilled; `signalHolder` stays `queued`; every transition is durable evidence; missing evidence is never
  fulfilled-by-default. Tested (queued-not-fulfilled, idempotent-no-double-act).
- **T-57** (algorithmic-complexity DoS on the policy path): `ComplexityGuard` caps + fails closed before
  evaluation; the guard only counts. Tested.

## 7. Residual HUMAN + independent-Hard policy review gate (RECORDED — OPEN)

ADR-0013 §Residual requires the **non-relaxable invariant set + fail-closed composition** to be signed off by
the **security reviewer** before a production evaluator ships; ADR-0015 marks the **legal-compliance profile
Blocked** pending (1) an ingested content-digested corpus manifest and (2) an authorized human attestation of
the WebCivics/legal→ODRL mapping. This code fixes the *mechanism* (deterministic composition, fail-closed
admission, durable duty machine, T-25/50/57 guards) on **synthetic, labelled** bundles only. A named
independent-Hard reviewer + human security/legal reviewer MUST still confirm, before any preset/compliance
build: (a) stage-1 invariants are truly sourced from C4/C5/C3 code gates and cannot be spoofed by a
request-controlled value; (b) the reason-code catalogue leaks no protected fact (align ADR-0023); (c) the
complexity caps are tuned per deployment (T-57 §Notes); (d) no build labels a synthetic fixture as a
compliance claim; (e) the attestation regime is wired so no `proposed`/unattested bundle can ever be
admitted. **Gate status: OPEN.**

## 8. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) |
| `npx jest test/unit/databox/policy --coverage --collectCoverageFrom='src/databox/policy/**/*.ts' --coverageReporters=text` | **PASS** — 11 suites, **96 tests** (round-2); **All files 100%** stmts/branch/funcs/lines |
| `npx eslint src/databox/policy test/unit/databox/policy --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice) |
| `npm run build:components` | **PASS** (exit 0; no policy-class parameter errors; no `.componentsignore` additions) |
| `npx jest test/unit/databox/FailClosedStubs` | **PASS** — 7 tests (still green) |

Per constraint 4/5: did NOT run `git add`/`commit` or `npm ci`. Did not edit `src/databox/index.ts` or any
odrl/evidence/receipt/proof/storage file — all consumed via imports.

## 9. Round-2 independent-security-review fixes (all applied, each property-tested)

The review CONFIRMED the two headline properties (unattested/substituted policy cannot be admitted; a
queued duty cannot be marked fulfilled) but found a HIGH fail-open plus MED/LOW issues. All fixed in
`src/databox/policy/`; each fixed property now has an asserting test (they were line-covered but
property-UNtested). Test count 87 → **96**, coverage remains **100%**.

| # | Sev | Fix | Test |
|---|---|---|---|
| **H1** | HIGH | **Conflict resolver no longer fails OPEN on an unknown/typo ruleType.** `ConflictStrategy.resolveConflict` terminal branch now requires `hasPermission===true`, else `fail-closed:no-applicable-rule` (a candidate whose ruleType is neither `permission` nor `prohibition` previously fell through to `permitted` with NO valid permission). Defence-in-depth: `PolicyEvaluator.evaluateRules` rejects any matching rule with an invalid ruleType up front (`unsupported-rule-type`). | ConflictStrategy "HIGH-1: fails CLOSED … neither permit nor prohibit"; PolicyEvaluator "HIGH-1: … invalid ruleType". |
| **M1** | MED | **`admitBundle` is now TOTAL.** The digest computation (dereferences `effectiveInterval`, spreads `affectedAssetClasses`, maps `rules`) is wrapped so a signature-valid but structurally-malformed body fails closed as `malformed-bundle` instead of throwing an uncaught `TypeError` out of the admission contract. | BundleAdmission "MED-1: is TOTAL — … never throws". |
| **M2** | MED | **Trusted decision clock.** `EvaluationRequest.atTime` renamed to **`serverDecisionTime`** with a doc contract that C4 MUST supply a server clock, never a request-echoed value — closing temporal version-substitution (picking an earlier, more-permissive attested version by controlling the time). | PolicyEvaluator "MED-2: the TRUSTED serverDecisionTime … selects the governing version". |
| **M3** | MED | **Per-`dutyId` concurrency guard.** `DutyEngine.run` serializes through an in-flight promise chain per `dutyId` (plus a re-read of the authoritative state immediately before each transition), so two concurrent runs invoke the handler and append `accepted` EXACTLY once (no double receipt / double stage / two accepted records). Stable-key idempotency previously only guarded replays *after* fulfilment. | DutyEngine "MED-3: two concurrent runs … EXACTLY once". |
| **L1** | LOW | **Deep-freeze** the admitted bundle (`deepFreeze`), so `rules`/nested objects/`effectiveInterval` cannot be mutated after admission and `versionsFor` cannot hand out mutable refs. | BundleAdmission "LOW-1: deep-freezes …". |
| **L2** | LOW | **Validate `evidenceDigest` format.** `DutyEngine` rejects a fulfilment `evidenceDigest` (from a handler outcome or `acknowledge`) that is not a `urn:sha256:<64 hex>` before recording it on the instance (`assertEvidenceDigest`). | DutyEngine "LOW-2: fails closed on … non-urn evidence digest" (run + acknowledge). |
| **L3** | LOW | **Sanitize caller reason** in the structured `reasonCode` (`safeReason` constrains to `[\w.:-]`, caps length) for `remedy`/`supersede`, so a caller reason is a stable non-injectable token. | DutyEngine "LOW-3: sanitizes a caller reason …". |
| **M4** | — | **Left as the documented OPEN residual** (§7): `request.invariants` are trusted from the caller — stage-1 is non-relaxable *by the corpus* but relaxable by a spoofed request. Typed + doc-noted that C4/C5/C3 MUST populate `invariants` from code gates, never request-echoed values. | (gate — see §7). |

The residual **human + independent-Hard + legal-policy** review gate (§7) remains **OPEN**: this round fixes
the mechanism; the trusted-source contracts for `serverDecisionTime` and `invariants` (M2/M4) and the
legal-compliance profile still require the named reviewers before any preset/compliance build.
