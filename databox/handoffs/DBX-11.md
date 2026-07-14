# Handoff — DBX-11

**Prompt:** DBX-11 — Tenant isolation enforcement (component C5)
**Status:** complete (tsc clean, eslint clean, 100% coverage on all `src/databox/tenant/**/*.ts`)
**Agent level:** Hard — REAL security-critical code. **Residual human adversarial-review gate: DBX-26 (see §6).**
**Date:** 2026-07-15
**Baseline:** Community Solid Server 7.1.9
**Depends on:** DBX-10 (`RelationshipMappingRegistry` + opaque box ids — the box→relationship map tenants are
resolved against), DBX-09 (C5 seam + fail-closed stub), DBX-04 §9.1 decision 1 (C5-before-C4, tenant carried
immutably), ADR-0002 (program-bound origin/audience/service-identity/namespace; control/data-plane split;
404-not-403), ADR-0016 HD-13 (per-bridge least-privilege service identity, no cross-program role), ADR-0011
(SSRF context), DBX-03 T-01/T-02/T-31/T-34/T-54, DBX-05 CR-SRV-01/02/21.

## 1. Files created / changed (within the permitted DBX-11 paths only)

| File | Purpose |
|---|---|
| `src/databox/tenant/TenantContext.ts` (**new**) | Pure types + helpers: immutable `TenantContext`/`TenantScope`, `TenantResolverInput`, `tenantIdOf`, `sameTenant`, `boxIdFromTarget`, `freezeTenantContext` (deep-freeze). |
| `src/databox/tenant/TenantBindingRegistry.ts` (**new**) | `TenantBinding` + `TenantBindingRegistry` + `InMemoryTenantBindingRegistry`. Program-bound origin/audience/service-identity/namespace registry; **structurally refuses a fact bound to >1 tenant (T-31)**. |
| `src/databox/tenant/TenantIsolationGuard.ts` (**new**) | `TenantIsolationGuard.assertStillBound(context)` — store-boundary re-validation seam closing **T-54**; `TENANT_DENIED_MESSAGE`. |
| `src/databox/tenant/TenantResolver.ts` (**replaced stub**) | Real `RegistryTenantResolver` (C5) replacing the DBX-09 stub. Keeps the `TenantResolver` abstract and the `NotImplementedTenantResolver` fail-closed default (still exercised by `FailClosedStubs.test.ts`, still passes). Re-exports the three modules above so the existing barrel line covers them (see §4). |
| `test/unit/databox/tenant/TenantContext.test.ts` (**new**) | 8 tests (helpers + immutability). |
| `test/unit/databox/tenant/TenantBindingRegistry.test.ts` (**new**) | 12 tests (bindings + T-31 cross-tenant refusals). |
| `test/unit/databox/tenant/TenantResolver.test.ts` (**new**) | 13 tests (resolve + adversarial negatives T-01/T-02/T-31/T-06 + NotImplemented). |
| `test/unit/databox/tenant/TenantIsolationGuard.test.ts` (**new**) | 6 tests (T-54 TOCTOU drift). |

`src/databox/index.ts` was **NOT** edited (forbidden). No barrel edit is required — see §4.

## 2. Resolver + TenantContext + TOCTOU design

### Resolver algorithm (`RegistryTenantResolver.handle`, C5, runs BEFORE C4)
The **authoritative** tenant of a request is the tenant of the **target box** — taken from the protected
box→relationship map (DBX-10), which no presented credential can spoof. Every credential fact the request
carries must then agree with that one tenant:
1. Derive the opaque `boxId` from the (possibly attacker-rewritten) `target` path via `boxIdFromTarget`
   (path segment only, never a name/slug); fail closed if outside the box base or no segment.
2. `mapping.findByBoxId(boxId)` → the target's authoritative `{organisation, program}`; unknown box denies
   (identical to a box the caller may not see — T-01/T-06).
3. `bindings.findByTenant(...)` must exist (never default a tenant).
4. The request must carry ≥1 tenant-binding fact (audience/origin/service identity); a bare box target denies.
5. **Each presented fact must resolve to the SAME tenant** (`findByAudience`/`findByOrigin`/
   `findByServiceIdentity` + `sameTenant`): a fact bound to another tenant, or to none, denies
   — T-01 (audience/origin host-path swap), T-02/T-31 (service identity).
6. Box root must sit under the tenant's `storageNamespace` (ADR-0002 §3.2).
Success returns a **deep-frozen** `TenantContext` (`freezeTenantContext`) carrying `{tenantId, organisation,
program, boxId, boxRoot, relationshipId, origin?, audience?, serviceIdentity?}`.

**Non-leaking denial:** every failure throws one `NotFoundHttpError(TENANT_DENIED_MESSAGE = 'Not found.')`
— identical status+body to a non-existent box (ADR-0002 404-not-403; CR-SRV-02/03). The specific reason is
`logger.warn`-ed for the audit deny event only; it never reaches the response.

### Immutable TenantContext
`freezeTenantContext` recursively `Object.freeze`s the context; reassigning any field throws in strict mode.
This is the "carried immutably into the op" requirement — the resolved tenant cannot be re-pointed downstream.

### TOCTOU seam (T-54)
`TenantIsolationGuard.assertStillBound(context)` is called at the **store boundary** (C6, DBX-17 wiring) just
before the write. It re-resolves `findByBoxId(context.boxId)` **at execution time** and denies (same
non-leaking 404) if the binding vanished, was re-bound to another tenant, or had its relationship id / box
root changed since C5 resolved. This closes the resolve→execute race the immutable context alone cannot.

### No platform-wide data-plane credential (T-31)
`InMemoryTenantBindingRegistry.register` refuses to bind any origin/audience/service identity already held by
a different tenant (throws `InternalServerError`). So a single credential/fact **cannot** authorize two
tenants — the AT-31 "absence proof" is structural, not a runtime check that could be bypassed. Per-bridge
service identity is bound to exactly its program (ADR-0016 HD-13); `findByServiceIdentity` maps to ≤1 tenant.

## 3. Threats mitigated (tie-in to DBX-03 / CR-SRV)

- **T-01** (token host/path swap): target-derived tenant vs presented audience/origin must match; mismatch →
  non-leaking 404. Covered: program-A audience and program-A origin each denied against program-B's box. (CR-SRV-02)
- **T-02** (program-A bridge cred at program-B): service identity resolves to program A, box to program B →
  denied. (AT-02)
- **T-31** (platform-wide data-plane credential): structurally impossible — cross-tenant fact registration is
  refused; a fact resolving to no single tenant is denied. (CR-SRV-21, AT-31)
- **T-34** (admin cross-program graph): `tenantId` is a function of the two **opaque** provisioning ids only
  (no PII, no global key); `tenantIdOf` encodes separators so one scope cannot forge another's id. C5 carries
  no correlator across tenants. (Full admin-view scoping is downstream; C5 emits no cross-tenant identifier.)
- **T-54** (TOCTOU resolution↔store): immutable context + `TenantIsolationGuard` store-boundary re-validation.
  Covered: vanished / re-bound / relationship-changed / root-changed all denied. (CR-SRV-01, AT-54)
- **T-06** (enumeration): a guessed box id resolves to nothing and denies identically to a hidden box.

## 4. Barrel symbols (NO edit to `src/databox/index.ts` needed)

`src/databox/index.ts` and `src/index.ts` already contain `export * from './tenant/TenantResolver'` (resp.
`'./databox/tenant/TenantResolver'`). `TenantResolver.ts` now re-exports its three sibling modules:

```ts
export * from './TenantContext';
export * from './TenantBindingRegistry';
export * from './TenantIsolationGuard';
```

so **all** DBX-11 symbols propagate through the existing barrel line transitively — the stub replacement lands
via the existing `export *`, with `NotImplementedTenantResolver` retained. No central-owner barrel edit is
required (unlike DBX-10). New public symbols:
`TenantResolver` (abstract, unchanged), `RegistryTenantResolver`, `NotImplementedTenantResolver` (retained),
`TenantContext`, `TenantScope`, `TenantResolverInput`, `tenantIdOf`, `sameTenant`, `boxIdFromTarget`,
`freezeTenantContext`, `TenantBinding`, `TenantBindingRegistry`, `InMemoryTenantBindingRegistry`,
`TenantIsolationGuard`, `TENANT_DENIED_MESSAGE`.

## 5. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx jest test/unit/databox/tenant --coverage --collectCoverageFrom='src/databox/tenant/**/*.ts' --coverageReporters=text` | **PASS** — 4 suites, **39 tests**; **All files = 100%** stmts/branch/funcs/lines |
| `npx eslint src/databox/tenant test/unit/databox/tenant --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic deprecated option` notice) |
| `npx jest test/unit/databox/FailClosedStubs` (regression on retained stub) | **PASS** — 7 tests (`NotImplementedTenantResolver` still fails closed) |

```
File                      | % Stmts | % Branch | % Funcs | % Lines
TenantBindingRegistry.ts  |     100 |      100 |     100 |     100
TenantContext.ts          |     100 |      100 |     100 |     100
TenantIsolationGuard.ts   |     100 |      100 |     100 |     100
TenantResolver.ts         |     100 |      100 |     100 |     100
```

Per constraint 4: did NOT run `git add`/`commit`, `npm run build`, or `npm ci`.

## 6. Residual human adversarial-review gate — **DBX-26** (REQUIRED before merge)

This is security-critical, net-new tenancy code with no CSS precedent. A human adversarial reviewer MUST
confirm, before this is wired into any preset:
- **Response-parity / timing (CR-SRV-02/03):** the 404 denial is byte-identical AND timing-indistinguishable
  from a genuine non-existent box at the HTTP surface — the unit tests assert the error type/message, not the
  end-to-end wire response or a timing-oracle bound. This needs an integration/timing probe (AT-01/IT-01).
- **Pipeline placement:** C5 actually runs before the first `PermissionReader`/`Authorizer` in
  `AuthorizingHttpHandler`, and `TenantIsolationGuard.assertStillBound` is invoked at the store boundary on
  every mutating op — the seams exist here but the **wiring is not in this scope** (see §7).
- **Binding provenance:** in production the `TenantBindingRegistry` is populated from an access-audited
  control-plane source (not process-local config), and the `boxBase` matches the real deployment topology.
- **Deny-event emission:** the `logger.warn` reason is actually routed to the C13 evidence ledger deny event
  (a "tenant mismatch" reason), per CR-SRV-02, without leaking into the response.

## 7. What DBX-14 (composed authorizer — tenant is the FIRST conjunct) consumes

- **Input contract:** DBX-14's C4 conjunction (`tenant ∧ WAC ∧ …`, narrow-never-broaden) takes the
  **immutable `TenantContext`** produced by `RegistryTenantResolver` as its first, already-decided conjunct.
  C5 has already failed closed on any tenant mismatch before C4 runs; C4 must treat an absent/denied tenant as
  a hard `false` and never re-widen. C4 binds the WAC `PermissionMap` to `context.tenantId`/`boxRoot`.
- **TOCTOU:** DBX-14/DBX-17 must call `TenantIsolationGuard.assertStillBound(context)` at the store boundary
  (C6) so the tenant decision is re-validated at execution, not just at admission (T-54).
- **Wiring (out of DBX-11 scope):** injecting `RegistryTenantResolver` into the request pipeline ahead of
  `AuthorizingHttpHandler` (constructing `TenantResolverInput` from the CSS request: `target` from the
  operation identifier, `origin` from the Host/Origin, `audience`/`serviceIdentity` from the verified
  Credentials/enriched claims — via C3), and unioning C4 into `readers/default.json`, is DBX-14 + the
  Track-A/B preset wiring. `TenantBindingRegistry` population is a control-plane/provisioning concern.

## 8. Notes / limitations (honest)

- `InMemoryTenantBindingRegistry` is **process-local** config (mirrors DBX-10's in-memory registry); a
  production deployment swaps in a durable, access-audited store behind the interface. On restart, bindings
  reset — the interface is shaped for that swap.
- Tenant equality is `organisation ∧ program`. `boxIdFromTarget` does a prefix-and-segment parse of the target
  under a configured base; it is deliberately strict (rejects out-of-base, empty and `.`/`..` segments) and
  fails closed. It does not normalise URL encoding — the caller must pass a canonicalised target (the CSS
  pipeline already resolves the target identifier before this seam).
- This is the C5 **mechanism** (resolver + immutable context + binding registry + store-boundary re-validation
  seam). It does not itself hook into `AuthorizingHttpHandler` or the store decorator chain, nor emit the C13
  deny event — those are the wiring items flagged in §6/§7.
