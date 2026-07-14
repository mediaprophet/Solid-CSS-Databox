# Handoff — DBX-03

**Prompt:** DBX-03 — Threat model and abuse cases
**Status:** complete (acceptance gate met; see threat-model §7 + §10)
**Agent level:** Hard (lead author + independent Hard red-team pass)
**Date:** 2026-07-14
**Depends on:** DBX-01, DBX-02 (accepted)

## Commits / changed files

Artifacts added under `databox/` (no production code — DBX-03 is a threat model):

- `databox/dbx-03-threat-model.md` — trust-boundary diagram (B1–B10), attacker profiles, threat register
  (T-01…T-58), control mapping, invariant→threat→verification coverage matrix, residual-risk register,
  trusted-dependency assumptions, and the record of the independent red-team pass.
- `databox/dbx-03-adversarial-test-backlog.md` — AT-01…AT-58, one test per threat, for DBX-25/26/27.
- `databox/handoffs/DBX-03.md` — this record.

On branch `databox-implementation`.

## Method / provenance

Hard lead authored the backbone (10 boundaries, 46 threats, coverage matrix, 46 tests). An **independent**
Hard (Opus) red-team agent then attacked the coverage on five axes and produced 12 concrete gaps; all were
incorporated verbatim as **T-47…T-58 / AT-47…AT-58**, boundary **B10** (KMS custody), and residual-risk
additions. The red-team is the model-level verification the acceptance gate asks for; per-threat
verification is the AT backlog. This is *not* the reproduce-the-P1-negatives review — that is DBX-26.

## Decisions consumed

- All 12 README invariants (coverage target); every ADR-0001…0025 (controls cite them); isolation-and-privacy.md
  (5 base boundaries + 10 threat cases), identity-and-access.md, exchange-and-evidence.md, architecture.md
  (control/data plane); DBX-01 extension map (net-new-control gaps).

## Decisions created

None (a threat model creates no binding decisions). It **surfaces** control requirements that DBX-04…DBX-26
must implement, and it flags two items that feed back into decisions:
- **B10/KMS custody separation** and **T-58 module integrity** argue for an explicit key-management +
  supply-chain control set — owned by DBX-28, but DBX-04 architecture should show KMS as a distinct trust
  boundary.
- **T-49 revocation latency** confirms ADR-0009's per-request re-check must apply to sensitive grades, not
  only token expiry — DBX-12/DBX-14 must implement it.

## Commands / test results

None — no code changed. Verification is documentary + adversarial: the coverage matrix (§7) is
self-checked (every invariant ≥1 threat + AT); the independent red-team pass (§10) is the completeness
check. No AT has been executed yet — execution is DBX-25 (positive) / DBX-26 (negative).

## Security assumptions (carried, for DBX-26/27 to revisit)

- `@solid/access-token-verifier`, the TLS stack, and the RDF/JSON-LD parser (within bounded-parsing
  controls) are trusted; their compromise is out of scope (§9).
- The Components.js **runtime** is trusted but **module/preset integrity is now in-scope** (T-58).

## Residual risks (accepted, with owner) — see threat-model §8

Custodian-profile provider read (T-30), full IdP compromise (T-14), key-compromise detection window
(T-20/33), statistical correlation (T-03/10), deferred malware scanner (T-22), coercion of the human
(T-44), Blocked RFC 8693 detail (T-15), broker SPOF (T-41), revocation-latency window (T-49), guardianship
detail (T-47), consumer-agent quality (T-51), status-list herd privacy (T-56), supply-chain (T-58).

## Exact artifacts available to dependent prompts

- **DBX-04 (architecture):** the boundary diagram (B1–B10) and the control mapping (§5) define which
  component enforces which control and where trust boundaries fall; T-54 (TOCTOU) and B10 (KMS) are
  architecture constraints.
- **DBX-05 (conformance):** every T/AT is a candidate conformance requirement; the ⚠ net-new controls (§6)
  need explicit executable requirements.
- **DBX-11 (tenant isolation):** T-01,02,04,31,34,54 + AT are the adversarial spec; provider-as-adversary
  (T-30…34) is in scope.
- **DBX-12/13/14 (identity/authz):** T-12…20, T-47…49, T-52 + AT; T-49 mandates per-request re-check.
- **DBX-15/16/17/19 (exchange/evidence):** T-21…29, T-50, T-55, T-57 + AT.
- **DBX-21 (notification/outbox):** T-38,39,40 + AT (SSRF, durability, flood).
- **DBX-24 (consumer agent):** T-51 defines the agent safe-behaviour contract (inert records, no
  auto-submit).
- **DBX-25/26 (integration/adversarial):** the whole AT backlog; DBX-26 must reproduce every P1.
- **DBX-28 (release):** T-58 supply-chain + B10 KMS + SBOM/hardening.
