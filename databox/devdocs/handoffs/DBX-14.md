# Handoff — DBX-14

**Prompt:** DBX-14 — Composed authorization engine (component C4, DBX-04 §2; ADR-0003).
**Status:** complete (tsc clean, eslint clean, **100% coverage** on every `src/databox/authorization/**/*.ts`, 56 tests; round-2 hardened, see §7b).
**Agent level:** Hard — REAL security-critical code. **THE authorization chokepoint.**
**Baseline:** Community Solid Server 7.1.9.
**Depends on:** DBX-11 (`TenantContext` — first conjunct + token-audience binding), DBX-12
(`DataboxRequestContext` + assurance dimensions), DBX-13 (relationship/credential status result), DBX-07
(`checkTermSupport`/ODRL profile — consumed by DBX-20, the evaluator behind the ODRL conjunct), DBX-06
(`AssuranceRequirement`/`ASSURANCE_DIMENSIONS`).
**Decisions honoured:** ADR-0003 (WAC baseline, authorization-system-neutral composition, narrow-never-broaden,
WAC discards client/issuer so Databox re-carries them, the conjunction), ADR-0010 (per-dimension assurance +
record-class minimums, unmapped→fail closed), ADR-0012/0013 (ODRL prohibition/precedence, unsupported term
fails closed), ADR-0018 (append-only precondition for EVERY actor incl. owner/admin).

> **RESIDUAL INDEPENDENT-HARD + HUMAN ADVERSARIAL REVIEW GATE (open — this handoff does NOT clear it):
> DBX-26.** ADR-0003 §Residual names C4 as the primary authorization chokepoint and requires an independent
> Hard reviewer to confirm **no layer can broaden a denial**. Before this is wired into any preset, that
> reviewer + a human security reviewer MUST confirm: (a) narrow-never-broaden holds at the **pipeline** level
> under the real `UnionPermissionReader`/`PermissionBasedAuthorizer` (here proven at the module level — see
> §4); (b) the per-request input **resolver** (the wiring seam, §6) actually threads the deep-frozen C5/C3/C13
> facts and cannot be spoofed by request headers/origin (DBX-11 §7 — origin is attacker-controllable); (c) the
> safe-response mapper is invoked with the **POST-narrow composed** Read observability and the class
> `existenceVisibility` (round-2 M2) so existence-hiding and step-up compose correctly at the HTTP surface
> (timing/parity is an integration probe, AT-01/IT-01); (d) the deny event actually reaches the C13 ledger
> with the reason code and no protected fact.

## 1. Files created / changed (within permitted DBX-14 paths only)

| File | Purpose |
|---|---|
| `src/databox/authorization/AuthorizationReasonCodes.ts` (**new**) | `DATABOX_DENIAL_CODES`, `DATABOX_CONJUNCTS`, `DataboxConjunct`, `StepUpChallenge`, `DataboxAuthorizationDecision` — the structured, audit-safe reason model (no protected content). |
| `src/databox/authorization/DataboxAuthorizationInput.ts` (**new**) | Input contract: `RelationshipStatusSnapshot`, `DelegationDecision`, `ImmutableOperationClassification`, `OdrlPreconditionDecision`, `DataboxAuthorizationInput`. Consumes DBX-11/12/13/06 types by import; never re-derives them. |
| `src/databox/authorization/ComposedAuthorizationEngine.ts` (**new**) | `evaluateDataboxAuthorization(input)` — the pure, total, deterministic conjunction. The heart. |
| `src/databox/authorization/ComposedDataboxPermissionReader.ts` (**new**) | `ComposedDataboxPermissionReader` (CSS `PermissionReader` composing over WAC, narrowing only) + `DataboxAuthorizationInputResolver`, `DataboxPolicyInputs`, `DataboxDecisionSink`, `DataboxDecisionEvent`. |
| `src/databox/authorization/SafeStepUpResponse.ts` (**new**) | `toSafeAuthorizationError(decision, ctx)` + `STEP_UP_ERROR_CODE`, `SafeResponseContext` — the non-leaking 404/403+step-up/401 surface. |
| `src/databox/authorization/DataboxAuthorizer.ts` (**extended**) | **Retained** `ComposedDataboxAuthorizer` marker + `DenyAllDataboxPermissionReader` stub (unchanged behaviour, still referenced by `FailClosedStubs.test.ts`). Added five `export *` re-exports so the barrel covers the new modules (see §5). |
| `test/unit/databox/authorization/*.test.ts` (**new**, 4 suites) | `ComposedAuthorizationEngine` (truth table), `ComposedDataboxPermissionReader` (narrowing + fail-closed + sink), `SafeStepUpResponse` (surface), `DataboxAuthorizer` (retained stub + re-export). 56 tests. |

`src/databox/index.ts` was **NOT** edited (forbidden). No tenant/context/credential/odrl/provisioning dir was
modified — all consumed via imports.

## 2. The conjunction, precedence, reason codes, step-up

`evaluateDataboxAuthorization` applies the conjunction as an **ordered, first-decisive** sequence
(`requested` = the requested modes):

| # | Conjunct | Deny condition | Code | Denied modes |
|---|---|---|---|---|
| 1 | (fail-closed) | any conjunct wrapper **absent OR malformed** — shape-validated, not just present (round-2 H1/M1/L1) | `missing-input` | all |
| 2 | **tenant** | `resourcePath` not under `tenant.boxRoot` (binds WAC map to the tenant box) | `tenant-mismatch` | all |
| 3 | **token-audience** | `context.audience` absent OR `tenant.audience` absent OR **unequal** (DBX-11 hard conjunct; does NOT trust origin) | `token-audience-mismatch` | all |
| 4 | **relationship** | `!relationship.active` (DBX-13) | `relationship-inactive` | all |
| 5 | **credential** | `relationship.credentialRevoked` (DBX-13) | `credential-revoked` | all |
| 6 | **assurance** | first ADR-0010 dimension whose level `< class minimum` (absent assurance = `0`) | `assurance-insufficient` **+ step-up** | all |
| 7 | **delegation** | delegation *claim* present but grant absent (`missing-input`) or invalid (T-47) | `delegation-invalid` | all |
| 8 | **odrl** | `outcome !== 'permitted'` (ALLOW-LIST, round-2 H1): `prohibited`→`odrl-prohibited`, any other/unknown/missing→`odrl-unsupported` (ADR-0013 fail closed) | `odrl-*` | all |
| 9 | **immutability** | `mutatesAcceptedResource` (ADR-0018) — replace/delete of an accepted resource | `immutable-operation` | **write/delete only** |

**Deterministic precedence.** Stages 1–8 are whole-request gates that short-circuit to a total deny (and
hide existence); stage 9 is evaluated **last** and is **partial** — it denies only `write`/`delete`, so a
legitimate reader of an accepted resource still reads it while **no actor, including owner/admin**, can
replace or delete it (ADR-0018 §4). A tenant/assurance failure is always returned before a later conjunct
(tested).

**Reason codes** (`DATABOX_DENIAL_CODES`) are `databox:*` strings naming only the failed conjunct — audit-safe
per ADR-0013 §Privacy (no resource content, existence, or customer id).

**Step-up** (`StepUpChallenge`) is issued only by the assurance conjunct and names only the failing assurance
dimension + required/current level — a fact about the actor's authentication, never the resource (IF-20).

**Safe surface** (`toSafeAuthorizationError`): existence-hiding takes precedence — a `suppressed` record class
OR **no POST-narrow (composed) Read → `404 NotFound`** (identical to a non-existent resource,
T-07/invariant 3/ADR-0023); only when composed Read survives AND `existenceVisibility==='visible'` →
**`403`** carrying the step-up challenge for an assurance gap (`STEP_UP_ERROR_CODE`), a `401` for an anonymous
request, else a plain `403`. Keying on the **composed** (post-narrow) Read — not the pre-narrow WAC one — is
the round-2 M2 fix: an assurance denial that removed Read can no longer surface a `403` that confirms the
resource exists.

## 3. How narrow-never-broaden is guaranteed

Two independent structural guarantees, both tested:
1. **The engine only ever emits `deniedModes`** (modes to force `false`). It never returns an allow for a
   mode; there is no code path that adds a `true`.
2. **The reader starts from a copy of the upstream WAC `PermissionSet` and only sets denied modes to
   `false`** (`ComposedDataboxPermissionReader.narrow`). For every mode, the narrowed result is `true` only if
   WAC was already `true`. Composing *over* the WAC result (not unioning a sibling that could emit `true`)
   makes "a broad WAC grant cannot bypass tenant/assurance/immutability/ODRL prohibition" a property of the
   code, not a convention. The reader implements `ComposedDataboxAuthorizer` (`narrowNeverBroaden: true`) and
   is authorization-system-neutral (`source: PermissionReader` — WAC now, ACP-swappable, ADR-0003).

## 4. Exhaustive truth-table coverage (56 tests, 100%)

- **Every conjunct** has an allow case and its denial case(s); the `||` audience branch is covered from all
  three sides (context-absent / tenant-absent / unequal); assurance covers fail (level & absent-context),
  the multi-requirement allow, and the `no-requirement-for-dimension` skip; delegation covers claim-without-
  grant, invalid, and valid; immutability covers write+delete denied, read left intact, and the empty-
  intersection allow.
- **Fail-closed on ANY missing input** — each of tenant/context/relationship/immutable/odrl absent, plus the
  resolver returning `undefined` (reader-level fail closed → every requested mode `false`).
- **A broad WAC permission CANNOT bypass**: `{read,write,append:true}` narrowed to all-`false` by a tenant
  mismatch; `{read:true}` narrowed to `false` by an ODRL prohibition; `{read,write:true}` → write forced
  `false` by append-only while read survives.
- **Denial does not reveal existence**: `toSafeAuthorizationError` returns the identical `404` whenever
  upstream Read is absent (assurance and non-assurance denials alike); the step-up message contains the
  dimension but not the resource id.
- **Retained stub regression**: `DenyAllDataboxPermissionReader` still returns an empty map + `narrowNeverBroaden`.

## 5. Barrel symbols (NO edit to `src/databox/index.ts`)

`src/databox/index.ts` line 14 already contains `export * from './authorization/DataboxAuthorizer'`.
`DataboxAuthorizer.ts` now re-exports its five new siblings, so every DBX-14 symbol propagates through the
existing barrel line transitively (mirrors the DBX-11 `TenantResolver` pattern; no central-owner edit).
New public symbols: `DATABOX_DENIAL_CODES`, `DATABOX_CONJUNCTS`, `DataboxDenialCode`, `DataboxConjunct`,
`StepUpChallenge`, `DataboxAuthorizationDecision`, `RelationshipStatusSnapshot`, `DelegationDecision`,
`ImmutableOperationClassification`, `OdrlPreconditionDecision`, `DataboxAuthorizationInput`,
`evaluateDataboxAuthorization`, `ComposedDataboxPermissionReader`, `DataboxAuthorizationInputResolver`,
`DataboxPolicyInputs`, `DataboxDecisionSink`, `DataboxDecisionEvent`, `toSafeAuthorizationError`,
`STEP_UP_ERROR_CODE`, `SafeResponseContext` (and retained `ComposedDataboxAuthorizer`,
`DenyAllDataboxPermissionReader`).

## 6. Threats mitigated (DBX-03 / CR-SRV)

- **T-12** (assurance): per-dimension gate against the class minimum; absent/unmapped = level 0 → deny +
  targeted step-up; a broad WAC grant cannot bypass it.
- **T-25** (policy substitution): an unsupported/ambiguous ODRL term fails closed (`odrl-unsupported`); a
  prohibition beats a broad permission (`odrl-prohibited`).
- **T-15** (confused deputy) / **DBX-11 origin note**: token-audience == tenant is a **hard conjunct**
  re-asserted here, not inherited from the attacker-controllable origin resolver.
- **T-01/T-54** (tenant): the target must live under the resolved tenant `boxRoot`; a WAC grant on another
  program's resource is forced `false`.
- **ADR-0018** (append-only): replace/delete of an accepted resource is denied for **every** actor
  (owner/admin included) as authorization-layer defence-in-depth over the C6 store decorator.
- **T-07 / invariant 3** (existence): denial without upstream Read → `404`, never a `403` that could confirm
  existence.

## 7. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx jest test/unit/databox/authorization --coverage --collectCoverageFrom='src/databox/authorization/**/*.ts' --coverageReporters=text` | **PASS** — 4 suites, **56 tests**; **All files 100%** stmts/branch/funcs/lines |
| `npx eslint src/databox/authorization test/unit/databox/authorization --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice) |
| `npx jest test/unit/databox/FailClosedStubs` (regression on retained stub) | **PASS** — 7 tests |

Per constraint 4: did NOT run `git add`/`commit`, `npm run build`, or `npm ci`.

## 7b. Round-2 independent security-review fixes (all applied, each with a test)

An independent security review CONFIRMED narrow-never-broaden holds structurally, but found a systemic
**fail-OPEN-on-malformed-input** weakness: the engine checked each conjunct wrapper was *present* then
trusted its *contents*, so a half-populated object (`{}`) passed the presence check and was trusted —
violating ADR-0003 "fail closed on any missing policy input". All findings fixed:

| # | Sev | Fix (in `src/databox/authorization/`) | Test |
|---|---|---|---|
| **H1** | HIGH | **ODRL conjunct inverted to an ALLOW-LIST.** `ComposedAuthorizationEngine` Stage 8 now denies **anything other than** `outcome==='permitted'`; `prohibited` → `odrl-prohibited`, every other/typo/future/missing outcome → `odrl-unsupported` (fail closed, T-25). The previous deny-list silently ALLOWED an unknown outcome (incl. `odrl={}`). | engine "fails closed (allow-list) on an unrecognised/typo/future ODRL outcome" |
| **M1** | MED | **Shape validation at Stage 1.** New `isWellFormedInput` type-guard validates the security-critical field of every conjunct wrapper (`tenant.boxRoot` string, `relationship.active`/`credentialRevoked` boolean, `immutable.mutatesAcceptedResource` boolean, `odrl.outcome` string) — any malformed wrapper fails closed uniformly with `missing-input`. `immutable={}` no longer skips append-only; `relationship` missing `credentialRevoked` no longer allows a revoked credential. | engine "fails closed on MALFORMED policy input" (6 cases) + reader "…malformed input (empty immutable object fails closed)" |
| **M2** | MED | **Step-up no longer discloses existence.** The reader keys the audit/response `composedReadObservable` on the **POST-narrow** composed Read (not the pre-narrow WAC Read), and `toSafeAuthorizationError` returns `403`+step-up ONLY when `composedReadObservable && existenceVisibility==='visible'`; otherwise `404`. An assurance denial (Read narrowed→false) and a `suppressed` record class both `404`. Added `existenceVisibility` (ADR-0023) to the input/event/response contract. | safe-response "…404 when composed Read false", "…404 for a SUPPRESSED record class even when a step-up would otherwise apply" |
| **M3** | MED | **Composition under-tested.** Added reader-level tests that a broad WAC grant cannot bypass **each** conjunct (tenant, token-audience, relationship, credential, assurance, delegation, ODRL) plus the malformed fail-closed case. | reader "a broad WAC permission cannot bypass ANY conjunct" (8 cases) |
| **L1** | LOW | `requiredAssurance` is now presence/shape-checked at Stage 1 (`Array.isArray`), so a malformed value fails closed cleanly instead of throwing a `TypeError` (the "never throws" contract holds). | engine "denies a non-array requiredAssurance instead of throwing" |
| **L2** | — | Left as-is by design: control on immutable resources is bound by the C6 store decorator (defence-in-depth layering); the clarifying comment is retained. | n/a |

Test count grew 41 → **56**; coverage remains **100%** on all five files.

## 8. What DBX-15+ and DBX-20 consume

- **DBX-15 (deposit/submission gateway, C7):** after C4 admits, the gateway validates class/legal-basis/
  purpose/policy-ref/idempotency/signature. It reuses `DataboxAuthorizationInput`/`evaluateDataboxAuthorization`
  as the admission gate and `toSafeAuthorizationError` for its non-leaking rejections; a deposit is a
  create/append (append-only leaves those intact), a replace/delete is denied by stage 9.
- **DBX-20 (ODRL evaluator + obligation engine, C12/IF-04):** owns the real ODRL evaluation that produces the
  `OdrlPreconditionDecision` this engine consumes (it consumes the *outcome*, not the policy). DBX-20 must map
  its deterministic result (ADR-0013 stages) into exactly `permitted` / `prohibited` / `fail-closed`, using
  DBX-07's `checkTermSupport` so an unsupported term becomes `fail-closed` (never silently permitted).
- **Wiring (out of DBX-14 scope):** the request pipeline must construct the `DataboxAuthorizationInputResolver`
  that pulls the deep-frozen C5 `TenantContext`, C3 `DataboxRequestContext`, the DBX-13 per-request status
  snapshot, the class `AssuranceRequirement[]` from the profile, the per-op delegation decision, the ADR-0018
  immutability classification, and the DBX-20 ODRL outcome off the request; union/replace the WAC reader with
  `ComposedDataboxPermissionReader` in `readers/default.json`; and invoke `toSafeAuthorizationError` in the
  error mapper with the **upstream WAC** Read observability. `TenantIsolationGuard.assertStillBound` still runs
  at the C6 store boundary (T-54).

## 9. Notes / limitations (honest)

- This is the C4 **mechanism**: a pure conjunction engine + a narrowing `PermissionReader` + a safe-response
  mapper. It does **not** wire itself into `AuthorizingHttpHandler`/`readers/default.json`, build the input
  resolver, or emit the C13 deny event — those are the wiring items flagged in the review gate (§ top) and §8.
- The ODRL, relationship/credential-status, delegation and immutability conjuncts consume **already-decided
  results** (`OdrlPreconditionDecision`, `RelationshipStatusSnapshot`, `DelegationDecision`,
  `ImmutableOperationClassification`) produced by DBX-20/DBX-13/C9/ADR-0018-C6 respectively. C4 re-asserts the
  tenant/audience binding itself (DBX-11 §7) but trusts those upstream *results*; the review gate must confirm
  each is sourced from its authoritative owner, not a request-controlled value.
- `readObservable` for the safe surface must be the **upstream WAC** Read grant; passing the narrowed value
  would collapse assurance step-ups into 404s. This is asserted in tests and flagged for the integration wiring.
