# Handoff — DBX-12

**Prompt:** DBX-12 — Authenticated request context (component C3, DBX-04 §2/§6; IF-03)
**Status:** complete (typecheck clean in scope, lint clean, 100% coverage on `src/databox/context/**`).
**Agent level:** Hard. **Baseline:** Community Solid Server 7.1.9.
**Depends on:** DBX-01 (§2 claim-loss), DBX-04 (C3/IF-03; authoritative-state matrix), DBX-06 (institution
profile: `AssuranceDimension`/`ASSURANCE_DIMENSIONS`), DBX-09 (context scaffold).
**Decisions honoured:** ADR-0010 (assurance vocabulary/crosswalk), ADR-0005 (broker/issuer trust),
ADR-0006 (sender-constraint — delegated to CSS), ADR-0004 (pairwise/typed identifiers), ADR-0003 (WAC
discards client/issuer → Databox must re-carry them).

> **RESIDUAL HUMAN SECURITY/IDENTITY REVIEW GATE (open):** the claim→assurance crosswalk is a
> forgery/escalation surface (ADR-0010 review-required; ADR-0005 token-exchange trust boundary). Before
> production, a human identity+security reviewer MUST (a) verify the crosswalk's real cryptographic
> signature (here only its *presence* is enforced — see "provisional seam"), (b) confirm the per-program
> approved-issuer list and claim contract, and (c) re-run the forged/unapproved negatives. This handoff
> does NOT clear that gate.

## 0. Independent security-review fixes applied (round 2)

An independent security review raised six findings; findings 2–6 are fixed in code, finding 1 is the
documented provisional seam.

| # | Sev | Fix in `src/databox/context/` |
|---|---|---|
| **1** | — | *Provisional seam, unchanged behavior.* The crosswalk signature is only checked for **presence**, NOT cryptographically verified. Comment (`AssuranceCrosswalk.ts` constructor) + the gate above state a detached-signature verification against a pinned per-program key MUST clear before production. |
| **2** | MED | **Subject binding.** `AuthenticatedContextExtractor` now rejects (`BadRequestHttpError`) when a `verifiedClaims.webId`/`clientId` is present, the corresponding CSS-verified `credentials.agent.webId`/`client.clientId` is present, and they mismatch (cross-subject confused deputy, T-14) — via `assertSubjectMatch`. Identity is ALWAYS sourced from the CSS-verified credentials, never from the enriched claims. |
| **3** | MED | **No context from claims alone.** The enriched path now **requires** a CSS-verified `credentials.issuer` AND a CSS-verified subject (WebID or client); a `VerifiedClaimSet` with unbacked/empty credentials fails closed (reject). Broker verification obligation documented as a hard precondition in the class doc, not a naming convention. |
| **4** | LOW | **deepFreeze null guard.** Guard is now `value && typeof value === 'object'`, so `null`/`undefined`/primitives short-circuit and `Object.values` is never called on `null`. |
| **5** | LOW | **Presence-match tightening.** `SignedAssuranceCrosswalk.derive` filters empty strings before the presence check, so a claim present as `''` cannot satisfy a presence dimension. |
| **6** | LOW | **Admission robustness.** The crosswalk document is validated as a raw record (`requireString`/`requireArray` + per-entry checks); absent/wrong-typed `signature`/`entries`/`approvedIssuers`/entry fields raise `InternalServerError`, never a raw `TypeError`. |

New rejection branches each have a test (see §7 count: 41 tests). Every gate re-run at 100% (§7).

## 1. Files

| File | Change | Purpose |
|---|---|---|
| `src/databox/context/DataboxRequestContext.ts` | **extended** | Immutable typed context: added `AssuranceDimensionLevels`, per-dimension `dimensions` + `crosswalkVersion` on `AssuranceContext`, and top-level `authTime`, `actor`, `representedEntity` (distinct from `delegation`). |
| `src/databox/context/AssuranceCrosswalk.ts` | **new** | `VerifiedClaimSet`, `AssuranceCrosswalkEntry/Document`, `SignedAssuranceCrosswalk` (admission + `derive`), `LOWEST_ASSURANCE_GRADE`. |
| `src/databox/context/AuthenticatedContextExtractor.ts` | **replaced stub** | Real `VerifiedAssuranceContextExtractor` + `AuthenticatedContextInput`; kept abstract `AuthenticatedContextExtractor` (now `AsyncHandler<AuthenticatedContextInput, …>`) and the fail-closed `NotImplementedContextExtractor`. |
| `test/unit/databox/context/AssuranceCrosswalk.test.ts` | **new** | Admission + derivation branch tests. |
| `test/unit/databox/context/AuthenticatedContextExtractor.test.ts` | **new** | Extractor claim-validation tests. |

Barrel/config untouched (constraint 1). See §7 for symbols a follow-up must add to `src/databox/index.ts`.

## 2. Context type + extractor design

**Type (C3, immutable).** `DataboxRequestContext` carries only verified values: `webId`, `clientId`,
`issuer`, `audience`, `authTime`, `assurance` (six ADR-0010 dimensions normalized as
`AssuranceDimensionLevels` = `Record<AssuranceDimension, number>`, `0` = lowest), `actor` vs
`representedEntity` (kept DISTINCT — architecture.md), and `delegation` (`onBehalfOf` + `grantRef`). The
assembled object is **deep-frozen** at construction, so no authorizer/operation/audit layer can mutate a
claim (the immutability IF-03 requires).

**Extractor.** `VerifiedAssuranceContextExtractor(crosswalk)` : `AsyncHandler<{credentials, verifiedClaims?}, DataboxRequestContext>`.
Input is an **already-verified** CSS `Credentials` (webId/client/issuer — the DPoP/sender-constraint proof
stays in `@solid/access-token-verifier`; we never re-implement crypto) plus an optional enriched
`VerifiedClaimSet` (audience, authTime, signed assurance/actor/on-behalf-of claims the broker C9 carries
because CSS drops them, DBX-01 §2).

## 3. How assurance is derived (and fails closed)

- Assurance is built **only** from the `VerifiedClaimSet` (cryptographically verified). A request header or
  an unverified JWT decode is never consulted — an injected `acr` on the credentials bag is structurally
  invisible.
- `SignedAssuranceCrosswalk` is admitted only if version == expected, signature reference present, every
  entry names a known dimension and a non-negative integer level — else it refuses to evaluate (ADR-0010
  "unknown crosswalk version → fail closed").
- `derive(issuer, claims)` starts **all six dimensions at 0** and only raises one when a verified claim
  from that issuer matches a crosswalk row (exact-value or presence). Unmapped/novel claims contribute
  nothing → they can never escalate a grade. `methodRefs` records which claims fired (audit traceability).
- No enriched claims → lowest assurance but the conforming Solid-OIDC path is preserved (webId/client
  still returned). Enriched issuer ≠ credential issuer → reject. Issuer not program-approved → reject.

## 4. Threats mitigated (DBX-03)

| Threat | Mitigation here |
|---|---|
| **T-12** forged assurance/actor | Assurance only from verified claims; injected header/field ignored; unmapped fails closed. Tests: *header/field injected → lowest*, *unmapped → lowest*. |
| **T-13** unapproved/mismatched issuer | `assertApprovedIssuer` + credential-vs-claim issuer equality; both reject. Tests present. |
| **T-14** wrong-human | `actor` vs `representedEntity` kept distinct; assurance never selects a customerID (no linking here). |
| **T-47** guardian scope | Delegation carried as a *claim* only (`grantRef`); C3 never authorizes — grant scope/status is C4/C9 per-op. |
| **T-48** recovery downgrade | Per-dimension normalized levels (not one LoA) let C4 require ≥ original grade; nothing here upgrades. |

## 5. Provisional RFC 8693 seam (Blocked, ADR-0005)

The subject/actor-token wire binding is **BLOCKED**. Modelled, not resolved: `VerifiedClaimSet.actor` /
`onBehalfOf` / `delegationGrantRef` are carried into `actor` / `representedEntity` / `delegation` as
verified *claims*; the extractor performs **no** token-exchange and grants **no** authority. When the ADR
unblocks, the broker (C9/IF-01) populates these fields; this type and extractor do not change shape.

## 6. Barrel symbols (constraint: `src/databox/index.ts` NOT edited — a follow-up must add)

`./context/DataboxRequestContext` already re-exported → now also exports `AssuranceDimensionLevels`.
`./context/AuthenticatedContextExtractor` already re-exported → now also exports
`VerifiedAssuranceContextExtractor`, `AuthenticatedContextInput` (and still `NotImplementedContextExtractor`,
`AuthenticatedContextExtractor`). **New file NOT yet in the barrel** — add:
`export * from './context/AssuranceCrosswalk';` (exports `SignedAssuranceCrosswalk`,
`LOWEST_ASSURANCE_GRADE`, `VerifiedClaimSet`, `AssuranceCrosswalkEntry`, `AssuranceCrosswalkDocument`).
The DBX-09 config node `urn:solid-server:databox:AuthenticatedContextExtractor` still points at
`NotImplementedContextExtractor`; wiring `VerifiedAssuranceContextExtractor` (with a crosswalk instance) is
a later config/integration step (not done here — no barrel/config edits permitted).

## 7. Commands + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0, whole project; 0 errors in `src/databox/context`). |
| `npx eslint src/databox/context test/unit/databox/context --max-warnings 0` | **PASS** (exit 0; only the shared-config `@stylistic` deprecation *notice*, ignored per prompt). |
| `npx jest test/unit/databox/context --coverage --collectCoverageFrom='src/databox/context/**/*.ts' --coverageReporters=text` | **PASS** — 2 suites, **41 tests**. Coverage **100%** stmts/branch/funcs/lines on `AssuranceCrosswalk.ts` and `AuthenticatedContextExtractor.ts` (`DataboxRequestContext.ts` is types-only → no executable code). |

## 8. What DBX-13 (credential) and DBX-14 (authorizer) consume

- **DBX-14 (composed authorizer C4)** reads the immutable `DataboxRequestContext`: compares
  `assurance.dimensions` per-dimension against the record/submission class `minimumAssurance`
  (`InstitutionProfile`), and treats absent assurance / a `0` dimension as fail-closed → deny + step-up
  (IF-20). It re-checks `delegation.grantRef` scope/status per-op (T-47) and uses `actor`/`representedEntity`
  distinctly. It must NEVER re-derive assurance from headers — only from this context.
- **DBX-13 (credential/status)** owns the delegation/guardianship **grant** format behind
  `delegation.grantRef` and the pairwise-identifier binding (ADR-0004) behind `webId`/`actor`; it feeds the
  broker (C9) that produces the `VerifiedClaimSet` this extractor consumes. DBX-13 also resolves the Blocked
  RFC 8693 wire binding (§5) and the real crosswalk-signature verification named in the residual gate (§ top).
