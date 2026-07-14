# Handoff — DBX-09

**Prompt:** DBX-09 — Extension package scaffold
**Status:** complete (acceptance gate met: clean build/typecheck, lint clean on new files, new unit tests pass)
**Agent level:** Easy-to-Medium
**Date:** 2026-07-14
**Baseline:** Community Solid Server 7.1.9
**Depends on:** DBX-01 (extension map), DBX-02/ADR-0024 (experimental isolation = separate preset), DBX-04 (C1–C21 / IF-01–IF-20)

## 1. Chosen structure (STATED)

Self-contained Databox area following CSS conventions: a `src/<subsystem>/` tree, a mirrored
`test/unit/<subsystem>/` tree, and a `config/<area>/` preset area. Nothing outside these paths changed
except one additive block in the package barrel.

| Purpose | Location |
|---|---|
| Source (interfaces + fail-closed stubs) | `src/databox/` (subfoldered by component) + `src/databox/index.ts` barrel |
| Unit tests | `test/unit/databox/` |
| **Separate** Track B config preset (ADR-0024) | `config/databox/experimental.json` + `config/databox/preset/databox-experimental-components.json` |
| Public API export | additive "Databox" section in `src/index.ts` |

Rationale: mirrors `src/storage/` + `test/unit/storage/` + `config/storage/` exactly. No per-package
`componentsjs-generator` is needed — CSS's existing `build:components` (`componentsjs-generator -s src ...`)
already scans all of `src`, so `src/databox/**` classes are generated into the existing bundle automatically
(verified: 8 `css:dist/databox/*.jsonld` descriptors emitted, all 7 stub classes present in `context.jsonld`).

## 2. Exported interfaces / types + fail-closed stubs (from DBX-04, net-new per DBX-01 §8)

| DBX-04 | File under `src/databox/` | Interfaces / types (exported) | Fail-closed stub (never permits) |
|---|---|---|---|
| C3 | `context/DataboxRequestContext.ts` | `DataboxRequestContext`, `AssuranceContext`, `DelegationContext` | — (types only) |
| C3 | `context/AuthenticatedContextExtractor.ts` | `AuthenticatedContextExtractor` (abstract `AsyncHandler<HttpRequest, DataboxRequestContext>`) | `NotImplementedContextExtractor` → throws `NotImplementedHttpError` (never fabricates a context) |
| C5 | `tenant/TenantResolver.ts` | `TenantContext`, `TenantResolverInput`, `TenantResolver` (abstract handler) | `NotImplementedTenantResolver` → throws (never invents a default tenant) |
| C4 | `authorization/DataboxAuthorizer.ts` | `ComposedDataboxAuthorizer` (marker, `narrowNeverBroaden`) | `DenyAllDataboxPermissionReader` extends `PermissionReader` → returns **empty** `PermissionMap` (adds no `true`; narrow-never-broaden) |
| C6 | `storage/AppendOnlyStore.ts` | `AppendOnlyStore` (concrete `PassthroughStore` decorator) | create allowed; `setRepresentation` on an existing resource, `deleteResource`, `modifyResource` throw `ForbiddenHttpError` (fail closed on existence check) |
| C10 | `identifiers/OpaqueIdentifierGenerator.ts` | `OpaqueIdentifierGenerator extends IdentifierGenerator` | `NotImplementedOpaqueIdentifierGenerator` → `generate`/`extractPod` throw (never mints a guessable id) |
| C13/C19 | `evidence/Evidence.ts` | `EvidenceEvent`, `AcceptanceReceipt`, `EvidenceLedger` | `NotImplementedEvidenceLedger.append` throws (no false acceptance; ADR-0019 fail-closed) |
| C15 | `feed/CursorFeed.ts` | `CommittedEvent`, `CursorFeedPage`, `CursorFeed` | `NotImplementedCursorFeed.pull` throws (refuses to return an empty page that would mask a recovery gap) |

**No placeholder silently permits access or claims conformance.** Each either throws `NotImplementedHttpError`
or grants nothing (empty permission map / append-only deny). The composed authorizer is deliberately shaped as
a narrowing `PermissionReader` (DBX-01 §3) so an empty result can only ever deny.

## 3. Config preset (ADR-0024 — separate preset, NOT a runtime toggle)

- `config/databox/experimental.json` — top-level Track B preset. Imports `css:config/default.json` **plus** the
  Databox experimental components, layered via the `AppRunner` config **array** (or `-c`). The default/Track A
  config is untouched and does **not** import these components (ADR-0024 §2: a Track A deployment is provably
  free of experimental code from its launch config alone).
- `config/databox/preset/databox-experimental-components.json` — declares the six seam instances as named
  `urn:solid-server:databox:*` nodes wired to the fail-closed stub `@type`s. They are **declared but NOT yet
  spliced** into the core `PermissionReader` union or the store middleware chain (that is DBX-14 / DBX-17), so
  loading the preset does not mutate any Track A representation (ADR-0024 §3 / S-25). Both JSON files validated
  as parseable and all referenced `@type`s exist in the generated `context.jsonld`.

## 4. Commands run + results

Dependencies were not installed in the checkout; ran `npm ci` first (installed 1379 packages; its `prepare`
hook ran a full build clean). Then, explicitly:

| Command | Purpose | Result |
|---|---|---|
| `npm run build` (`build:ts` = `tsc`, then `build:components` = `componentsjs-generator`) | source compile + Components.js generation | **PASS** (exit 0; 8 `dist/databox/*.jsonld` descriptors generated) |
| `npm run test:ts` (`tsc -p test --noEmit`) | typecheck tests | **PASS** (exit 0) |
| `npx jest test/unit/databox` | new unit tests | **PASS** — 2 suites, **12 tests** |
| `npx eslint src/databox test/unit/databox --max-warnings 0` | lint new files | **PASS** (exit 0; one pre-existing stylistic *deprecation notice* from the shared config, not an error) |

Tests: `test/unit/databox/storage/AppendOnlyStore.test.ts` (create-yes / replace-delete-modify-no) and
`test/unit/databox/FailClosedStubs.test.ts` (every stub throws `NotImplementedHttpError` or grants nothing).

## 5. What DBX-06 (institution profile schema) MUST build ON TOP of this scaffold (no collision)

- **Do NOT re-create these files/paths.** DBX-06 adds its own files under `src/databox/` (suggest a new
  `src/databox/profile/` subfolder) and `test/unit/databox/profile/`; it must not redefine C3/C4/C5/C6/C10/C13/
  C15 names above.
- **Consume, don't fork, the context type.** The trusted-issuer / assurance-crosswalk inputs DBX-06 defines feed
  **into** `AssuranceContext` / `DataboxRequestContext` (C3). Extend by composition (new interfaces that produce
  or validate an `AssuranceContext`), not by editing `context/DataboxRequestContext.ts`.
- **Institution profile → provisioning, not identifiers.** DBX-06's institution/program profile schema binds to
  `TenantContext` (C5) and the provisioning seam; the opaque box identifier remains `OpaqueIdentifierGenerator`
  (C10) — DBX-06 supplies profile/policy inputs, DBX-10 supplies the CSPRNG generator. Keep them separate.
- **Preset extension, not default mutation.** Any DBX-06 components that are experimental (Track B) attach to
  `config/databox/preset/databox-experimental-components.json` (or a sibling preset file imported by
  `experimental.json`); they MUST NOT be added to `config/default.json` (ADR-0024).
- **Evidence/receipt binding.** DBX-06's policy-version / attestation identifiers are the values later bound
  into `AcceptanceReceipt.policyDigest` (C13/C19) — reuse those field names rather than introducing parallel
  receipt types.
- **Barrel discipline.** New exports go in the `src/databox/index.ts` barrel and the "Databox" section of
  `src/index.ts` (keep the section alphabetized to satisfy lint).

## 6. Notes / limitations (honest)

- The stubs are **scaffold placeholders**: they compile, generate Components.js descriptors, and fail closed —
  they do **not** implement any Databox behavior. Real construction is owned by the named prompts
  (DBX-10/11/12/14/17/18/19/21).
- The experimental preset was **not** run through `componentsjs-compile-config` (that needs a full instance
  graph and is not part of this scaffold's gate). It is a valid, importable JSON-LD stub with resolvable
  `@type`s; DBX-14/DBX-17 complete the actual splice + an integration test (`test/integration` pattern).
- `src/index.ts` gained one additive "Databox" export section; no existing export or config was modified.
