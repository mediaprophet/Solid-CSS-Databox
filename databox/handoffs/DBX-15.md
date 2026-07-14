# Handoff — DBX-15

**Prompt:** DBX-15 — Deposit and submission validation (component C7 deposit/submission gateway,
DBX-04 §2/§7.0/§7.1/§7.2; ADR-0016/0017/0022; ADR-0014 policy binding).
**Status:** complete (tsc clean, eslint clean, **100% coverage** on every executable
`src/databox/gateway/**/*.ts`, 55 tests).
**Agent level:** Medium — REAL content/shape/policy validation gate. Runs AFTER C4 authorization, BEFORE
the append-only accept + durable C13 commit.
**Baseline:** Community Solid Server 7.1.9.
**Depends on:** DBX-06 (`InstitutionProfile`: recordClasses/submissionClasses/legalBases/policy templates —
validated against), DBX-10/DBX-11 (`TenantContext` boxRoot+relationshipId, provisioning HMAC pattern),
DBX-13 (`Es256` verify concepts for issuer signature), DBX-14 (composed authorizer admits before this gate;
`toSafeAuthorizationError` handles the authz surface).
**Decisions honoured:** ADR-0016 (namespaced idempotency key org/program/system/event-type/source-event-id,
stable across retries, keyed-HMAC external form; institutional signing; per-program isolation),
ADR-0017 (submissions are authenticated append/create; org never crawls the vault), ADR-0022 (bounded
size/media-type + quarantine state machine accept→quarantine→scan→release/reject; production scanner
deferred, stub fail-closed-until-released), ADR-0014 (policy ref resolves to the class's versioned template).

## 1. Files created (within permitted DBX-15 paths only)

| File | Purpose |
|---|---|
| `src/databox/gateway/GatewayReasonCodes.ts` | `DATABOX_GATEWAY_CODES` (the non-leaking `databox:gateway:*` vocabulary, DISTINCT from the authz `databox:*`), `GatewayRejection`, `gatewayRejection`, `toGatewayHttpError` (413/415/422/400 mapper). |
| `src/databox/gateway/GatewayTypes.ts` | Types only: `NamespacedEventKey`, `InstitutionalSignatureClaim`, `TrustedIssuerKey`, `PolicyRefClaim`, `DepositRequest`, `SubmissionRequest`, `GatewayRequest`, `GatewayAcceptance`, `GatewayOutcome`. |
| `src/databox/gateway/RdfShapeValidator.ts` | `validateRdfShape` (bounded JSON-LD/JSON + Turtle, pinned contexts, reject remote-context/expansion, T-21), `isRdfMediaType`, `RdfShapeConfig`/`RdfShapeLimits`, `DEFAULT_RDF_SHAPE_LIMITS`. |
| `src/databox/gateway/BinaryEvidenceQuarantine.ts` | `BinaryEvidenceQuarantine` state machine (accept→scan→release/reject; unreleased bytes never served), `EvidenceScanner`, `FailClosedScanner` (production-deferred default), `StubVerdictScanner`, `QuarantineRecord`, `QuarantineState`, `ScanVerdict`. |
| `src/databox/gateway/IdempotencyRegistry.ts` | `IdempotencyRegistry` — namespaced keyed-HMAC key + duplicate→original-outcome store (T-24). |
| `src/databox/gateway/DepositSubmissionGateway.ts` | `DepositSubmissionGateway` orchestrator (`validate`/`validateDeposit`/`validateSubmission`), `GatewayBounds`, `MediaBounds`, `GatewayContext`. Also the **barrel entry** (`export *` of the five siblings). |
| `test/unit/databox/gateway/*.test.ts` (5 suites) | Positive + negative fixtures per threat; 55 tests. |

`src/databox/index.ts` was **NOT** edited (forbidden). No profile/provisioning/authorization/credential/
tenant/context dir was modified — all consumed via imports.

## 2. Design — validators, quarantine, error vocabulary

**Validation order (deposit, §7.1):** idempotency-key well-formed → **duplicate short-circuit (returns
original outcome)** → addressed relationship == tenant.relationshipId → record class declared → target is
`{boxRoot}records/{class}/` → purpose ∈ class.purposes → legal basis == class basis ∧ resolves → policy ref
resolves to class template+version → media type allowed → size ≤ bound → institutional signature (trusted
issuer ∧ ES256 JWS verifies ∧ binds `sha256(body)`) → **RDF: bounded shape then accept / binary: quarantine**.
Submission (§7.2) drops legal-basis + signature, uses `submissionClasses`, idempotency optional.

**Deterministic non-leaking outcome:** every failure is a `GatewayRejection {code, reason}` naming only the
abstract check — never payload content, never whether another tenant/box/record exists (T-23; CR-BRG-03).
Misaddressed / wrong-class / wrong-purpose all surface as an identical `400`; only size/media/shape use
413/415/422. `GatewayOutcome` = `accepted | quarantined | duplicate | rejected`.

**Bytes never transformed:** `body: Buffer` is digested (`sha256Hex`) and, for binary, quarantined exactly;
the gateway validates, it does not re-encode. A duplicate idempotency tuple returns the stored original
`GatewayAcceptance`, never a second record.

**Quarantine contract (ADR-0022):** `accept()` → `quarantined` (non-servable); `scanAndRelease()` →
`scanning` → `released` (clean) / `rejected` (malicious) / stays `quarantined` (error/unknown — fail
closed); `retrieve()` returns bytes ONLY when `released`, else a `quarantineWithheld` rejection. Default
`FailClosedScanner` returns `unknown` (production scanner deferred; nothing releases until a real scanner or
the labelled `StubVerdictScanner` is wired). `verdictToState` fails closed on any non-clean verdict.

**Idempotency (ADR-0016 HD-12):** per-program keyed HMAC over
`organisation/program/source-system/event-type/source-event-id` — stable across retries, program mixed into
the message so the same source-event id in two programs yields unrelated keys (mirrors DBX-10 provisioner).

**Error vocabulary:** `databox:gateway:*` — 15 codes, disjoint from the authz `databox:*` set by the
`gateway:` segment, so an auditor tells a content-validation rejection from an authorization denial.

## 3. Threats mitigated (DBX-03 / CR-SRV / CR-BRG)

- **T-21 (malicious RDF):** `validateRdfShape` parses within a node/depth budget, **never fetches**, rejects
  a remote/non-pinned `@context` (JSON-LD) or a remote `owl:imports`/`@import` (Turtle), and rejects
  expansion/nesting bombs (`malformed-payload`/`remote-context`). CR-SRV-16.
- **T-22 (oversized/zip-bomb + malware):** per-class/default size + media-type bounds (`payload-too-large`/
  `unsupported-media-type`); binary evidence enters quarantine and is **never served before release**.
- **T-23 (misaddressed/wrong-purpose/wrong-class):** container/relationship/class/purpose/legal-basis/policy
  validators, each a deterministic non-leaking `400`. CR-BRG-03.
- **T-24 (duplicate/replay):** namespaced keyed-HMAC key; duplicate → original outcome, never a second record.

## 4. Barrel symbols (NO edit to `src/databox/index.ts`)

There is no existing barrel line for `gateway/`, and `src/databox/index.ts` is forbidden to edit. Following
the DBX-11/DBX-14 sibling-re-export pattern, `DepositSubmissionGateway.ts` `export *`s the five siblings, so
**a single line** added later by whoever wires C7 propagates every DBX-15 symbol:

```ts
// add to src/databox/index.ts (Deposit/submission gateway C7, DBX-15):
export * from './gateway/DepositSubmissionGateway';
```

Public symbols reachable through it: `DATABOX_GATEWAY_CODES`, `DataboxGatewayCode`, `GatewayRejection`,
`gatewayRejection`, `toGatewayHttpError`, `NamespacedEventKey`, `InstitutionalSignatureClaim`,
`TrustedIssuerKey`, `PolicyRefClaim`, `DepositRequest`, `SubmissionRequest`, `GatewayRequest`,
`GatewayAcceptance`, `GatewayOutcome`, `RdfShapeLimits`, `RdfShapeConfig`, `DEFAULT_RDF_SHAPE_LIMITS`,
`validateRdfShape`, `isRdfMediaType`, `QuarantineState`, `ScanVerdict`, `EvidenceScanner`,
`FailClosedScanner`, `StubVerdictScanner`, `QuarantineRecord`, `QuarantineOptions`,
`BinaryEvidenceQuarantine`, `IdempotencyOptions`, `IdempotencyResult`, `IdempotencyRegistry`,
`MediaBounds`, `GatewayBounds`, `GatewayContext`, `DepositSubmissionGateway`.

## 5. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx jest test/unit/databox/gateway --coverage --collectCoverageFrom='src/databox/gateway/**/*.ts' --coverageReporters=text` | **PASS** — 5 suites, **55 tests**; **All files 100%** stmts/branch/funcs/lines. `GatewayTypes.ts` is types-only (no instrumentable statements) so is not listed. |
| `npx eslint src/databox/gateway test/unit/databox/gateway --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice) |

Per constraint 4: did NOT run `git add`/`commit`, `npm run build`, or `npm ci`.

## 6. What DBX-16 / DBX-17 / DBX-18 consume

- **DBX-16 (record proof, ADR-0020):** consumes `GatewayAcceptance.payloadDigest` (sha256 of the exact
  bytes) and `policyRef` as the values the record proof binds; the institutional `InstitutionalSignatureClaim`
  verification concept extends to the record-proof suite.
- **DBX-17 (append-only, ADR-0018):** consumes the `GatewayOutcome` — only `accepted`/`quarantined` proceed
  to the C6 `AppendOnlyStore` create; the gateway guarantees a create (never a replace). `quarantined` bytes
  do NOT project to the servable store until `BinaryEvidenceQuarantine.scanAndRelease` → `released`.
- **DBX-18 (receipts / §7.0 commit, ADR-0019):** consumes `GatewayAcceptance` (digest, class, relationshipId,
  policyRef, idempotencyKey, quarantineId) as the acceptance facts the C13 evidence event + signed receipt
  bind; the receipt is issued only after durable commit, never by the gateway. A `duplicate` returns the
  original receipt. Quarantine transitions (accept/scan/release/reject) are the evidence events DBX-18 records.

## 7. Notes / limitations (honest)

- **Production malware scanning is DEFERRED (ADR-0022 §5).** `FailClosedScanner` performs no scanning and
  returns `unknown`, so binary evidence never releases until a real scanner (or the labelled synthetic
  `StubVerdictScanner`) is wired. This is a labelled stub, not production scanning; the accept/release/serve
  contract is built so a real scanner drops into the `scanning` step with no change to it.
- **Per-class size/media-type bounds live in `GatewayBounds` (DBX-15), not the DBX-06 profile.** ADR-0022
  §Open sub-questions left concrete bounds to DBX-15; the profile schema does not yet carry them. A future
  profile extension can supply `GatewayBounds` from the profile without changing this gate's contract.
- **Turtle shape validation is a bounded lexical scan** (remote-import + node budget), not a full streaming
  parse. A production deployment plugs an N3 streaming parser configured with no remote fetch behind the same
  `validateRdfShape` contract; the JSON-LD path is the primary T-21 remote-`@context`/expansion vector.
- **This is the C7 mechanism only.** It validates and produces `GatewayOutcome`; it does not wire into the
  HTTP pipeline, run the §7.0 C13 commit, issue receipts, or emit evidence events — those are DBX-17/DBX-18.
  It assumes C4 (DBX-14) already admitted the request; it re-validates content/policy, not authorization.
