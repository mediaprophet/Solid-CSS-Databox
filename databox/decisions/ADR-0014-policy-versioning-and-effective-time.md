# ADR-0014 — Policy versioning, effective-time and update effects

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** legal-policy — any *retroactive* re-evaluation of already-accepted records against a new policy version affects rights and MUST be authorized under the attestation regime of ADR-0015 before it runs in a compliance profile.
- **Sources adjudicated:** review-item #11 (ELI does not pin the corpus), review-item #17 (rejects "updates affect only new records"), review-item #18 (rejects "policy-version string proves governing corpus"); rights-and-obligations.md (Policy lifecycle); implementation-decisions.md (Legislative policy provenance).
- **Consumed by / blocks prompts:** DBX-06 (profile/assurance versioning consumers), DBX-20 (evaluator selects the governing version by effective-time).
- **Relates to:** ADR-0015 (compilation boundary + corpus manifest), ADR-0019 (the receipt/evidence binding this ADR requires), ADR-0011 (immutability of accepted bytes), ADR-0013 (which version enters the candidate set).

## Context

Two truths must hold at once. First, accepted record bytes and their issued receipts are immutable (invariant 7; ADR-0011; exchange-and-evidence.md: "Later deletion or alteration by the provider must not invalidate an already issued receipt"). Second, the *authorization and legal obligations* attached to those records can legitimately change — a retention rule shortens, a disclosure prohibition is added, a statute commences. rights-and-obligations.md fixes that "a new policy version governs new assets or an explicitly authorized transition; history is never rewritten."

Three proposed answers are wrong as stated and must be rejected:

- **Review-item #17 — "policy updates affect only new records"** is too weak: it would freeze obligations to the version in force at acceptance, so a newly-added prohibition or a shortened retention could never reach existing records even when law or the program requires it.
- **Review-item #18 — "a policy-version string proves which corpus governed"** is too weak: a bare version label is forgeable and unpinned; it does not bind the actual compiled bytes, corpus, attestation or evaluator.
- **Review-item #11 — "an ELI identifier pins the processed corpus"** is false: ELI can *name* legislation and versions but does not pin the retrieved artefact's digest.

## Decision

**Immutability boundary.** Accepted record bytes, their canonical payload digests, and already-issued receipts are immutable and append-only (ADR-0011). Correction is supersession, never in-place edit (ADR-0023). Nothing in this ADR permits rewriting an accepted byte or an issued receipt.

**Every policy version is a first-class, signed, immutable object** carrying at minimum:

- a stable policy/profile identifier and version;
- an **effective interval** (`effectiveFrom`, optional `effectiveUntil`) — the wall-clock/legal time from which the version governs, distinct from the time it was authored or committed;
- the **affected asset classes** it governs;
- an explicit **prospective-vs-retroactive rule** (see below);
- the **migration / re-evaluation behaviour** to apply on transition;
- retained **historical policy material** — superseded versions are kept, never deleted;
- the binding tuple required by ADR-0019 (compiled-policy digest + corpus-manifest digest + attestation id + evaluator version).

**Update-effect rule (replaces review #17).** A policy update MUST declare, per affected asset class, one of:

- **prospective** — governs only assets accepted at or after `effectiveFrom`; existing assets keep their governing version. (This is the *default* and the safest.)
- **authorized retroactive re-evaluation** — existing assets of the named classes are re-evaluated against the new version from `effectiveFrom`. This is permitted **only** when the update is explicitly authorized (an attested transition under ADR-0015, or a program-authorized change), and it changes *obligations/authorization going forward*, never the historical record bytes or the historical evidence. Re-evaluation produces **new** evidence events (e.g. a newly activated duty, a changed permitted-use decision); it does not alter or delete prior events.

"Policy updates affect only new records" is **rejected as stated**: prospective is the default, but retroactive obligation change MUST be expressible for the cases (statute, safety recall, corrected disclosure rule) that require it.

**Governing-version selection.** For any action at time *t* on an asset of class *C*, the evaluator selects the policy version whose effective interval contains the relevant time and whose asset classes include *C*, applying the prospective/retroactive rule. Selection is deterministic and feeds the conflict composition of ADR-0013.

**History is never rewritten.** A new version supersedes an old one by linkage; the old version remains resolvable for verifying past decisions. A receipt issued under version *v1* forever attests *v1*; a later *v2* does not retro-stamp it.

**Proof of governing corpus (replaces review #18).** A policy-version string alone is insufficient. Every receipt and evidence event that asserts a governing policy MUST bind (per ADR-0019): the **compiled-policy digest**, the **corpus-manifest digest** (per ADR-0015 — the immutable manifest of source URI, jurisdiction, expression/version, retrieval time, media type, content digest, provenance; ELI does not substitute for it), the **interpretation/attestation identifier**, and the **evaluator version**, plus retained verification material. Later verification MUST be possible without trusting any mutable URL or version label.

## Alternatives considered

- **Freeze all obligations to the version in force at acceptance (pure prospective)** — rejected as the only mode. It is the correct *default* but cannot express a lawfully-required retroactive obligation change (new prohibition, shortened retention, recall). Review #17 is rejected precisely because this cannot be the whole answer.
- **Always re-evaluate all history against the latest version** — rejected. That would let a later policy silently rewrite the effective obligations of past exchanges without authorization and could invalidate the meaning of already-issued receipts. Retroactivity must be explicit, scoped and authorized.
- **Identify the governing policy by version string (or ELI) only** — rejected (review #18 and #11). Strings and ELIs are unpinned and forgeable; they do not bind the compiled bytes, the retrieved corpus digest, the attestation or the evaluator. ADR-0019's multi-digest binding is required.
- **Mutate the policy document in place and bump a counter** — rejected. In-place mutation destroys the ability to verify a past decision and violates the append-only evidence model (ADR-0011).

## Consequences

- **Positive:** obligations can lawfully evolve while the record and its receipts stay immutable; any past decision is independently re-verifiable against the exact version, corpus, attestation and evaluator that produced it; retroactive change is possible but never silent or unauthorized.
- **Negative / cost:** every version must be stored and pinned with a multi-part digest binding; retroactive re-evaluation is an operational process (re-run the evaluator over an asset-class set, append new evidence) that DBX-20 must build; authors must set effective intervals and prospective/retroactive rules deliberately.
- **Privacy & threat notes:** closes a *silent-downgrade* threat where a program weakens a protection retroactively and points to a bare version label as cover — the multi-digest binding and retained history make such a move detectable. Retained historical policy material must itself respect data-minimisation: it stores policy expressions and digests, not personal payloads.

## Failure behavior

Fail closed. If the governing version for (*C*, *t*) cannot be uniquely selected (overlapping intervals, missing `effectiveFrom`, ambiguous asset-class membership), the action fails closed and is audit-visible (ADR-0013 stage 5). If any of the required binding digests (compiled-policy, corpus-manifest, attestation, evaluator) is missing or does not verify, the policy is not admitted (ADR-0015) and dependent actions fail closed. A retroactive re-evaluation that lacks explicit authorization MUST NOT run; absent authorization the version is treated as prospective-only. A verification that cannot resolve the retained historical version MUST report "unverifiable," never "verified."

## Open sub-questions / residual gates

- The concrete re-evaluation *engine* (batch re-run over an asset class, evidence-emission, ordering) is owned by **DBX-20**; this ADR fixes the semantics it must implement.
- The mapping of a *statutory* commencement/repeal into an effective interval is decided upstream by the compilation/attestation stage (**ADR-0015**), not by the runtime; this ADR consumes the resulting interval.
- Whether a given deployment permits any retroactive re-evaluation at all in a compliance profile is a **legal-policy** gate under ADR-0015; the mechanism exists here, the authorization to use it does not.
- No item here is Blocked: the versioning and effective-time semantics are fully specified for their scope.
