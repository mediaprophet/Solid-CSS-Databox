# Handoff — DBX-02

**Prompt:** DBX-02 — Normative decision register
**Status:** complete (acceptance gate met; see decisions/README.md §8)
**Agent level:** Hard (lead + parallel Hard drafters; independent Hard/human reviews are residual — see below)
**Date:** 2026-07-14
**Depends on:** DBX-01 (accepted)

## Commits / changed files

Artifacts added under `databox/` (no production code — DBX-02 is a decision register):

- `databox/decisions/README.md` — the decision index + coverage matrices + Blocked-items list (primary artifact).
- `databox/decisions/ADR-TEMPLATE.md` — canonical ADR template.
- `databox/decisions/ADR-0001…ADR-0025-*.md` — 25 ADRs, one per decision.
- `databox/handoffs/DBX-02.md` — this record.

On branch `databox-implementation`. Not yet committed.

## Method / provenance

Hard lead (Opus) authored the security-critical identity/auth cluster (ADR-0003…0010) directly. Three
parallel Hard (Opus) drafters produced the exchange/evidence (0011, 0018–0022), policy/integration/legal
(0012–0017, 0023) and foundational/standards (0001, 0002, 0024, 0025) clusters against a fixed template,
fixed ADR numbers and source-mapping. Lead reviewed all 25 for template conformance and cross-reference
integrity; spot-verified the two gap-ADRs (0021 encryption, 0022 binary) and both Blocked ADRs (0015, 0005)
in full. This is the "one Hard lead + independent drafters" shape; it is **not** the independent-reviewer or
human domain review that security/crypto/legal ADRs still require (§residual gates below).

## Decisions consumed

- DBX-01 extension map — every ADR that touches CSS reality cites it (WAC drops client/issuer → ADR-0003;
  slug pod IDs → ADR-0002/0004; ReadOnlyStore seam → ADR-0018; no feature flag → ADR-0024; no SSRF/cursor
  → ADR-0011; client-credentials is bearer → ADR-0007; 404-not-403 → ADR-0025).
- Source registers: implementation-decisions.md (review items 1–18, S-01…S-27), dbx-recommended-decisions.md
  (R-01…R-14), hackathon-decisions.md (HD-01…HD-16), and the design docs.

## Decisions created

25 ADRs. Full status breakdown in decisions/README.md §2. Notably **Rejected-as-stated** replacements were
preserved for review items 5, 9, 11, 12, 17, 18 and the single-choice framing of 16.

## Commands / test results

None — no code changed. Verification was documentary: directory listing confirmed all 25 ADRs present; four
highest-risk ADRs read in full; coverage matrices built and self-checked (README §8).

## Security assumptions

- The Databox authorization server/broker (ADR-0005) is a trusted, separately deployed component and the
  highest-value target; DBX-03 must model it explicitly.
- `@solid/access-token-verifier` remains the trusted crypto boundary for Solid-OIDC/DPoP (from DBX-01).
- The assurance crosswalk (ADR-0010) and the compiled-policy bundle signer (ADR-0015) are security-critical
  config; forged-claim and unsigned-bundle negatives are mandatory tests (DBX-12/DBX-20).

## Unresolved questions (Blocked) — block only the listed dependents

1. **RFC 8693 subject/actor-token binding of credential+holder-proof** (ADR-0005) → blocks DBX-12 and the
   unattended-sync path of HAK-04. Owner: DBX-12/DBX-13.
2. **Provider-blind encryption profile** (ADR-0021) → blocks only that profile. Owner: ADR-0002 + R-12 legal
   + named security reviewer.
3. **Legal-compliance release gate** (ADR-0015) → blocks only a legal-compliance release claim + the CDR
   profile (ADR-0023). Owner: separate Hard legal-policy prompt via DBX-07 + human legal attester. Technical
   work on synthetic policies is **not** gated.

Everything else is Adopted/Profile-choice and unblocks its dependents now.

## Residual human/independent review gates (must clear before dependent production code is accepted)

- **security/identity:** ADR-0002, 0003, 0004, 0005, 0006, 0007, 0008, 0009, 0010 (human security/identity
  review; independent Hard review of the authz composition at DBX-14; adversarial tenant review at DBX-11/26).
- **cryptography:** ADR-0006, 0007, 0015, 0020 (human crypto review).
- **legal-policy:** ADR-0015, 0021, 0023 (human policy review).

DBX-02 does not self-certify these; it records them as gates the relevant prompts must satisfy.

## Exact artifacts available to dependent prompts

- **DBX-03 (threat model):** ADR-0005 (broker trust boundary), ADR-0002 (control/data plane, opaque IDs),
  ADR-0011 (SSRF/durability), ADR-0021 (infrastructure threat), plus each ADR's "Privacy & threat notes".
- **DBX-04 (reference architecture):** ADR-0002, 0005, 0016 (component/trust boundaries), ADR-0006 (Track A/B
  adapters), ADR-0011 (authoritative-state), ADR-0024 (separate-preset isolation).
- **DBX-05 (conformance):** ADR-0025 (interop guarantees) + ADR-0001 (pinned baseline) + ADR-0024 (track
  separation) are the requirement sources.
- **DBX-06 (institution profile schema):** ADR-0005 (issuer/claim contract), ADR-0010 (assurance crosswalk),
  ADR-0014 (policy effective-time), ADR-0023 (redress routes).
- **DBX-07 (vocabulary/ODRL):** ADR-0012 (duty catalogue), ADR-0013 (conflict/precedence), ADR-0015
  (compiled-policy interface + WebCivics mapping ownership).
- **DBX-09 (scaffold):** ADR-0024 (separate config preset is the experimental-isolation mechanism) is the key
  input; ADR-0002 topology.
- **DBX-10..0014 (identity/authz):** ADR-0002, 0003, 0004, 0007, 0008, 0009, 0010, 0016 are their contracts.
- **HAK track:** ADR-0003 (WAC), 0006/0007 (auth suites + credential), 0011 (cursor), 0012 (two duties),
  0016/0017 (integration + submission), 0018/0019 (append-only + receipts).
