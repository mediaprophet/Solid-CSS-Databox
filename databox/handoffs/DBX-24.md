# Handoff — DBX-24

**Prompt:** DBX-24 — Reference consumer agent (component C20; the consumer-controlled pod/vault access
client, ADR-0026 — customers access their org-hosted databox through their OWN Solid-compatible pod/agent).
**Status:** complete. BOTH tsc clean, eslint clean, **100% coverage** on every `src/databox/agent/**/*.ts`,
**40 tests**. `build:components` exit 0 (no `.componentsignore` additions). FailClosedStubs green.
**Agent level:** Medium.
**Baseline:** Community Solid Server 7.1.9.

**Consumes via imports (NOT modified):**
- `credential/ConnectionCredentialValidator` (import + validate a credential: trusted issuer, no bearer
  secret T-18, realm binding T-08), `credential/HolderKeyProof` (`signHolderProof` — prove holder-key
  control), `credential/ProvisionalTokenExchange` (`exchange` — credential+proof → short-lived token),
  `credential/ConnectionCredentialTypes` (`ProvisionalShortLivedToken`, `ProofChallenge`).
- `proof/RecordProofValidator` (verify retrieved records; `IssuerTrustStore`, `PinnedContextSet`,
  `StatusListResolver`), `receipt/AcceptanceReceiptVerifier` (verify retained/returned receipts offline),
  `feed/CursorFeed` (`CursorFeed`/`CommittedEvent` — missed-event recovery), `odrl/TermSupport` +
  `odrl/terms` (present ODRL terms understandably).

**Decisions honoured:** ADR-0026 (consumer-pod access is the only path; the holder key is CONSUMER-held;
no org-held consumer key), ADR-0004 (per-connection pairwise identity/relationship/tenant, no global id),
ADR-0007/0008 (import credential + prove holder-key control for unattended access), ADR-0011 (notify-then-
pull; cursor feed is authoritative recovery, exactly-once), ADR-0013/0017 (present ODRL terms; submit
selected fields only). Threats: T-51 (inert data), T-08 (cross-program replay), T-03 (no cross-program
correlation), T-46 (receipt retention / independent re-verification), T-18 (no embedded bearer secret).

## 1. Files created (within permitted `src/databox/agent/**` only)

| File | Purpose |
|---|---|
| `src/databox/agent/AgentTypes.ts` | Injected-collaborator interfaces (`HolderProofChallengeSource`, `TokenExchangeEndpoint`, `RecordRetrievalEndpoint`, `SubmissionEndpoint`, `RetrievedRecordItem`, `SubmissionAcknowledgement`), `ConnectionVerificationConfig`, `ConnectionImport`, `ConsumerAgentDependencies`. All transports are ordinary Solid discovery/OIDC/HTTP seams (injectable → fully offline tests), NOT a private SDK transport. |
| `src/databox/agent/ConsumerConnectionRegistry.ts` | The per-program **isolated** connection registry: `ConsumerConnection` (its holder PRIVATE key, verification config, cached token, cursor, own knowledge store), `add`/`get`/`require`/`requireActive`/`list`/`pause`/`resume`/`remove`/`setToken`/`setCursor`. Every accessor scoped by `program`; cross-program lookup → 404 existence-hiding; no full-vault list. |
| `src/databox/agent/LocalKnowledgeStore.ts` | Per-connection independent copies: `storeRecord` (idempotent on record digest; refuses a foreign connection's record), `storeReceipt`, `recordRecoveredEvent` (dedup exactly-once), `exportEvidence` (portable bundle for independent re-verification). |
| `src/databox/agent/InertRecord.ts` | `toInertRecord` — the **T-51 inert-data** transform: a dependency-free, side-effect-free, frozen copy of the verified record. No fetcher/endpoint in scope → structurally cannot dereference a link or auto-submit a directive. |
| `src/databox/agent/ScopedSubmission.ts` | `buildScopedSubmission` — data-minimisation projection: discloses ONLY explicitly selected fields; empty selection / absent field fail closed; result frozen. |
| `src/databox/agent/OdrlTermsPresenter.ts` | `presentOdrlTerms` — understandable rendering of permissions/prohibitions/duties + constraints via DBX-07 `checkTermSupport`, while preserving the verbatim machine-readable policy; `fullyUnderstood` false when profile/any term unsupported. |
| `src/databox/agent/ReferenceConsumerAgent.ts` | `ReferenceConsumerAgent.forProgram(programId) → ProgramAgent`. `ProgramAgent`: `importConnection`, `authenticate`, `retrieveAndStore`, `recover`, `presentTerms`, `submitCorrection`, `storedRecords`, `exportEvidence`, `pause`/`resume`/`remove`/`rotate`, `listConnections`. **Barrel entry file** — re-exports its siblings. |

Tests: `test/unit/databox/agent/{AgentTestSupport,ReferenceConsumerAgent,ScopedSubmission,OdrlTermsPresenter,LocalKnowledgeStore}.ts`.

## 2. Design — isolated registry + verify + inert record + scoped submission

- **Isolated per-program registry.** A program is only ever handed a `ProgramAgent` bound to its own
  `programId`; it is structurally incapable of naming another program's connection. The registry stores
  `Map<program, Map<connectionId, ConsumerConnection>>`; keys, cached tokens, cursors and the knowledge
  store are all per-`ConsumerConnection`. `add`/`pause`/`resume`/`remove`/`rotate` mutate exactly one entry.
  `rotate` validates the successor, adds it, then removes the predecessor (and rolls the add back if the
  relationship differs — fail closed, T-08).
- **Import bootstraps standards access with NO embedded bearer secret.** `importConnection` runs the
  `ConnectionCredentialValidator` (recursive forbidden-key scan T-18; realm binding incl. `program ==
  this.programId` T-08). Access is then obtained purely by `authenticate`: issue a fresh audience-bound
  challenge → `signHolderProof` with the CONSUMER-held private key → `ProvisionalTokenExchange.exchange`.
  The returned token is `notWireFormat` — never a transmissible bearer.
- **Verify on retrieval.** `retrieveAndStore` runs `RecordProofValidator.validate` (proof + status +
  valid≠true, exact payload digest) AND `AcceptanceReceiptVerifier.verify` (offline) for each item, then
  stores an inert copy with provenance.
- **Inert record (T-51).** See §4.
- **Scoped submission (T-51).** `submitCorrection` calls `buildScopedSubmission` BEFORE any transport, so
  only the named fields leave the agent, then verifies the returned receipt and retains it.

## 3. How isolation + no cross-program correlation hold (T-03/T-08)

- **No wallet-browsing API.** There is no agent-wide "list all connections". `listConnections()` is
  `ProgramAgent`-scoped; a cross-program `require` throws `NotFoundHttpError` (404, not 403) so a probe
  cannot even confirm another connection exists.
- **T-08 replay.** A credential minted for program A cannot be imported under program B — the validator's
  realm check rejects it. Rotation refuses a successor for a different relationship.
- **Independent trust.** Each connection carries its OWN `ConnectionVerificationConfig` (record/receipt
  trust stores, pinned contexts, status resolver); verifying A's records never draws on B's trust set.
- **Disruption isolation (tested).** Pausing + removing program A's connection leaves program B fully
  functional (authenticate + retrieve + store), with its own cursor/token/knowledge untouched.

## 4. The inert-data contract (T-51)

A retrieved/recovered record is pure DATA, never a program. `toInertRecord` is a dependency-free, frozen
transform: it copies the exact verified payload as opaque bytes and the already-verified valid≠true claim,
and **holds no fetcher/endpoint**, so however hostile the payload (`seeAlso`, `directive`, `submitTo` …) it
cannot be turned into an outbound request or a submission. Test: a hostile record is retrieved and stored;
the only outbound call is the single fetch the consumer invoked (`fetchCount === 1`, `submitCount === 0`),
and the link/directive text is retained verbatim as inert, frozen data. The agent makes an outbound call
ONLY for an operation the consumer explicitly invokes.

## 5. Threats mitigated

T-51 (inert data — no auto-dereference/auto-submit), T-08 (cross-program credential replay — realm binding
on import + rotation), T-03 (no cross-program correlation — program-scoped handle, 404 existence-hiding,
per-connection trust), T-18 (no embedded bearer secret — validator forbidden-key scan; holder-key-proof
access), T-46 (receipt retention — offline receipt verification; exported bundles re-verify independently).

## 6. Barrel symbols (NOT wired — `src/databox/index.ts` not edited, per constraint)

One entry file re-exports its siblings (DBX-11/14/15/16/18 pattern). Whoever wires C20 should add **one**
line to `src/databox/index.ts`:

```ts
// Reference consumer agent (C20, DBX-24)
export * from './agent/ReferenceConsumerAgent';
```

That transitively re-exports every DBX-24 symbol: `ReferenceConsumerAgent`, `ProgramAgent`,
`SubmissionResult`, `ConsumerConnectionRegistry`, `ConsumerConnection`, `ConsumerConnectionState`,
`NewConnectionInput`, `LocalKnowledgeStore`, `StoredRecord`, `StoredReceipt`, `EvidenceBundle`,
`EvidenceBundleEntry`, `InertRecord`, `toInertRecord`, `presentOdrlTerms` + `OdrlPolicy`/`OdrlRule`/
`OdrlConstraint`/`PresentedOdrlTerms`/`PresentedRule`/`PresentedConstraint`/`PresentedRuleType`,
`buildScopedSubmission` + `ScopedSubmission`/`ScopedSubmissionMeta`, and the `AgentTypes` interfaces
(`ConsumerAgentDependencies`, `ConnectionImport`, `ConnectionVerificationConfig`, `RetrievedRecordItem`,
`SubmissionAcknowledgement`, `HolderProofChallengeSource`, `TokenExchangeEndpoint`, `RecordRetrievalEndpoint`,
`SubmissionEndpoint`).

## 7. `.componentsignore` additions

**None.** `npm run build:components` completed exit 0 with no "Could not understand parameter type" error
for any new class.

## 8. Commands + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (src OK) |
| `npx tsc -p test --noEmit` | **PASS** (test OK) |
| `npx eslint src/databox/agent test/unit/databox/agent --max-warnings 0` | **PASS** (0 errors; @stylistic deprecation notice only) |
| `npx jest test/unit/databox/agent --coverage --collectCoverageFrom='src/databox/agent/**/*.ts'` | **40 passed**, **100% stmts/branch/funcs/lines** on all 6 source files |
| `npm run build:components` | **exit 0** (no `.componentsignore` change) |
| `npx jest test/unit/databox/FailClosedStubs` | **7 passed** (stays green) |

## 10. Round-2 fixes (independent review)

The review CONFIRMED the two load-bearing properties (one connection cannot reach another's key/token/data;
a hostile retrieved record causes no outbound/auto-submit). Five secondary findings fixed, each with an
added test, keeping 100% coverage + both tsc + eslint + build:components clean (**45 tests**).

- **M1 (MED) — rotation destroyed retained evidence (T-46 regression).** `rotate()` removed the predecessor,
  deleting its whole `LocalKnowledgeStore` + `lastCursor`. **Fix:** rotation is now modelled as a
  *continuation* of the same relationship/recovery stream — it reuses the predecessor's `tenantId`, migrates
  its records/receipts/recovered-event dedup set (`LocalKnowledgeStore.migrateFrom`) and preserves
  `lastCursor` onto the successor. The predecessor is removed only after. Test: `exportEvidence(newId)` after
  `rotate()` still holds the pre-rotation record + receipt, and a new event recovers while the old is not
  replayed (cursor + dedup preserved).
- **M2 (MED) — consumer-supplied tenantId over a shared feed (T-03 correlation).** Nothing stopped two
  connections sharing a `tenantId` and thus the same cursor stream. **Fix:** `ConsumerConnectionRegistry`
  now enforces tenant uniqueness — `add` rejects a `tenantId` already bound to any connection; `remove`
  frees it (so a rotation continuation may reuse it). Test: importing two connections with the same
  `tenantId` is rejected.
- **L1 (LOW) — mutable retained payload Buffer.** `listRecords`/`exportEvidence` handed out the stored Buffer
  by reference. **Fix:** both now return a duplicated payload (`copyPayload`) in a re-frozen inert copy; the
  retained bytes can no longer be mutated to break `payloadDigest`. Test: mutating the handed-out payload
  leaves the retained evidence unchanged.
- **L2 (LOW) — shared claim reference.** **Fix:** `toInertRecord` deep-copies + freezes the claim
  descriptors. Test: mutating the source `RecordVerification.claim` cannot alter the inert copy.
- **L3 (LOW) — shallow ScopedSubmission freeze.** **Fix:** `buildScopedSubmission` deep-clones + deep-freezes
  each selected value. Test: a nested object/array is cloned (source mutation does not leak) and frozen
  (cannot be widened).

Round-2 commands: `tsc -p tsconfig.json` PASS; `tsc -p test` PASS; agent coverage **100%**, **45 tests**;
`eslint … --max-warnings 0` PASS; `build:components` exit 0 (no `.componentsignore` change); FailClosedStubs
7 passed.

## 9. What DBX-25 (integration) consumes

- `ReferenceConsumerAgent` + `ProgramAgent` as the consumer-side end of an end-to-end flow (issue at the
  org → import at the consumer → authenticate → deposit visible → retrieve+verify → recover via cursor →
  present terms → submit correction → verify receipt).
- The injected-collaborator interfaces in `AgentTypes.ts` are the seams DBX-25 binds to REAL server
  components (the DBX-13 exchange, DBX-16 validator, DBX-18 receipt verifier, DBX-21 cursor feed) instead
  of the unit test harness — the agent code is unchanged.
- The acceptance-gate properties proven here (per-connection isolation; no cross-program correlation;
  bootstrap with no bearer secret; independent re-verification; scoped disclosure; inert data) are the
  invariants DBX-25 should assert survive against the real components.
