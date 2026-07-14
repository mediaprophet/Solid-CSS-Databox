# Handoff — DBX-07

**Prompt:** DBX-07 — Databox vocabulary and ODRL Profile
**Status:** complete (technical profile on synthetic policies; legal-compliance profile remains Blocked per ADR-0015)
**Agent level:** Hard
**Date:** 2026-07-15
**Depends on:** DBX-02 (ADR-0007/0012/0013/0014/0015/0025), DBX-04 (C12 evaluator, IF-04/IF-19), DBX-05 (conformance ids)

## 1. What was published

A machine-loadable Databox vocabulary (`dbx:`), a versioned ODRL Profile, a pinned offline
JSON-LD context, SHACL validation shapes (fail-closed), a loss-aware WebCivics→ODRL mapping
**shape** (attested content deferred per ADR-0015), synthetic examples, and a minimal, 100%-covered
TypeScript fail-closed term-support helper for the evaluator (C12, IF-04/IF-19).

Stable IRIs: namespace `https://w3id.org/solid-databox/ns#` (`dbx:`); profile
`https://w3id.org/solid-databox/odrl-profile/v1` (version `1.0.0`).

## 2. Files created

Vocabulary / RDF / SHACL / examples (non-coverage-gated resources):

- `databox/vocab/dbx-ns.ttl` — the vocabulary: classes, properties, actions, duty actions, left/right
  operands, duty states, conflict strategies, source ranks, update effects; each with an `rdfs:comment`
  giving deterministic processing semantics. (335 triples.)
- `databox/vocab/odrl-profile-v1.jsonld` — the `odrl:Profile` enumerating supported terms + reused ODRL Core.
- `databox/vocab/context/dbx-context.jsonld` — pinned, `@protected` JSON-LD context for offline verification (ADR-0025).
- `databox/vocab/shapes/dbx-policy-shapes.ttl` — SHACL shapes: policy/rule/duty/constraint/conflict/version/compiled-bundle. `sh:in` mirrors `terms.ts`; unknown term ⇒ `sh:Violation` ⇒ fail closed.
- `databox/vocab/shapes/webcivics-mapping-shape.ttl` — loss-aware WebCivics→ODRL mapping shape + Hohfeldian placeholder scheme + mandatory `dbx:mappingLoss` + attestation gate. No attested legal content.
- `databox/vocab/examples/retail-receipt-agreement.jsonld` — synthetic valid agreement (conforms).
- `databox/vocab/examples/submission-agreement.jsonld` — synthetic valid agreement w/ duties + consequence (conforms).
- `databox/vocab/examples/invalid-deprecated-notifyholder.jsonld` — NEGATIVE: `dbx:notifyHolder` ⇒ non-conforming.
- `databox/vocab/examples/policy-version.ttl` — synthetic version metadata + attested compiled bundle (conforms).
- `databox/vocab/examples/webcivics-mapping-proposed.ttl` — synthetic PROPOSED mapping (well-formed, inadmissible).
- `databox/vocab/examples/invalid-proposed-bundle.ttl` — NEGATIVE: unattested bundle ⇒ non-conforming (fail closed).

TypeScript (coverage-gated, 100%):

- `src/databox/odrl/terms.ts` — term IRI constants + profile-version constants + reused-ODRL and deprecated sets.
- `src/databox/odrl/TermSupport.ts` — the deterministic fail-closed `checkTermSupport` / `isTermSupported` / `isProfileSupported` helper.

Test:

- `test/unit/databox/odrl/TermSupport.test.ts` — 14 term-level conformance tests.

Handoff: `databox/handoffs/DBX-07.md` (this file).

## 3. Custom terms — IRI + processing semantics (summary)

All IRIs are `https://w3id.org/solid-databox/ns#<local>`. Full semantics live in `dbx-ns.ttl` `rdfs:comment`s.

**Actions** (ODRL Core `read`/`use`/`distribute`/`reproduce`/`delete` reused, not redefined):
- `deposit` — organisation create-into-append-only-store of a policy-bound record (≠ `distribute`).
- `submit` — consumer append of a purpose-specific submission; staged, never applied to source.

**Duty actions** (ADR-0012 fulfilment condition = the only state counting as `Accepted`):
- `makeAvailable` — resource + ordered event durably committed and GET-retrievable.
- `signalHolder` — signal accepted by channel (delivery/read NOT implied; opaque event id only).
- `deliverToInbox` — success from registered durable inbox (vocabulary-only until DBX-21).
- `acknowledge` — authenticated consumer ack durably recorded → separate `Acknowledged` state (DBX-21).
- `issueReceipt` — valid signed receipt durably committed; never before durable acceptance.
- `stageForReview` — submission durably present in governed review queue.
- `recordDisposition` — governed review outcome appended + linked.
- `makeRecordKnown` / `provideAccessRoute` — awareness + access route to a known record (ADR-0023).
- `acknowledgeCorrection` / `assessCorrection` / `correctOrAssociateStatement` — the three distinct correction duties (accept ≠ assess ≠ correct).
- `notifyPriorRecipient` — one tracked obligation per eligible prior recipient (hint ≠ correction applied).
- `provideReasons` / `provideComplaintRoute` — usable as `odrl:consequence`/`odrl:remedy` actions.
- `retainEvidence` — durable retention for the retention period; deletion never voids an issued receipt.
- `tombstone` — lawful-deletion tombstone + evidence event (append-only; never erases the chain).
- `notifyHolder` — **DEPRECATED / non-admissible** alias (`owl:deprecated`); compiler rejects, runtime fails closed.

**Left operands** (`odrl:recipient`/`purpose`/`dateTime`/`elapsedTime` reused):
- `declaredPurpose` (exact-eq), `minimumAssurance` (gteq vs ADR-0010 ordering; insufficient ⇒ deny),
  `recordClass` (exact-eq), `retentionPeriod` (duration compare).

**Right-operand value classes:** `otherProgram` (recipient class; cross-program disclosure prohibition),
`personalRecordkeeping` (a `dbx:Purpose` value); scheme `dbx:PurposeScheme`.

**Duty states (ADR-0012):** `Queued`, `Attempted`, `Accepted` (fulfilling), `Failed`, `Remedied`,
`Acknowledged` (separate terminal, ack duties only), `Superseded`. queued/attempted ≠ fulfilled.

**Conflict strategies (ADR-0013 stage 3):** `prohibitOverrides` (=`odrl:prohibit`), `moreProtectiveWins`
(default tie rule). Permit-overrides is intentionally absent ⇒ fails closed.

**Policy source ranks (ADR-0013 stage 2):** `mandatoryBaseline` (1) > `guardianPolicy` (2) > `userPreference` (3), via `dbx:rankOrder`.

**Update effects (ADR-0014):** `Prospective` (default), `AuthorizedRetroactive` (attested authorisation only).

**Versioning / binding-tuple properties (ADR-0014/0015/0019/0025):** `effectiveFrom`, `effectiveUntil`,
`updateEffect`, `affectedAssetClass`, `supersedes`, `compiledPolicyDigest`, `corpusManifestDigest`,
`profileDigest`, `evaluatorVersion`, `attestation`, `attestationStatus`, `syntheticFixture`, `rankOrder`.

**WebCivics mapping placeholders (ADR-0015, review #14):** class `WebCivicsMapping`; properties
`webCivicsSourceTerm`, `juralCategory`, `odrlProjection`, `mapsToSourceRank`, `mappingLoss` (mandatory,
loss-aware); Hohfeldian placeholder scheme `JuralScheme` (`right`/`duty-correlative`/`privilege`/`noRight`/
`power`/`liability`/`immunity`/`disability`). Placeholders carry NO attested legal meaning.

## 4. Symbols to add to the barrel (`src/databox/index.ts`)

DBX-07 did NOT edit the barrel (parallel-agent rule). Add this block:

```ts
// ODRL profile terms + fail-closed term support (C12; DBX-07)
export * from './odrl/terms';
export * from './odrl/TermSupport';
```

Exported symbols: `DBX_NAMESPACE`, `ODRL_NAMESPACE`, `DBX_PROFILE_V1`, `DBX_PROFILE_VERSION`,
`DBX_ACTIONS`, `DBX_DUTIES`, `DBX_LEFT_OPERANDS`, `DBX_RIGHT_OPERANDS`, `DBX_DUTY_STATES`,
`DBX_CONFLICT_STRATEGIES`, `DBX_SOURCE_RANKS`, `DBX_UPDATE_EFFECTS`, `REUSED_ODRL_ACTIONS`,
`REUSED_ODRL_LEFT_OPERANDS`, `REUSED_ODRL_OPERATORS`, `DEPRECATED_TERMS`; `TermCategory`,
`TermSupportReason`, `TermSupportResult`, `checkTermSupport`, `isTermSupported`, `isProfileSupported`.

## 5. Pinned digests (ADR-0025 offline verification)

SHA-256 of the published artifacts at handoff (record in the corpus manifest / receipt binding tuple):

| Artifact | sha256 |
|---|---|
| `dbx-ns.ttl` | `f40849f1ccfb11626df20c3ca2f772699092d9a834b3234a2d92c74443c70368` |
| `odrl-profile-v1.jsonld` | `309a887db0d6f245db1ba242997a796596d5afcaed37fd44c2a08da48ba86950` |
| `context/dbx-context.jsonld` | `2b632a9ff576949476e1065bb23e7800f30c3785d0485f15debb3c9156765fa3` |
| `shapes/dbx-policy-shapes.ttl` | `f71c541b2690f548f8ca8718db599f2b00031ea5f31d75f749b02ef9590064aa` |
| `shapes/webcivics-mapping-shape.ttl` | `d2e9ff09678c6108d53666970f43ab47c774a2c582021b3991d75d54fc93c995` |

## 6. Commands run + results

- `npx tsc --noEmit -p tsconfig.json` → **pass** (exit 0).
- `npx jest test/unit/databox/odrl --coverage --collectCoverageFrom='src/databox/odrl/**/*.ts' --coverageReporters=text`
  → **14 passed**; coverage **100% stmts / 100% branch / 100% funcs / 100% lines** for `terms.ts` + `TermSupport.ts`.
- `npx eslint src/databox/odrl test/unit/databox/odrl --max-warnings 0` → **pass** (exit 0; the
  `@stylistic deprecated option` notice is the ignorable one).
- SHACL validation via `rdf-validate-shacl` + `@rdfjs/dataset` + `n3`/`rdf-parse` (scratchpad harness,
  not committed): all 6 example fixtures met expectation — 4 conforming (2 agreements, version, proposed
  mapping), 2 non-conforming as required (deprecated `notifyHolder`, unattested bundle). Vocabulary TTL,
  profile JSON-LD and context JSON parse cleanly.

## 7. Residual human-policy-review gate (ADR-0007/0015)

- **Blocked (unchanged):** the legal-compliance profile. This handoff delivers the technical profile +
  the WebCivics→ODRL mapping **shape/placeholders only**. The actual normative mapping of jural/
  legitimacy/jurisdiction/accountability terms is `proposed` and **MUST NOT be admitted** until an
  authorized human attester promotes it (ADR-0015). `dbx:CompiledBundleShape` + the `attestationStatus`
  gate enforce fail-closed inadmissibility of unattested bundles. Every example carries
  `dbx:syntheticFixture true`; no artifact asserts a compliance claim.
- **Human review still required before production:** legal-policy (mapping attestation, ADR-0015);
  cryptography (bundle signing suite, ADR-0007/0015). These are not self-certified here.

## 8. What DBX-08 / DBX-20 consume

- **DBX-20 (deterministic evaluator + obligation engine):** `checkTermSupport`/`isProfileSupported` as
  the fail-closed gate for IF-04/IF-19 (unknown/deprecated/unsupported ⇒ deny + audit reason
  `unsupported-term`/`unknown-category`/`deprecated-term`); the duty-state IRIs for the ADR-0012 state
  machine; the conflict-strategy + source-rank + update-effect terms for the ADR-0013/0014 composition;
  the SHACL shapes as the ingestion pre-filter (`sh:in` ≡ `terms.ts`); the compiled-bundle admissibility
  shape for IF-19.
- **DBX-08 (fixtures/systems):** the two valid synthetic agreements + version/bundle/mapping fixtures as
  seed policies; the negative fixtures as ingestion-rejection tests; the pinned context + digests for
  offline-verifiable exports (ADR-0025).
