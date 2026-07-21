# Handoff — DBX-01

**Prompt:** DBX-01 — Repository and extension inventory
**Status:** complete (acceptance gate met; see extension-map §12)
**Agent level:** Medium
**Date:** 2026-07-14
**Baseline:** Community Solid Server 7.1.9

## Commits / changed files

No production code changed (prompt requires none). Artifacts added under `databox/`:

- `databox/dbx-01-extension-map.md` — the extension map (primary artifact).
- `databox/handoffs/DBX-01.md` — this record.

Not yet committed to git (the whole `databox/` tree is currently untracked).

## Decisions consumed

- `hackathon-decisions.md` **HD-03** (WAC for the hackathon) — drove the §2 WAC-narrowing finding.
- `hackathon-profile.md` fixed baseline (CSS 7.1.9, LWS 1.0 June 2026 WD, RFC 8693, VC 2.0) — drove §9.
- Invariants 3, 4, 7, 12, 17 (README) — mapped to specific CSS seams in §3/§4/§8.

## Decisions created

None (an inventory prompt does not create binding decisions). Four items **escalated to DBX-02** —
see extension-map §13:

1. Where the composed authorizer carries client/issuer/assurance given WAC discards them (HD-03 tension).
2. Experimental isolation must be a separate config preset (CSS has no feature flag).
3. Connection credential must deliberately diverge from CSS's *bearer* client-credentials toward a
   holder-key-bound non-bearer VC.
4. New-dependency pinning: VC-JOSE-COSE/ES256, RFC 8693, ODRL/SHACL.

## Commands / test results

Read-only inspection only (Glob/Grep/Read across `src/`, `config/`, `test/`, `documentation/`,
`package.json`, git log). No build/test run — no code changed. Three load-bearing seams opened and
confirmed verbatim: `src/authentication/Credentials.ts`, `src/storage/ReadOnlyStore.ts`,
`src/authorization/PermissionBasedAuthorizer.ts:63-99`.

## Security assumptions

- Cryptographic Solid-OIDC/DPoP verification is trusted to the external `@solid/access-token-verifier`
  package; CSS does not verify tokens itself. Databox threat modelling (DBX-03) must treat that package
  as a trusted dependency in scope.
- CSS accepts **any** cryptographically valid issuer (no allowlist) — an assumption DBX-06/DBX-12 must
  tighten before production.
- The 404-not-403 existence-hiding rule (`PermissionBasedAuthorizer.reportAccessError`) is relied upon
  for invariant 3; Databox denial paths must not regress it.

## Unresolved questions (block dependents until DBX-02 resolves)

Same as "Decisions created → escalated" above. None blocks starting DBX-02/03/04; all block final
contract shape of DBX-06, DBX-12, DBX-13, DBX-14.

## Exact artifacts available to dependent prompts

- **DBX-02 (decision register):** extension-map §13 gives the four decisions to adjudicate first;
  §2/§3/§9 give the technical constraints each decision must respect.
- **DBX-03 (threat model):** §2 (claim loss), §3 (denial/existence rule), §6 (no durable delivery, no
  SSRF guard), §5 (server-wide OIDC/JWK, no tenant isolation) are the attack-surface seeds; the "build"
  rows in §8 are the untrusted-by-default new surfaces.
- **DBX-04 (reference architecture):** §1 request spine, §8 reuse/wrap/replace table and §11 candidate
  seams define which CSS components each new component wraps and where trust boundaries fall.
- **DBX-09 (scaffold):** §7 (Components.js module mechanics, `AppRunner` config array, separate preset),
  §10 dependency list, §7 test pattern (`test/integration/FileBackend.test.ts` model).
- **HAK-01 (adapter spike):** §4 media-type + storage-description seams; §1 request trace.
