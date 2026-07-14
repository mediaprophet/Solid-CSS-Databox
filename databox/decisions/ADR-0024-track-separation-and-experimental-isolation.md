<!--
ADR — Databox decision register (DBX-02). Cluster: foundational — standards tracks.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0024 — Track A / Track B conformance separation and experimental isolation

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the graduation gate for a Track B feature requires a named security/privacy reviewer sign-off (S-27), and the "separate config preset" isolation mechanism has a security consequence (a misassembled config must not silently enable experimental behavior on a Track A deployment); this needs a named reviewer before any Track B preset ships to production.
- **Sources adjudicated:** R-13 (separate Track A / Track B manifests, never merged); S-17 (adopt upstream change without silent breakage); S-18 (dual-track claim, never merged); S-25 (LWS media types / storage-descriptions / operations coexist via versioned adapters, must not change a Track A representation by enabling Track B); S-26 (incomplete LWS notification text is not the durable contract); S-27 (Working-Draft-feature maturity gate); standards-roadmap.md (Two compatibility tracks, Conformance policy); DBX-01 §7 (no feature-flag mechanism) and §9 (LWS gap).
- **Consumed by / blocks prompts:** DBX-09 (scaffold — the separate-preset isolation shape is an input), DBX-27 (conformance manifests and interop), DBX-28 (upgrade/deprecation policy).
- **Relates to:** ADR-0001 (pinned baseline — this ADR governs how the two pinned tracks stay separate and graduate), ADR-0025 (Track A interoperability guarantee that must survive enabling Track B), ADR-0011 (LWS notification text deferred there per S-26).

## Context

ADR-0001 pins *what* Track A (deployed Solid/CSS) and Track B (June 2026 LWS Working Drafts) are. This ADR fixes *how they stay separated* and *how a Track B feature earns the right to be relied upon*. R-13 requires two manifests that are never collapsed into an ambiguous "Solid/LWS conformant" claim. S-18 forbids merging Track A and Track B assertions. S-25 requires that LWS media types, storage descriptions, containers and operations coexist with the CSS Solid/LDP surface via versioned adapters and capability negotiation, and — critically — that enabling Track B **must not change a Track A resource representation**. S-26 rules that the incomplete LWS notification text cannot be the durable Databox contract (deferred to ADR-0011). S-27 sets the maturity gate: feature-flag and pin Working-Draft features and require migration review, traceable tests, independent interoperation and security/privacy/accessibility/i18n review before graduation. standards-roadmap.md Conformance policy adds that "a later Working Draft never silently changes the behavior of an already deployed profile."

The hard constraint is a CSS 7.1.9 reality from **DBX-01 §7**: **CSS has no runtime feature-flag or experimental-module mechanism.** Grepping `config/` and `src/` for `experimental`/`feature-flag` returns none; "the only 'optional' mechanism is whole-config swaps (`file-acp.json` vs `default.json`)." The only isolation primitive is **Components.js whole-config composition**. So the everywhere-repeated instruction to keep Track B "feature-flagged / isolated behind an adapter" **cannot** be realised as a runtime toggle inside `default.json`. DBX-01 §7 already flags for DBX-02 that "isolated behind an adapter" must mean a **separate Databox config preset** (its own top-level config importing the LWS adapter components), and DBX-01 §8/§11 confirm the ship mechanism: a Components.js module plus `AppRunner.create({ config })` where `config` accepts an **array** of paths to merge presets. This ADR adopts that explicitly and hands it to DBX-09 as the scaffold shape.

## Decision

**1. Two manifests, never merged (R-13, S-18).** The Databox MUST maintain **separate Track A and Track B conformance manifests** (both pinned per ADR-0001). Every conformance/interop statement MUST name its track. The product MAY implement both through adapters, but MUST NEVER publish a merged or ambiguous "Solid/LWS conformant" claim. Track A is the production interoperability baseline; Track B is experimental until it graduates per gate (4).

**2. Experimental isolation IS a separate config preset — NOT a runtime toggle (DBX-01 §7, adopted mechanism).** Because CSS 7.1.9 has no runtime feature flag and the only isolation primitive is Components.js whole-config composition, "feature-flagged / isolated behind an adapter" is realised as follows and MUST be built this way:
   - Track B ships as a **separate top-level Databox config preset** (e.g. a `databox-lws-experimental` config) that `import`s the LWS adapter Components.js components (media-type converter, storage-description/authorization-server advertiser, RFC 8693 token-exchange, access-request/grant, connection-credential components), layered over the base CSS config via the `AppRunner` config **array** (DBX-01 §8/§11).
   - The default / Track A deployment config **MUST NOT import** the LWS adapter components. There is no in-`default.json` boolean that turns Track B on; enabling Track B is choosing the experimental preset at server assembly time.
   - Each Track B adapter is **version-pinned** (ADR-0001) and **advertised as experimental** in its storage/capability description so a client can tell experimental capabilities from Track A ones.
   - This is stated explicitly as the adopted mechanism and is flagged as an **input to the DBX-09 scaffold**, which MUST assume the separate-preset shape (not a toggle).

**3. Coexistence without mutating Track A (S-25, MUST).** LWS media types (`application/lws+json`), storage descriptions, containers and operations coexist with the CSS Solid/LDP surface through **versioned adapters and capability negotiation**. Enabling Track B **MUST NOT change the representation a Track A client receives** for the same resource: a generic Solid client requesting Turtle/JSON-LD gets exactly the Track A representation whether or not the LWS preset is loaded. Track B representations are served only on explicit LWS content negotiation / capability request; they are additive, never a silent substitution (this is the enforcement arm of ADR-0025's "safely ignorable extension" rule).

**4. Graduation gate (S-27, MUST-all).** A Track B feature graduates from experimental to relied-upon **only after all of**:
   - its normative text is **stable enough to test** (no longer incomplete/feature-at-risk for that feature);
   - **WG test assertions exist, or traceable equivalents** are recorded;
   - **independent interoperability** is demonstrated (see ADR-0025 / DBX-27 ≥2 independent stacks);
   - **security, privacy, accessibility and internationalization review** is complete with named sign-off;
   - a **migration review** is recorded.
   Until all gates pass, the feature stays in the experimental preset and is labelled experimental in every manifest and description.

**5. No silent profile change (standards-roadmap.md, S-17).** A **later Working Draft never silently changes an already-deployed profile.** A newer LWS draft is a new pinned snapshot (ADR-0001 §6) producing a new versioned adapter/preset; the deployed profile keeps its pinned behavior until an explicit, reviewed migration moves it. Upstream Solid/CSS changes are adopted through the compatibility manifest, upstream-change watch and migration/deprecation policy (S-17), never by uncontrolled floating.

**6. LWS notification text is NOT the durable contract (S-26).** The incomplete LWS notification section MUST NOT be adopted as the Databox durable delivery/recovery contract. Only pinned, testable assertions may be implemented; the separately specified durable cursor mechanism remains authoritative. The notification decision itself is **deferred to ADR-0011**.

## Alternatives considered

- **One merged manifest / a single "Solid+LWS conformant" badge.** Rejected (R-13, S-18): it hides which assertions are production-stable Track A versus experimental Working-Draft Track B, and would let a feature-at-risk draft feature masquerade as a conformance guarantee. Two manifests, always track-labelled.
- **Runtime feature flag / boolean inside `default.json` to toggle Track B.** Rejected — **not possible in CSS 7.1.9** (DBX-01 §7: no feature-flag/experimental-module mechanism; only whole-config composition). Attempting to fake one would mean adding a bespoke runtime-toggle subsystem to core, contradicting the "thin adapters, do not refactor unrelated CSS internals" directive. The separate preset is the idiomatic and only supported isolation.
- **Bake the LWS adapters into the default config, gated only by content negotiation.** Rejected (S-25 + operational safety): loading experimental token-exchange/authorization-server/converter components into every deployment enlarges the attack surface of Track A servers and makes "is this server running experimental code?" undiscoverable from the config it was launched with. Isolation at the config-assembly boundary keeps a Track A deployment provably free of Track B code.
- **Let a newer LWS draft auto-update the deployed adapter.** Rejected (standards-roadmap.md, S-17, S-26): silent Working-Draft churn would change deployed behavior under clients that were tested against the pinned snapshot. New draft ⇒ new pin ⇒ new preset ⇒ explicit migration.
- **Graduate Track B features on "it works in the demo".** Rejected (S-27): a demo is not stable normative text, traceable tests, independent interop or security/privacy/a11y/i18n review. All gates are required.

## Consequences

- **Positive:** A Track A deployment can be shown, from its launch config alone, to contain no experimental LWS code — a strong operational and audit property. Track B can move fast and be honestly labelled experimental without risking Track A guarantees. The separate-preset shape gives DBX-09 an unambiguous scaffold target and matches the CSS-native extension mechanism (Components.js + `AppRunner` array), so no core fork is needed. Graduation gates prevent a feature-at-risk draft from being relied upon prematurely.
- **Negative / cost:** Maintaining two (or more) config presets and versioned adapters is more assembly/CI overhead than a single toggled config; each pinned-draft bump can spawn a new preset (ADR-0001 §6). Capability negotiation to keep Track A representations unchanged (S-25) adds adapter complexity. There is no in-product runtime switch, so switching a running deployment between tracks means redeploying with a different config — deliberate, but less convenient than a flag.
- **Privacy & threat notes:** Config-boundary isolation closes a *false-assurance / accidental-experimental-exposure* threat: a Track A operator cannot inadvertently expose experimental token-exchange or an LWS authorization server by flipping a boolean. Keeping Track A representations byte-identical whether or not Track B is loaded (S-25) prevents an information-leak where the presence of experimental support changes what a generic client observes. The graduation security/privacy review (S-27) is where per-feature threat analysis lands.

## Failure behavior

Fail closed:
- If a server config imports LWS adapter components **and** claims to be a Track A / production deployment, assembly MUST fail (or the conformance gate MUST reject it) rather than quietly serving experimental behavior under a Track A label.
- If a Track B feature is invoked but its preset/adapter is not loaded, the request is refused with a standard unsupported/does-not-exist response (never a partial or spoofed Track B response), preserving ADR-0025's safely-ignorable-extension behavior for generic clients.
- If a pinned LWS draft has changed and no reviewed migration exists, the affected feature is treated as experimental-unverified and its graduation status is revoked until re-reviewed (S-17); it never auto-adopts the new draft.
- If any single graduation gate (4) is unmet, the feature MUST NOT be advertised or claimed as graduated; it stays experimental. No partial graduation.
- Any attempt to serve an LWS representation in place of the Track A representation on a non-LWS request is a bug that MUST fail its S-25 regression test rather than ship.

## Open sub-questions / residual gates

- The **concrete preset file(s), import layering and `AppRunner` array wiring** are built by **DBX-09** using the separate-preset shape fixed here; this ADR fixes the mechanism, not the file tree.
- The **independent-interop evidence** for any Track B graduation (≥2 non-Databox stacks + 1 external issuer) is owned by **DBX-27** (see ADR-0025); the *requirement* is fixed here.
- The **security/privacy/accessibility/i18n reviewers and their sign-off records** for each graduation are named per feature by DBX-27/DBX-28 under the residual security review; this ADR fixes that the review is a mandatory gate.
- The **durable notification contract** that S-26 refuses to source from LWS is specified in **ADR-0011**, not here.
- The **upgrade/deprecation and upstream-change-watch policy** (S-17) is owned by **DBX-28**; this ADR fixes the no-silent-change rule it must enforce.
