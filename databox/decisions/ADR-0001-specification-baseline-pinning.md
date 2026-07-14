<!--
ADR — Databox decision register (DBX-02). Cluster: foundational — spec baseline.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0001 — Pinned specification baseline

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the compatibility manifest is signed, and the choice of signing key, snapshot integrity (commit hashes/digests) and the per-upgrade review checklist are security-sensitive and need a named security reviewer before the production manifest is frozen. The Working-Draft-vs-Recommendation labelling also carries legal-policy weight (public conformance statements) and should be sighted by the legal-policy workstream.
- **Sources adjudicated:** S-01; S-17 (snapshot/commit-hash review on upgrade); S-18 (dual-track claim, see ADR-0024); implementation-decisions.md "Solid interoperability requirement" (baseline-pinning paragraph); hackathon-profile.md "Fixed prototype baseline"; standards-roadmap.md (Standards governance, Two compatibility tracks, Conformance policy).
- **Consumed by / blocks prompts:** DBX-02 (every track-labelled ADR reads its exact citations from here); DBX-27 (conformance evidence is measured against this baseline); and every prompt that makes a "Solid" or "LWS" claim — DBX-01, DBX-05, DBX-09, DBX-24, DBX-28, HAK-01..HAK-12.
- **Relates to:** ADR-0024 (Track A / Track B separation and experimental isolation — this ADR fixes *what* is pinned; ADR-0024 fixes *how* the two tracks stay separate and graduate).

## Context

Every compatibility, conformance or interoperability claim the Databox makes is meaningless unless it names the exact, dated artefacts it was tested against. The specifications involved evolve: the Solid Protocol, Solid-OIDC, WAC and the Solid Notifications Protocol are living reports on solidproject.org/TR; the W3C Linked Web Storage (LWS) documents are **Working Drafts** whose "features, dependencies and wire formats can change" (standards-roadmap.md) and whose core draft "contains incomplete and feature-at-risk sections". A statement in a concept document is not evidence that CSS implements a mechanism (implementation-decisions.md Purpose); a Working Draft is likewise not evidence that CSS 7.1.9 implements LWS 1.0. DBX-01 §9 confirms this concretely: grepping CSS 7.1.9 for `token-exchange`, `8693`, `LWS`, `authorization_server` returns **zero matches** — the LWS surface is entirely net-new adapter work.

S-01 asks which dated Solid specifications, errata and conformance-test versions form the release baseline; its recommended direction is to "pin them in a signed compatibility manifest and review changes during upgrades". S-17 adds that upstream Solid/CSS changes must be adopted "without silently breaking compatibility" via a compatibility manifest, upstream-change watch and migration policy. S-18 requires the release to say whether it claims current-Solid compatibility, LWS 1.0 Working-Draft compatibility, or both, and to never merge those into an ambiguous claim. This ADR establishes the single authoritative pin that all of those downstream mechanisms reference. It fixes the *contents* of the pin; the two-track separation, graduation gates and experimental isolation are ADR-0024's concern.

## Decision

The Databox MUST maintain a **signed compatibility manifest** that pins the exact dated baseline of every specification, draft and dependency it claims to interoperate with. No ADR, config preset, conformance report or README may make a track-labelled claim except by citing an entry in this manifest. The manifest is versioned, signed, and re-reviewed on every upgrade.

The pinned baseline at adoption is:

1. **Implementation host.** Community Solid Server **7.1.9** (this repository; `package.json` `"version": "7.1.9"`, confirmed DBX-01 Baseline line). The manifest records the exact CSS version and, where a fix or behavior is load-bearing, the commit hash.

2. **Track A — deployed Solid ecosystem (production interoperability baseline).** The *current dated* reports used by deployed Solid/CSS clients, each cited by its solidproject.org/TR URL and the dated version in force at manifest-signing time:
   - Solid Protocol — `https://solidproject.org/TR/protocol`;
   - Solid-OIDC — `https://solidproject.org/TR/oidc`;
   - Web Access Control (WAC) — the authorization report CSS 7.1.9 ships (WAC is the adopted baseline surface per R-01 / ADR to be recorded; ACP is the deferred alternative);
   - Solid Notifications Protocol — `https://solidproject.org/TR/notifications-protocol`.
   The manifest records the *dated snapshot* of each (these reports evolve; a bare "Solid compatible" is prohibited — implementation-decisions.md).

3. **Track B — W3C Linked Web Storage 1.0 (pinned experimental Working Drafts).** The **June 2026 Working Draft snapshot** of the LWS Protocol 1.0 core (`https://www.w3.org/TR/lws10-core/`) plus the four LWS authentication-suite drafts at `www.w3.org/TR/lws10-*`:
   - OpenID Connect — `https://www.w3.org/TR/lws10-authn-openid/`;
   - SAML 2.0 — `https://www.w3.org/TR/lws10-authn-saml/`;
   - controlled identifiers — `https://www.w3.org/TR/lws10-authn-ssi-cid/`;
   - `did:key` — `https://www.w3.org/TR/lws10-authn-ssi-did-key/`.
   For each Track B document the manifest MUST record the **snapshot date and, where the draft moves under it, the commit hash / editor's-draft revision** reviewed (S-17), because a dated `/TR/` URL alone does not fix editor's-draft churn.

4. **Cross-cutting standards.** RFC 8693 (OAuth 2.0 Token Exchange) for converting an authentication credential into a short-lived, storage-audience access token; W3C Verifiable Credentials Data Model 2.0 secured with VC-JOSE-COSE using ES256 for the `DataboxConnectionCredential`; and Bitstring Status List for credential/grant status and revocation. Each is pinned by dated version in the manifest.

5. **Working-Draft honesty (mandatory labelling).** The manifest and every consuming artefact MUST state that the LWS documents in (3) are **Working Drafts, not W3C Recommendations**, that the core draft contains **incomplete and feature-at-risk** sections, and that a feature working is not a conformance claim. Track A and Track B assertions MUST NOT be merged into an ambiguous "Solid/LWS conformant" statement (S-18; enforced by ADR-0024).

6. **Per-upgrade review (S-17).** Every CSS, Solid-report or LWS-draft version change is a manifest event: the upstream-change watch flags the delta, a reviewer re-pins the snapshot date/commit hash, the regression suite runs against the new pin, and any behavior change is recorded with migration/deprecation notes. A later Working Draft **never silently changes** an already-deployed profile (the enforcement of this is ADR-0024).

## Alternatives considered

- **Cite specifications by bare name ("Solid Protocol", "LWS 1.0") without dated snapshots/commit hashes.** Rejected (S-01, S-17): the reports and drafts evolve; an undated citation makes every conformance claim unfalsifiable and lets an upstream change silently invalidate prior test evidence. The signed dated manifest is the whole point.
- **Pin only Track A now and defer Track B pinning until the drafts stabilise.** Rejected: the hackathon profile and the DBX-01..DBX-28 plan build Track B adapters *now* against the June 2026 drafts; those adapters need an exact pin to be testable and to be honestly labelled experimental. Deferring the pin would leave experimental code citing a moving target. Track B is pinned *and* marked experimental (ADR-0024), not omitted.
- **Treat the LWS Working Drafts as sufficiently authoritative to claim LWS 1.0 support.** Rejected-as-stated (standards-roadmap.md, S-18): the drafts are not Recommendations, contain feature-at-risk text, and DBX-01 §9 shows no LWS surface exists in CSS 7.1.9. Claiming LWS support would be a false assurance.
- **Keep the pin in prose scattered across design docs rather than one signed manifest.** Rejected: it defeats the single-source-of-truth requirement, makes upgrade review impossible to audit, and lets two documents drift to different pins.

## Consequences

- **Positive:** Every downstream ADR and conformance report cites one authoritative, signed, dated source; "which version did we test?" has a single answer. Upgrade review (S-17) becomes a bounded, auditable diff against the manifest. Honest Working-Draft labelling protects against a premature conformance claim and against the "collapse Track A and Track B" failure (S-18).
- **Negative / cost:** The manifest is real ongoing maintenance — every upstream release triggers a review-and-re-pin cycle, and Track B's editor's-draft churn means commit-hash tracking, not just dates. Signing introduces key-management overhead (residual security review).
- **Privacy & threat notes:** Low direct privacy surface. The threat closed is *false-assurance*: a client or auditor relying on a vague "Solid/LWS conformant" badge could assume guarantees the code does not provide. Pinning + labelling makes the actual, testable guarantee explicit. The signing key protects the manifest against tampering that would forge a conformance claim; its compromise is a security event (residual review).

## Failure behavior

Fail closed on ambiguity or missing pins:
- If a specification or dependency needed for a claim is **not** present in the signed manifest with a dated snapshot, the claim MUST NOT be made and any build asserting it fails its conformance gate rather than shipping an undated assertion.
- If the manifest signature does not verify, the release cannot publish a conformance claim; the manifest is treated as untrusted until re-signed by the named reviewer.
- If an upstream upgrade lands without a corresponding manifest re-pin and regression pass (S-17), the affected track's claim is automatically considered stale and MUST be withdrawn until reviewed.
- A Track B feature whose pinned draft has since changed materially is treated as experimental-unverified (ADR-0024 graduation gates apply); it is never silently re-pinned to a newer draft under a deployed profile.

## Open sub-questions / residual gates

- The **exact dated snapshot strings and commit hashes** for each Track A report and each Track B draft at release time are filled into the manifest by DBX-27 (conformance) at the moment of signing; this ADR fixes the *set* of artefacts and the pinning discipline, not the literal dates in force on a future release day.
- The **signing key, key custody and signature format** for the manifest are owned by DBX-27/DBX-28 under the named security reviewer.
- The concrete **upstream-change-watch tooling and regression-suite composition** (S-17) are owned by DBX-01/DBX-27/DBX-28; the *requirement* that they exist and gate upgrades is fixed here.
- The mechanism that keeps Track A and Track B assertions from merging (S-18) is specified in ADR-0024, not here.
- Everything required to identify *what is pinned and the discipline for pinning it* is fully specified for its scope in this ADR.
