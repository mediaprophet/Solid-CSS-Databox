# Handoff — DBX-08

**Prompt:** DBX-08 — Synthetic loyalty-program profile
**Status:** complete (acceptance gate met: profile validates via DBX-06 `loadInstitutionProfile`; every
negative case fails as expected; tsc/jest/eslint clean).
**Agent level:** Medium
**Date:** 2026-07-15
**Baseline:** Community Solid Server 7.1.9
**Depends on:** DBX-06 (InstitutionProfile schema + `loadInstitutionProfile`), DBX-07 (`dbx:` ODRL profile +
`checkTermSupport`), DBX-09 (Evidence/CursorFeed types), HD-14/HD-15/HD-16.

## 1. Approach

Pure **data fixtures** (`.json` / `.ttl`-style `.jsonld`) plus **one** test that loads them through the
existing DBX-06/DBX-07 code. **No `src/**/*.ts` was added**, so there is no new coverage-gated code (the
prompt's permitted-and-simpler path). Nothing outside the four allowed path roots was touched;
`src/databox/index.ts` was **not** edited.

## 2. Files created

Fixture data (`databox/fixtures/`, non-coverage-gated resources):

- `loyalty-institution-profile.json` — the complete synthetic `InstitutionProfile` (validates, 0 errors/warnings).
- `records/{digital-receipt,warranty-record,product-recall,rewards-statement,review-disposition}.json` — deposits.
- `submissions/{correction-request,warranty-claim,dietary-preference}.json` — consumer submissions.
- `policies/{records-agreement,submission-agreement}.jsonld` — ODRL agreements reusing the DBX-07 `dbx:` profile.
- `policies/{invalid-deprecated-notifyholder,invalid-unknown-action}.jsonld` — NEGATIVE ODRL (fail closed).
- `exchange/committed-events.json` — CursorFeed (C15) recovery page (opaque).
- `exchange/cross-program-deposit-rejected.json` — NEGATIVE tenant-isolation fixture.
- `negative/neg-*.json` (12) — full profiles, one seeded fail-closed violation each.
- `negative-cases.json` — manifest mapping each negative profile → expected error code.
- `scenario-catalog.md` — the scenario/policy/isolation catalog.

Test (`test/unit/databox/fixtures/`):

- `LoyaltyFixtures.test.ts` — 29 tests: profile validates + loads; records/submissions resolve to declared
  classes/purposes and bind the compiled-policy digest; ODRL agreements use only supported terms while the
  two negative agreements fail closed (`deprecated-term` / `unsupported-term` via `checkTermSupport`);
  isolation fixtures asserted; all 12 negative profiles fail with their expected code and
  `loadInstitutionProfile` throws `BadRequestHttpError`.

Handoff: `databox/handoffs/DBX-08.md` (this file).

## 3. Scenario-catalog summary

- **Loyalty concepts modelled:** digital receipts + line items, product information, allergens, dietary
  warning preferences, warranty, rewards, recalls, corrections, warranty claims, review dispositions.
- **Record classes:** low-assurance `rc-product-info` / `rc-recall` / `rc-rewards`; high-assurance
  `rc-receipt` / `rc-warranty` / `rc-disposition` (`rc-disposition` existence-suppressed). Submission
  classes: `sc-correction` / `sc-warranty-claim` / `sc-dietary-pref`. All assurance minima are satisfiable
  against the profile's `assuranceMappings`; every record class has a non-destructive retention rule.
- **Policies (DBX-07):** deposit + submission ODRL agreements reference
  `https://w3id.org/solid-databox/odrl-profile/v1` and use only enumerated actions/duties/operands +
  `dbx:prohibitOverrides`; the cross-program `distribute` prohibition enforces no-other-program disclosure.
- **Exchange:** idempotency keys (`org/program/system/type/event-id`), signed acceptance receipts binding
  the compiled-policy digest (ADR-0019), and an opaque exactly-once cursor feed page (C15).
- **Isolation (HD-16):** single program/tenant, program-bound audience, opaque PII-free `*_syn_*`
  identifiers, and a cross-program deposit that must fail closed (`tenant-mismatch`).
- **Negatives:** 12 profile-level fail-closed codes + 2 ODRL fail-closed reasons (full table in the catalog
  §5). The three **Blocked** features (legal-compliance claim, provider-blind encryption, un-attested bundle)
  are referenced and rejected — never resolved (ADR-0015/ADR-0021; CR-DEP-06/CR-PRV-08).

## 4. Barrel symbols

**None.** DBX-08 added no TypeScript source, so there is nothing to add to `src/databox/index.ts`. (The test
imports existing DBX-06/DBX-07 symbols: `loadInstitutionProfile`, `validateInstitutionProfile`,
`InstitutionProfile`, `checkTermSupport`, `isTermSupported`, `isProfileSupported`, `DBX_NAMESPACE`,
`ODRL_NAMESPACE`.)

## 5. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) |
| `npx jest test/unit/databox/fixtures` | **PASS** — 1 suite, **29 tests** |
| `npx jest test/unit/databox/fixtures --coverage --collectCoverageFrom='src/databox/fixtures/**/*.ts' --coverageReporters=text` | **PASS** — 29 tests; coverage table `All files 0/0` (no `src/databox/fixtures/*.ts` exists — no coverage-gated code was added). |
| `npx eslint test/unit/databox/fixtures --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice). |

Note: `npx eslint src/databox/fixtures ...` errors with "No files matching" because that directory
intentionally holds no TypeScript; the lint was run on the paths that exist (`test/unit/databox/fixtures`).

## 6. Confirmation

- The synthetic loyalty profile **VALIDATES** against the DBX-06 schema through `loadInstitutionProfile`
  (0 errors, 0 warnings) and carries `synthetic: true` with `legalComplianceClaimed: false`.
- Every required mechanism is exercised: low/high-assurance record classes, deposit + submission exchange,
  signed-receipt/idempotency binding, ODRL policy reuse, cursor-feed recovery, retention/append-only, and
  tenant isolation.
- **All negative cases fail as expected** (12 profile codes + 2 ODRL reasons); no Blocked decision is resolved.
- No real organisation's details are embedded (fictional "MegaMart Rewards"; all ids/keys/digests are
  clearly-fake synthetic placeholders).

## 7. Notes / limitations (honest)

- The ODRL negative fixtures are validated at the **term-support** layer (`checkTermSupport`, DBX-07), not by
  re-running SHACL here; DBX-07 already proved the SHACL fail-closed behaviour against equivalent fixtures.
- Record/submission/exchange JSON are illustrative **payload/envelope** shapes for the loyalty domain; they
  are not a normative wire schema (none exists yet). Where they touch typed seams they reuse DBX-09 field
  names (`AcceptanceReceipt.policyDigest`, `CommittedEvent.{cursor,tenantId,resourceRef,activity}`).
- Digests/signatures are placeholders (`urn:sha256:SYNTHETIC-*`, `SYNTHETIC-es256-*`); real digest binding is
  the evaluator/receipt engine's job (DBX-18/19/20).
