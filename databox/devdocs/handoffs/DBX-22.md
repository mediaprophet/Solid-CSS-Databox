# Handoff — DBX-22

**Prompt:** DBX-22 — Synthetic institutional bridge (RetailCo + AgencyCo)
**Status:** complete (compiles, lints clean, 100% test-covered on every `src/databox/bridge/**/*.ts`).
**Agent level:** Medium
**Date:** 2026-07-15
**Baseline:** Community Solid Server 7.1.9
**Consumes:** DBX-10 (`RelationshipMappingRegistry`, `DataboxProvisioner`, `ProvisioningTypes`),
DBX-15 (`DepositSubmissionGateway`, `IdempotencyRegistry`, `BinaryEvidenceQuarantine`, `RdfShapeValidator`,
`GatewayTypes`), DBX-13 (`credential/Es256`), DBX-18 (`AcceptanceReceiptSigner`, `DurableCommit`,
`ReceiptTypes`), DBX-11 (`tenant/TenantContext`), DBX-06 (`loadInstitutionProfile`, `InstitutionProfile`),
DBX-08 (synthetic loyalty profile + record fixtures). ADRs: 0016 (integration plane), 0017 (bridge deposit),
HD-12/13/14/16, threats T-02/13/20/24.

## 1. Files created (all new)

`src/databox/bridge/` (100% covered):

- `BridgeTypes.ts` — pure value types: `ProgramServiceIdentity` (HD-13/HD-02 least-privilege service id),
  `SourceEvent` (business event + namespaced idempotency tuple + typed customerID), `InstitutionalRecord` +
  `SignedInstitutionalRecord` (DBX-08 fixture record shape), `InstitutionalRecordProvenance`,
  `BridgeReconciliation` / `ReconciliationStatus`, `BridgeIssuerKey`. No data-plane-facing type can hold the
  raw `customerId` (invariant 2 stated structurally).
- `SourceOutbox.ts` — `TransactionalSourceOutbox` interface + `InMemorySourceOutbox` reference store:
  commits the business event + outbox row atomically; **idempotent on the namespaced tuple** (a re-commit
  returns the original, T-24); `drain(scope)` yields only pending (not-yet-`reconciled`) rows in commit
  order; `markReconciled` / `reconciliation` for observability. `CommittedSourceEvent`, `SourceOutboxOptions`.
- `RelationshipResolver.ts` — `RelationshipResolver` interface + `KeyedHmacRelationshipResolver`: resolves a
  typed customerID to the opaque relationship **only** through `RelationshipMappingRegistry.findByIdempotencyKey`,
  deriving the per-program keyed-HMAC of `org/program/source-system/namespace/customerId` **identically to
  `DataboxProvisioner`**. Fails closed on a malformed key; returns `undefined` for an unmapped key (no leak).
- `InstitutionalRecordBuilder.ts` — transforms a `SourceEvent` into the signed record: opaque resource id
  (`sha256(relationshipId:sourceEventId)`), reuses `Es256.signCompactJws` to bind `urn:sha256:<digest>` of
  the exact bytes; provenance carries the distinct software actor + program principal; supersession pointer.
- `DataboxBridge.ts` — the drainer/orchestrator **and the barrel entry** (re-exports the four siblings via
  `export *`, mirroring the DBX-15/DBX-18 pattern). Also exports `DurableCommitInput`, `DurableCommitConfirmer`,
  `BridgeDepositReport`, `DataboxBridgeOptions`.

`test/unit/databox/bridge/`:

- `BridgeTestHarness.ts` — synthetic-only harness: builds RetailCo (DBX-08 loyalty profile) + AgencyCo
  (cloned profile with an added `rc-service-notice` class, still validates), a shared registry/provisioner
  with a deterministic shared HMAC secret, and `makeBridge`. Two distinct program identities.
- `SourceOutbox.test.ts`, `RelationshipResolver.test.ts`, `InstitutionalRecordBuilder.test.ts`,
  `DataboxBridge.test.ts` — **24 tests total**.

Also edited (permitted by constraint 4): repo-root `.componentsignore` (see §5). `src/databox/index.ts` was
**not** edited.

## 2. Design (source-outbox → mapping → sign → deposit → reconcile)

1. **Transactional source-outbox (HD-12).** The synthetic source system calls `outbox.commit(event)`, which
   appends the business record and the outbox row in one operation. A retry re-commits the *same* namespaced
   tuple and gets the original row back — no second business event.
2. **Mapping resolution (HD-10, invariant 2).** `bridge.drain()` resolves each event's typed customerID
   through `KeyedHmacRelationshipResolver` → the opaque `RelationshipRecord`. The raw `customerId` is used
   only to derive the protected lookup key and never leaves the resolver.
3. **Sign (ADR-0016).** `InstitutionalRecordBuilder` builds the canonical envelope (opaque relationship/box,
   resolved policy ref, provenance, optional supersession, synthetic payload), digests the exact bytes and
   ES256-signs `urn:sha256:<digest>`.
4. **Deposit through the gateway (ADR-0017).** The bridge builds a `DepositRequest` (target
   `records/<class>/`, `application/ld+json` body, the program service identity's issuer signature, the
   namespaced idempotency tuple) and calls `DepositSubmissionGateway.validateDeposit` with a
   `GatewayContext` scoped to the resolved tenant + the program's **own** trusted issuer key.
5. **Durable commit + retained receipt (ADR-0019).** On `accepted`/`duplicate` the bridge durably commits
   (injectable seam) and issues a signed acceptance receipt via `AcceptanceReceiptSigner`, retaining it and
   writing a `reconciled` `BridgeReconciliation` back to the outbox row.

Fail-closed + recoverable: an unresolvable mapping → `unresolved` (quarantined for review); a gateway
rejection or a thrown durable-commit failure → `failed`; both leave the row **pending**, so a later
`drain()` resumes it. The gateway dedups the tuple, so a resumed attempt returns the original and issues
exactly one logical receipt.

## 3. Threats mitigated

- **T-02 (cross-program bridge cred).** `deposit()` throws `ForbiddenHttpError` before any work if the event's
  program ≠ the bridge's program; the bridge only ever presents its own program's trusted issuer key + tenant
  scope, so the gateway independently rejects a mismatched relationship/container/issuer.
- **T-13 (bridge service authority).** Each bridge authenticates as its own `ProgramServiceIdentity`
  (distinct principal/service/issuer, HD-02) and appends only to its assigned `records/<class>/` containers;
  no consumer-vault access, no cross-program role.
- **T-20 (stolen bridge key).** The gateway's signature check (reused DBX-15/Es256) binds the exact payload
  digest and an issuer-trusted key; the bridge presents only its own key registry.
- **T-24 (idempotency).** Stable namespaced tuple at the source-outbox, the gateway `IdempotencyRegistry`,
  and the `ReceiptRegistry` — a replay creates no duplicate logical receipt (test-proven).

## 4. Barrel symbols (LISTED — `src/databox/index.ts` NOT edited)

Add ONE line (one-entry-file-re-exports-siblings pattern), placed with the other C-components:

```ts
// Synthetic institutional bridge (C21, DBX-22)
export * from './bridge/DataboxBridge';
```

`DataboxBridge.ts` transitively re-exports `BridgeTypes`, `SourceOutbox`, `RelationshipResolver` and
`InstitutionalRecordBuilder`, so the single line exposes every DBX-22 symbol.

## 5. `.componentsignore` additions

componentsjs only processes classes reachable from the package `index.ts` barrel; DBX-22 does not wire that
line, so `npm run build:components` already exits 0. To keep it green when **DBX-25** adds the barrel line,
four reference classes were added to repo-root `.componentsignore` (they take function-typed options / a
`KeyObject`, exactly like the already-ignored `AcceptanceReceiptSigner`, `DataboxProvisioner`,
`InMemoryRelationshipMappingRegistry`, `IdempotencyRegistry`): `DataboxBridge`, `InMemorySourceOutbox`,
`InstitutionalRecordBuilder`, `KeyedHmacRelationshipResolver`.

## 6. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) |
| `npx eslint src/databox/bridge test/unit/databox/bridge --max-warnings 0` | **PASS** (only the shared `@stylistic` deprecation notice) |
| `npx jest test/unit/databox/bridge --coverage --collectCoverageFrom='src/databox/bridge/**/*.ts' --coverageReporters=text` | **PASS** — 4 suites, **24 tests**; **100%** stmts/branch/funcs/lines on all four files |
| `npm run build:components` | **PASS** (exit 0) |
| `npx jest test/unit/databox/FailClosedStubs` | **PASS** — 7 tests (still green) |

## 7. What DBX-23 / DBX-25 consume

- **DBX-23 (review queue).** The `BridgeReconciliation` + retained `SignedAcceptanceReceipt` are the
  source→Databox evidence the review/disposition path consumes; `unresolved` rows are exactly the
  quarantined-for-review set. Submissions the bridge routes reuse the same `DepositSubmissionGateway`
  submission surface (a submission path is out of DBX-22 scope — deposits only).
- **DBX-25 (integration).** Wire the barrel line (§4). The `.componentsignore` entries (§5) then take effect.
  The synthetic RetailCo + AgencyCo programs, their two isolated mappings, and the multi-class /
  supersession deposit flow in the harness are the end-to-end fixtures a full integration demo builds on.

## 8. Notes / limitations (honest)

- The `KeyedHmacRelationshipResolver` re-derives the relationship idempotency key identically to the private
  `DataboxProvisioner.idempotencyKey` (that method is not exported). Production must inject the **same**
  per-program secret into both; the harness shares a deterministic secret to demonstrate the match.
- The durable-commit boundary is an injectable in-memory seam (`DurableCommitConfirmer`); production wires the
  transactional-outbox/ledger commit here. A thrown commit is the modelled transient failure the drain resumes.
- All data is synthetic (`org-retailco` / `org-agencyco`, `CUSTOMER-SECRET-42` used only to prove it never
  leaks). No real retailer/customer data appears anywhere.
