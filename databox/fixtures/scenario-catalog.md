# DBX-08 — Synthetic Loyalty-Program Scenario Catalog

**Prompt:** DBX-08 — Synthetic loyalty-program profile. **Status:** complete. **Agent level:** Medium.
**Depends on:** DBX-06 (`loadInstitutionProfile`), DBX-07 (`dbx:` ODRL profile + `checkTermSupport`),
HD-14/HD-15/HD-16 (record set, submission return path, two isolated synthetic programs).

Everything here is **synthetic** (`synthetic: true` / `syntheticFixture: true`). The program is a fictional
**"MegaMart Rewards"** loyalty scheme — **not** Woolworths, Coles, or any real organisation, and no real
customer data. All keys, ids, digests and signatures are clearly-fake `*_syn_*` / `SYNTHETIC-*` placeholders.

## 1. Files

| File | Role |
|---|---|
| `loyalty-institution-profile.json` | The complete DBX-06 `InstitutionProfile` instance (validates via `loadInstitutionProfile`). |
| `records/digital-receipt.json` | Deposit: receipt with **line items, product info, allergens, dietary flags, rewards, warranty ref**. |
| `records/warranty-record.json` | Deposit: warranty coverage record (high assurance). |
| `records/product-recall.json` | Deposit: product recall notice (low assurance, public-safety). |
| `records/rewards-statement.json` | Deposit: loyalty points statement (low assurance). |
| `records/review-disposition.json` | Deposit: staff review disposition returned through the Databox (HD-15). |
| `submissions/correction-request.json` | Consumer submission: correction request. |
| `submissions/warranty-claim.json` | Consumer submission: warranty claim. |
| `submissions/dietary-preference.json` | Consumer submission: dietary / allergen warning preference. |
| `policies/records-agreement.jsonld` | ODRL agreement for deposits (reuses DBX-07 `dbx:` profile + terms). |
| `policies/submission-agreement.jsonld` | ODRL agreement for submissions (duties + consequence chain). |
| `policies/invalid-deprecated-notifyholder.jsonld` | NEGATIVE ODRL: deprecated `dbx:notifyHolder` → fail closed. |
| `policies/invalid-unknown-action.jsonld` | NEGATIVE ODRL: unknown `dbx:exfiltrate` → fail closed. |
| `exchange/committed-events.json` | CursorFeed (C15) page — opaque exactly-once recovery events. |
| `exchange/cross-program-deposit-rejected.json` | NEGATIVE isolation: cross-tenant deposit must fail closed. |
| `negative/neg-*.json` (12) | Full profiles, each with ONE seeded fail-closed violation. |
| `negative-cases.json` | Manifest: each negative file → its expected error code. |

Test that exercises all of this: `test/unit/databox/fixtures/LoyaltyFixtures.test.ts` (29 tests).

## 2. Record & submission classes (loyalty concepts → assurance)

| Class | Kind | Assurance | Existence | Concept |
|---|---|---|---|---|
| `rc-receipt` | record | **high** (idProofing 2 + authStrength 2 + freshness 1) | visible | Digital receipt + line items + product/allergen info |
| `rc-warranty` | record | **high** (idProofing 2 + authStrength 2) | visible | Warranty record |
| `rc-disposition` | record | **high** (idProofing 2 + authStrength 2 + stepUp 1) | **suppressed** | Review disposition / correction outcome |
| `rc-product-info` | record | **low** (idProofing 1) | visible | Product information & allergens |
| `rc-recall` | record | **low** (idProofing 1) | visible | Product recall notice |
| `rc-rewards` | record | **low** (idProofing 1 + authStrength 1) | visible | Rewards / points statement |
| `sc-correction` | submission | low (idProofing 1) | — | Correction request |
| `sc-warranty-claim` | submission | high-ish (idProofing 2 + authStrength 1) | — | Warranty claim |
| `sc-dietary-pref` | submission | low (idProofing 1) | — | Dietary / allergen warning preference |

Every minimum is **satisfiable** against the profile's `assuranceMappings` (idProofing≤3, authStrength≤3,
freshness≤2, stepUp≤1 available); the DBX-06 validator rejects any unsatisfiable requirement.

## 3. Positive scenarios exercised

- **P-1 Deposit exchange (HD-12/HD-14).** Each record fixture carries an `idempotencyKey`
  (`org/program/system/type/event-id`), an opaque `relationshipId`/`box`, and an `acceptanceReceipt` whose
  `policyDigest` equals the profile's `compiledPolicy.compiledPolicyDigest` (ADR-0019 receipt binding).
- **P-2 Submission return path (HD-15).** Consumer submissions target the append-only `/submissions/`
  container; the `review-disposition` record is the staff-appended disposition returned via the Databox.
- **P-3 ODRL policy (DBX-07).** Both agreements reference the supported profile
  `https://w3id.org/solid-databox/odrl-profile/v1` and use **only** enumerated terms — actions (`read`,
  `use`, `distribute`, `dbx:deposit`, `dbx:submit`), duties (`dbx:makeAvailable`, `dbx:issueReceipt`,
  `dbx:retainEvidence`, `dbx:stageForReview`, `dbx:recordDisposition`, the three correction duties,
  `dbx:makeRecordKnown`, `dbx:provideAccessRoute`, `dbx:notifyPriorRecipient`, `dbx:provideComplaintRoute`),
  left operands (`dbx:declaredPurpose`, `dbx:minimumAssurance`, `dbx:recordClass`, `recipient`), right
  operands (`dbx:personalRecordkeeping`, `dbx:otherProgram`) and conflict `dbx:prohibitOverrides`.
- **P-4 Recovery feed (C15).** `exchange/committed-events.json` is an opaque, exactly-once cursor page with
  no protected content (IF-08/IF-09).
- **P-5 Retention / append-only.** Every record class has a retention rule using `tombstone` / `supersede` /
  `crypto-erase` only (no `hard-delete`; ADR-0018).

## 4. Isolation mechanisms exercised (HD-16 / invariants 1 & 2)

- **I-1 Program binding.** `tenancy.tokenAudience` host equals the program origin host; the profile is one
  tenant (`prog-megamart-rewards-loyalty`).
- **I-2 Opaque, PII-free identifiers.** Records/submissions carry only `rel_syn_*` / `bx_syn_*` / `res_syn_*`
  tokens — no customer name/email/id anywhere downstream (invariant 2, CR-BRG-05).
- **I-3 Cross-program deny.** `exchange/cross-program-deposit-rejected.json` addresses a **different**
  synthetic program's origin/audience/relationship; it must fail closed with a non-leaking `tenant-mismatch`
  (CR-SRV-02 / CR-BRG-01). Its foreign host ≠ the home origin host.
- **I-4 No cross-program disclosure (ODRL).** The deposit agreement prohibits `distribute` to
  `recipient isA dbx:otherProgram`.

## 5. Expected NEGATIVE cases (must fail as expected)

Each `negative/neg-*.json` is the valid profile with exactly ONE seeded violation, so the reported code is
unambiguously attributable. `loadInstitutionProfile` throws `BadRequestHttpError` for every one.

| File | Seeded change | Expected code |
|---|---|---|
| `neg-unsatisfiable-assurance.json` | `rc-receipt` requires idProofing 5 | `unsatisfiable-assurance` |
| `neg-destructive-retention.json` | receipt retention `hard-delete` | `destructive-retention` |
| `neg-blocked-compliance-claim.json` | `legalComplianceClaimed: true` | `blocked-compliance-claim` |
| `neg-blocked-provider-blind.json` | `applicationLevelEncryption: required-provider-blind` | `blocked-provider-blind` |
| `neg-unattested-policy.json` | `attestationStatus: proposed` | `unattested-policy` |
| `neg-audience-not-program-bound.json` | foreign `tokenAudience` host | `audience-not-program-bound` |
| `neg-unknown-field.json` | extra top-level `backdoorOverride` | `unknown-field` |
| `neg-corpus-digest-mismatch.json` | corpus digest ≠ manifest digest | `corpus-digest-mismatch` |
| `neg-shared-platform-key.json` | at-rest required, no per-tenant keys | `shared-platform-key` |
| `neg-unauthorized-retroactive.json` | `authorized-retroactive` without flag | `unauthorized-retroactive` |
| `neg-dangling-purpose.json` | record references missing purpose | `dangling-ref` |
| `neg-uncovered-record-class.json` | drop `rc-disposition` retention | `uncovered-record-class` |
| `policies/invalid-deprecated-notifyholder.jsonld` | `dbx:notifyHolder` action | `deprecated-term` (DBX-07) |
| `policies/invalid-unknown-action.jsonld` | `dbx:exfiltrate` action | `unsupported-term` (DBX-07) |

The three **Blocked** items (`blocked-compliance-claim`, `blocked-provider-blind`, `unattested-policy`) are
**referenced and rejected**, never resolved (ADR-0015 / ADR-0021 remain Blocked; CR-DEP-06 / CR-PRV-08).
