# Handoff — DBX-06

**Prompt:** DBX-06 — Institution / program profile schema
**Status:** complete (acceptance gate met: tsc clean, eslint clean, 100% coverage on all four metrics)
**Agent level:** Medium
**Date:** 2026-07-15
**Baseline:** Community Solid Server 7.1.9
**Depends on:** DBX-09 (scaffold), DBX-04 (C5/C9/C10/C11 profile inputs), architecture.md "Program profile";
ADR-0002/0005/0010/0014/0015/0016/0021/0023.

## 1. Files created (all within the permitted DBX-06 paths)

| File | Purpose |
|---|---|
| `src/databox/profile/InstitutionProfile.ts` | Versioned schema constant + TypeScript loader types + the closed value sets (enums as `as const` arrays) the validator enforces. |
| `src/databox/profile/InstitutionProfileSchema.ts` | The declarative, versioned **JSON Schema (draft-07)** artifact (`INSTITUTION_PROFILE_JSON_SCHEMA`), `additionalProperties:false` throughout; imports the enum arrays so schema and validator cannot drift. |
| `src/databox/profile/InstitutionProfileValidator.ts` | The runtime **validator** (`validateInstitutionProfile`) + a fail-closed **loader** (`loadInstitutionProfile`) that throws `BadRequestHttpError`. Enforces the cross-field/security invariants a structural schema can't. |
| `test/unit/databox/profile/InstitutionProfileValidator.test.ts` | 51 unit tests (100% branch/fn/line/stmt). |
| `test/unit/databox/profile/fixtures/valid-institution-profile.json` | The VALID example profile (synthetic, complete). |
| `test/unit/databox/profile/fixtures/invalid-institution-profile.json` | The INVALID example profile (batches ~14 seeded fail-closed violations + 1 warning). |

No other file was touched. `src/databox/index.ts` was **not** edited (see §3).

## 2. Schema shape (what the profile carries)

Top-level `InstitutionProfile` (schema version `dbx-institution-profile/1.0.0`, carried in `schemaVersion`):
`profileId`, `profileVersion`, `effectiveInterval{effectiveFrom,effectiveUntil?}` (ADR-0014), `synthetic`
(ADR-0015 synthetic-label), `program{principal,accountableParty}`, `processors[]` (chain + `readsPayload`
disclosure), `tenancy{deploymentModel,origin,tokenAudience}`, `crypto{signingSuite,signingKeyRef,
atRestEncryption{required,perTenantKeys},applicationLevelEncryption}`, `identityProviders[]`
(issuer + claim contract), `assuranceMappings[]` (ADR-0010 dimensions), `tokenBroker{adopted,brokerOrigin?,
tokenExchange?,senderConstraint?}`, `offlineGrantPolicy` (ADR-0009), `recordClasses[]` (+ per-dimension
minimum assurance, existenceVisibility), `submissionClasses[]`, `policies{templates[],conflictStrategy,
effectiveTimeBehavior,retroactiveAuthorized?}` (ADR-0013/0014), `compiledPolicy` (ADR-0015 input-interface
refs: compiled/corpus/profile digests + attestationId + evaluatorVersion + attestationStatus +
legalComplianceClaimed?), `legislativeCorpus{manifestDigest,entries[]}` (ADR-0015), `legalBases[]`,
`declaredPurposes[]`, `retention[]` (ADR-0018 deletion/tombstone), `systemsOfRecord[]` (ADR-0016),
`notifications{notificationFormat,receiptFormat}`, `redress{stepUpSupported,appealRoutes[],
existenceVisibilityDefault,correctionResponseDays?}` (ADR-0023).

**Fail-closed cross-field invariants the validator enforces (each has a negative test):**
- Unknown fields at any validated object level → **rejected** (`unknown-field`).
- Unknown schema version → rejected. Unknown assurance **dimension** / **enum** value → rejected.
- Record/submission minimum assurance that **no mapping can satisfy** → `unsatisfiable-assurance`.
- Token audience whose host ≠ program-origin host → `audience-not-program-bound` (ADR-0002). Non-https
  origin/audience/issuer/broker → `not-https`. Path-only tenancy → **warning** (`discouraged-topology`), not error.
- Dangling policy-template / legal-basis / purpose / record-class references → `dangling-ref`.
- `hard-delete` retention on an accepted class → `destructive-retention` (ADR-0018); a record class with no
  retention rule → `uncovered-record-class`.
- At-rest `required` without `perTenantKeys` → `shared-platform-key` (ADR-0021 §2).
- `authorized-retroactive` without `retroactiveAuthorized:true` → `unauthorized-retroactive` (ADR-0014).
- `compiledPolicy.corpusManifestDigest ≠ legislativeCorpus.manifestDigest` → `corpus-digest-mismatch`.
- Invalid effective interval (`effectiveUntil ≤ effectiveFrom`) → `invalid-interval`.

**Blocked items are REFERENCED, not resolved — the validator FAILS CLOSED on each (never invents a
Blocked decision):**
- ADR-0021 provider-blind: `applicationLevelEncryption:'required-provider-blind'` → `blocked-provider-blind`.
- ADR-0015 legal-compliance release gate: `legalComplianceClaimed:true` → `blocked-compliance-claim`;
  `attestationStatus:'proposed'` (un-attested bundle) → `unattested-policy`.
- ADR-0005 RFC 8693 wire semantics: `tokenBroker.tokenExchange` is accepted as a declared string only
  (provisional); no wire binding is asserted.

## 3. Symbols to add to the barrel (`src/databox/index.ts`) — DO CENTRALLY

Add a new section (keep alphabetical to satisfy lint):

```ts
// Institution/program profile (DBX-06)
export * from './profile/InstitutionProfile';
export * from './profile/InstitutionProfileSchema';
export * from './profile/InstitutionProfileValidator';
```

Public exports produced: `INSTITUTION_PROFILE_SCHEMA_VERSION`, the enum arrays (`DEPLOYMENT_MODELS`,
`ASSURANCE_DIMENSIONS`, `CONFLICT_STRATEGIES`, `EFFECTIVE_TIME_BEHAVIORS`, `ATTESTATION_STATUSES`,
`DELETION_MODES`, `APP_ENCRYPTION_MODES`, `SENDER_CONSTRAINTS`, `EXISTENCE_VISIBILITIES`) + their derived
types, the interfaces (`InstitutionProfile`, `AccountableParty`, `Processor`, `TrustedIssuer`,
`AssuranceMapping`, `AssuranceRequirement`, `RecordClass`, `SubmissionClass`, `PolicyTemplate`,
`PolicyConfig`, `CompiledPolicyRef`, `CorpusManifestEntry`, `LegislativeCorpusRef`, `LegalBasis`,
`DeclaredPurpose`, `RetentionRule`, `SystemOfRecord`, `NotificationConfig`, `CryptoConfig`, `TenancyConfig`,
`TokenBrokerConfig`, `OfflineGrantPolicy`, `RedressConfig`, `AppealRoute`), `INSTITUTION_PROFILE_JSON_SCHEMA`,
`ProfileIssue`, `ProfileValidationResult`, `validateInstitutionProfile`, `loadInstitutionProfile`.

(If any name collides with a DBX-07 export, prefer a re-export rename there; DBX-06 introduced no name from
the DBX-09 seam list.)

## 4. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0; no errors in DBX-06 files) |
| `npx jest test/unit/databox/profile --coverage --collectCoverageFrom='src/databox/profile/**/*.ts' --coverageReporters=text` | **PASS** — 1 suite, **51 tests**; **All files = 100%** stmts/branch/funcs/lines |
| `npx eslint src/databox/profile test/unit/databox/profile --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic deprecated option` notice) |

Coverage table (final):

```
File                            | % Stmts | % Branch | % Funcs | % Lines
InstitutionProfile.ts           |     100 |      100 |     100 |     100
InstitutionProfileSchema.ts     |     100 |      100 |     100 |     100
InstitutionProfileValidator.ts  |     100 |      100 |     100 |     100
```

## 5. What DBX-08 (synthetic loyalty profile) builds on this

- DBX-08 authors a **synthetic loyalty program profile** as a concrete `InstitutionProfile` instance
  (a JSON asset) that passes `validateInstitutionProfile` and MUST set `synthetic:true` (ADR-0015 — no
  build may assert a compliance claim; `legalComplianceClaimed` MUST be omitted/false).
- Reuse the fixtures here as the template: `test/unit/databox/profile/fixtures/valid-institution-profile.json`
  is a runnable, minimal loyalty-shaped example (Woolworths-style, all-synthetic labels).
- DBX-08 should call `loadInstitutionProfile(...)` at its provisioning seam so an invalid synthetic profile
  fails closed; the returned typed `InstitutionProfile` feeds the C5 tenant/provisioning inputs (its
  `policyTemplate`/`compiledPolicy` digests are the values later bound into `AcceptanceReceipt.policyDigest`
  from the DBX-09 evidence seam — reuse those field names, do not fork a parallel receipt type).
- DBX-08 must NOT redefine any DBX-06 type; extend by composition. Assurance minimums in a DBX-08 record
  class must resolve against that profile's own `assuranceMappings` (the validator rejects unsatisfiable
  combinations), and every record class must carry a retention rule.

## 6. Notes / limitations (honest)

- The runtime validator is **hand-rolled** (not ajv). Rationale: ajv is only a *transitive* dep (v6) in this
  checkout — not a direct/production dependency — and the required checks are cross-field/security-semantic
  (satisfiability, program-binding, digest-binding, Blocked-feature rejection) that a plain structural schema
  cannot express. The hand-rolled validator is fully branch-coverable, which the 100% gate requires. The
  draft-07 JSON Schema is still shipped as the declarative, tool-consumable artifact and shares the enum
  source of truth.
- Effective-interval comparison is lexical ISO-8601 string comparison (sufficient for same-format Z-times);
  a full temporal parse is out of scope for the schema layer and belongs to the evaluator (DBX-20).
- This is the schema + validator only; **wiring** into provisioning (C10/DBX-10) and the control-plane
  Components.js preset (Track B, ADR-0024) is not done here (out of DBX-06 scope, and the barrel edit is
  reserved for the central owner per the prompt's path constraints).
