# Handoff — DBX-10

**Prompt:** DBX-10 — Opaque identifiers and provisioning model
**Status:** complete (tsc clean, eslint clean, 100% coverage on all added/changed `src/databox/{identifiers,provisioning}` files)
**Agent level:** Medium
**Date:** 2026-07-15
**Baseline:** Community Solid Server 7.1.9
**Depends on:** DBX-09 (scaffold: C10 seam + fail-closed stub), DBX-06 (`InstitutionProfile` + `loadInstitutionProfile`),
ADR-0002 (opaque box ids, control/data-plane split), ADR-0004 (typed directional identifiers, pairwise WebID,
keyed-HMAC rule), ADR-0016 (integration plane + relationship mapping registry, namespaced idempotency),
DBX-03 threat model (T-06, T-24, T-01/T-54).

## 1. Files created / changed (within the permitted DBX-10 paths only)

| File | Purpose |
|---|---|
| `src/databox/identifiers/OpaqueIdentifierGenerator.ts` (**changed**) | Added the real `RandomOpaqueIdentifierGenerator` (C10) + `MIN_OPAQUE_ID_BYTES`. Kept the `OpaqueIdentifierGenerator` interface **and** the `NotImplementedOpaqueIdentifierGenerator` fail-closed default (still referenced by `FailClosedStubs.test.ts`, which continues to pass). |
| `src/databox/provisioning/ProvisioningTypes.ts` (**new**) | Pure types for the provisioning/mapping model: `InstitutionalKey`, `RelationshipStatus`, `PolicyRef`, `DataboxDescriptor`, `DataboxMetadata`, `RelationshipRecord`, `ProvisionResult`. |
| `src/databox/provisioning/RelationshipMappingRegistry.ts` (**new**) | The protected mapping registry (C11): `RelationshipMappingRegistry` interface + `RelationshipRegistration` + in-memory `InMemoryRelationshipMappingRegistry`. |
| `src/databox/provisioning/DataboxProvisioner.ts` (**new**) | The idempotent provisioner (C10): `DataboxProvisioner`, `DataboxProvisionerOptions`, exported helpers `boxIdFromRoot`, `buildPolicyRefs`. |
| `test/unit/databox/identifiers/OpaqueIdentifierGenerator.test.ts` (**new**) | 15 tests (real generator + retained stub). |
| `test/unit/databox/provisioning/RelationshipMappingRegistry.test.ts` (**new**) | 8 tests. |
| `test/unit/databox/provisioning/DataboxProvisioner.test.ts` (**new**) | 14 tests. |

`src/databox/index.ts` was **NOT** edited (barrel edit is reserved for the central owner — see §4).

## 2. Identifier / mapping / provisioning design

### Opaque box identifier (C10, replaces the stub)
`RandomOpaqueIdentifierGenerator(base, byteLength = 16)` implements the CSS `IdentifierGenerator` narrowed by
`OpaqueIdentifierGenerator` (`readonly opaque: true`).
- `generate()` mints `randomBytes(byteLength).toString('hex')` (default 16 bytes = **128 bits** CSPRNG) appended to
  `base`. It takes **no argument** — it satisfies the `(name) => ResourceIdentifier` contract by parameter
  contravariance, making it *structurally impossible* for a caller `name`/customer reference to reach the id
  (invariant 2 / ADR-0004). No sequence or timestamp component → non-enumerable (T-06).
- Constructor **fails closed** on `< 128` bits or non-integer entropy (`InternalServerError`) — provisioning
  fails rather than emitting a weak id (ADR-0002 §failure).
- `extractPod` mirrors `SuffixIdentifierGenerator`: an id outside `base` or with no box segment is rejected.
- `NotImplementedOpaqueIdentifierGenerator` is retained as the fail-closed default a preset must consciously
  replace with the real generator.

### Protected mapping registry (C11)
`RelationshipMappingRegistry` fixes the authoritative typed chain
`institutional key → opaque relationship → opaque Databox → pairwise WebID` (ADR-0016 HD-10). Methods:
`register` (atomic find-or-create), `findByIdempotencyKey`, `findByBoxId` (the protected box→relationship map),
`resolveCustomer` (control-plane-only reverse resolution to the raw key). `InMemoryRelationshipMappingRegistry`
is the reference impl (ADR-0016 §Open sub-questions permits a local store behind this interface); three indexes
(by idempotency key, by box id, by relationship→raw key). **The raw `customerId` lives only in the
relationship→customer index** and is never on any emitted record. A box id already bound to a *different*
relationship is refused (never reassigned — ADR-0002 §3.2, fail closed).

### Idempotent provisioner (C10 / IF-15)
`DataboxProvisioner.provision(profileInput, key, pairwiseWebId)`:
1. `loadInstitutionProfile(profileInput)` → fails closed on an invalid profile (`BadRequestHttpError`, DBX-06).
2. Validate the `InstitutionalKey` (all five fields non-empty strings) and the pairwise WebID (absolute
   `https:`) → fail closed.
3. Compute the **namespaced idempotency key** = per-program keyed **HMAC-SHA256** over
   `encodeURIComponent(organisation/program/source-system/customerId-namespace/customerId)` (ADR-0016 HD-12
   external representation; ADR-0004 keyed-HMAC-not-unkeyed-hash rule). The HMAC secret is per-program
   (`organisation`+`program`) so cross-program collisions are structurally impossible.
4. Mint a candidate box (`generate()`), build the `RelationshipRecord`, and `registry.register(...)` — the
   **single atomic idempotency authority**. If the relationship already exists, the existing box is returned and
   the candidate is discarded (never stored → never "reassigned"); `reused: true`.
5. Build the `DataboxDescriptor` (containers from the box root + the profile's own record/submission-class
   labels — no PII) and the program-scoped `PolicyRef[]` (one per record + submission class, resolved to its
   versioned ODRL template).

**Raw `customerID` never leaves the plane:** it is passed only to `registry.register` (stored internally) and
into the HMAC message (opaque, non-reversible). It appears in **no** box id, path, descriptor, or
`ProvisionResult` — enforced structurally (no emitted type has a `customerId` field) and asserted in tests.

## 3. Threats mitigated (tie-in to DBX-03)

- **T-06 (enumeration):** box ids are `>= 2^128` CSPRNG with no sequence structure (proven: 1000 draws all
  distinct, no shared suffix between consecutive ids); `findByBoxId`/`findByIdempotencyKey` return `undefined`
  for a guessed key (no existence leak). Opaque ≠ secret — access still requires authz (invariant 3); the id
  itself simply cannot be walked.
- **T-24 (duplicate/replayed provisioning):** relationship-level idempotency via the stable namespaced HMAC key
  → repeated authorized provisioning returns the *same* box, never a fresh id per attempt (proven: 25 retries →
  1 box).
- **T-01 / T-54 (cross-tenant landing / TOCTOU):** per-program HMAC secret **and** program-in-message → the same
  `customerId` in two programs (or two organisations) yields unrelated ids/boxes (proven). `register` is the
  atomic find-or-create, so a concurrent winner is surfaced as `reused`, never a second box (proven with a racy
  registry stub).

## 4. Barrel symbols to add to `src/databox/index.ts` (central owner — keep alphabetical)

```ts
// Provisioning & relationship mapping (C10/C11, DBX-10)
export * from './provisioning/DataboxProvisioner';
export * from './provisioning/ProvisioningTypes';
export * from './provisioning/RelationshipMappingRegistry';
```

The identifiers barrel line is **unchanged** (`export * from './identifiers/OpaqueIdentifierGenerator'`) — it now
also re-exports `RandomOpaqueIdentifierGenerator` and `MIN_OPAQUE_ID_BYTES` automatically (the **stub replacement**
lands via the existing `export *`; `NotImplementedOpaqueIdentifierGenerator` is retained).

New public symbols: `RandomOpaqueIdentifierGenerator`, `MIN_OPAQUE_ID_BYTES`, `DataboxProvisioner`,
`DataboxProvisionerOptions`, `boxIdFromRoot`, `buildPolicyRefs`, `RelationshipMappingRegistry`,
`RelationshipRegistration`, `InMemoryRelationshipMappingRegistry`, `InstitutionalKey`, `RelationshipStatus`,
`PolicyRef`, `DataboxDescriptor`, `DataboxMetadata`, `RelationshipRecord`, `ProvisionResult`.

## 5. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx jest test/unit/databox/identifiers test/unit/databox/provisioning --coverage --collectCoverageFrom='src/databox/{identifiers,provisioning}/**/*.ts' --coverageReporters=text` | **PASS** — 3 suites, **37 tests**; **All files = 100%** stmts/branch/funcs/lines |
| `npx eslint src/databox/identifiers src/databox/provisioning test/unit/databox/identifiers test/unit/databox/provisioning --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic deprecated option` notice) |
| `npx jest test/unit/databox/FailClosedStubs` (regression check on the shared C10 file) | **PASS** — 7 tests (stub retained, still fails closed) |

```
File                             | % Stmts | % Branch | % Funcs | % Lines
OpaqueIdentifierGenerator.ts     |     100 |      100 |     100 |     100
DataboxProvisioner.ts            |     100 |      100 |     100 |     100
RelationshipMappingRegistry.ts   |     100 |      100 |     100 |     100
```

## 6. What DBX-11 (tenant isolation) and DBX-13 (credential) consume

- **DBX-11 (tenant isolation):** consume `RelationshipRecord.{organisation, program}` as the tenant-scoping
  facts and `RelationshipMappingRegistry.findByBoxId` as the box→relationship resolution the `TenantResolver`
  (C5) and the store's execution-time re-validation (T-54) hang off. The registry is control-plane-only — DBX-11
  must reach it below the data-plane surface, never through a consumer token (ADR-0002/0016). The provisioner's
  per-program HMAC-secret map is the seam where a durable per-tenant secret (KMS, C18) later plugs in.
- **DBX-13 (credential):** consume `RelationshipRecord.pairwiseWebId` (the vault-controlled pairwise HTTPS WebID,
  ADR-0004) and `relationshipId`/`boxId` as the opaque subjects a connection credential is issued against. The
  raw customer key is reachable only via `resolveCustomer` (control-plane) and MUST NOT enter any credential,
  URL or log (invariant 2). Credential status/lifecycle stays in C16/C9, not here.
- **Both:** the in-memory registry is a reference impl — swap in a durable, access-audited store behind the
  `RelationshipMappingRegistry` interface without touching the provisioner. Wiring into the Track B control-plane
  preset (ADR-0024) is out of DBX-10 scope.

## 7. Notes / limitations (honest)

- The mapping registry and per-program HMAC secrets are **process-local/in-memory** (ADR-0016 permits a local
  store for this scope). On restart, secrets and mappings reset; a production deployment MUST back both with a
  durable, access-audited control-plane store + KMS-held secrets — the interfaces are shaped for that swap.
- The provisioner mints a candidate box id on every call (discarded on an idempotent hit). This is intentional:
  `register` is the sole atomic idempotency authority, and a discarded candidate is never stored → never
  reassigned. The wasted CSPRNG draw is negligible and leaks nothing.
- This is the provisioning **model + generator**; it does not itself create Solid containers/policies in a
  `ResourceStore` (that is the C10↔C1 wiring, IF-15 install step, owned downstream) nor perform the account-linking
  ceremony (ADR-0016 HD-11 / DBX-13). `DataboxDescriptor.containers` is the descriptor a container-creation step
  consumes.
