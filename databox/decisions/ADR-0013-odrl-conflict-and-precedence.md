# ADR-0013 — ODRL conflict strategy and policy precedence

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the non-relaxable invariant set and the fail-closed composition are a security boundary and MUST be signed off by the security reviewer before a production evaluator ships.
- **Sources adjudicated:** review-item #15 (source ordering); review-item #14 (WebCivics→ODRL mapping is a compilation artefact, referenced only); rights-and-obligations.md (Conflict and precedence); the layered-conjunction table (rights-and-obligations.md Division of responsibility).
- **Consumed by / blocks prompts:** DBX-07 (technical ODRL profile + WebCivics mapping), DBX-14 (composed authorizer), DBX-20 (deterministic evaluator).
- **Relates to:** ADR-0012 (duties), ADR-0014 (versioning/effective-time supplies the candidate policy set), ADR-0015 (compilation boundary — the mapping artefact lives there).

## Context

When several policies bear on one action, the evaluator needs a single, deterministic answer. Review-item #15 records the WebCivics *source ordering* as an input — "mandatory baseline outranks guardian policy, which outranks user preference; ties prefer the more protective result" — but explicitly leaves open "how this composes with ODRL conflict strategies, statutory conflicts, jurisdiction and emergency exceptions." rights-and-obligations.md fixes that the Databox profile "defines one deterministic conflict strategy" and lists safety boundaries that "remain external invariants."

Why this matters to an invariant: the whole layered model (rights-and-obligations.md Division of responsibility) is a **conjunction** — Solid-OIDC ∧ WAC/ACP ∧ Databox authorization ∧ ODRL. Invariant-style rule: "An ODRL permission cannot override a WAC/ACP denial, tenant boundary or Databox invariant. A malformed or unsupported policy fails closed." A conflict strategy that could relax a denial would convert ODRL from a *use*-policy layer into an access-control bypass. The decision must make it structurally impossible for policy composition to broaden any denial.

CSS 7.1.9 reality (DBX-01 §3): WAC/ACP produce a flat boolean `PermissionSet` with no tenant/assurance/ODRL dimension; the Databox composed authorizer therefore *narrows* the WAC result (a unioned `PermissionReader` that can only force a mode to `false`), it never widens it. That architectural fact is what makes "ODRL never broadens a denial" enforceable rather than merely aspirational.

## Decision

**Two-plane separation is absolute.** WAC/ACP answer *reachability* ("may this agent perform this HTTP operation on this resource"); ODRL answers *permitted use* ("is the intended action permitted/prohibited, and which duties apply"). ODRL evaluation runs **only within the set of actions WAC/ACP, tenant, relationship and assurance checks already allow.** A `prohibition` or unresolved `conflict` can subtract from that set; an ODRL `permission` can never add to it.

**One deterministic Databox conflict strategy.** The evaluator resolves a candidate action to exactly one of `permitted` / `prohibited` / `fail-closed`, by applying these ordered stages. Each stage is total (always yields a result or defers to the next); the first decisive stage wins.

1. **External non-relaxable invariants (hard gate, evaluated first, never overridable by any policy):**
   - explicit tenant/program isolation — a program-specific policy cannot authorize access to another program;
   - prohibition-beats-broad-permission — a specific prohibition is never bypassed by a broader permission;
   - assurance denial — insufficient authentication assurance yields denial regardless of policy;
   - cross-program denial — no policy may reach across the Databox boundary;
   - statutory/court-ordered handling enters as a **new authoritative policy event**, never a silent in-place override.
   If any invariant denies, the result is `prohibited`/denied and evaluation stops. These invariants are **not expressible as relaxable ODRL rules**; they are code-level gates the composed authorizer applies (DBX-14), outside the policy corpus.

2. **WebCivics source ordering (the review #15 input), applied among policies that survived stage 1:**
   `mandatory baseline` > `guardian policy` > `user preference`. A higher-ranked source's decision outranks a lower-ranked one on the same action. **Ties (same rank, opposite outcome) resolve to the more protective result** — for a use decision, `prohibited` is more protective than `permitted`; a duty that adds a safeguard is retained over one that omits it.

3. **ODRL conflict-strategy operand**, applied only *within a single source rank* where the source ordering does not decide: honour the policy's declared ODRL `conflict` term (e.g. `prohibit`-wins vs `permit`-wins) if and only if it is supported and does not contradict a stage-1 invariant. An unsupported or absent conflict strategy where a genuine conflict exists → stage 5.

4. **Jurisdiction and emergency/exception**, applied as *inputs already compiled into the policy set*, never as free-form runtime reasoning: a jurisdiction constraint or emergency exception only takes effect if it arrives as an attested compiled-policy rule (ADR-0015) carrying its effective interval (ADR-0014). The runtime evaluator MUST NOT decide, on its own, that an emergency applies or that a jurisdiction's rule governs — it applies what the compiled bundle states.

5. **Fail-closed default:** any residual conflict, unsupported composition, ambiguous rank, or missing input that stages 1–4 did not decide resolves to `fail-closed` (treated as denial for the action) and is written to the audit ledger with the specific reason (unsupported operand, ambiguous rank, unresolved conflict, etc.).

**The following are external invariants that policy composition MUST NOT relax, at any stage:** tenant isolation, prohibition-beats-broad-permission, assurance denial, cross-program denial, and the rule that statutory/court-ordered handling is a new authoritative policy event rather than a silent override. A policy that *purports* to relax one of these is itself an unsupported policy and fails closed.

**Scope boundary — the WebCivics→ODRL mapping is not defined here.** Review-item #14 (the loss-aware mapping of jural correlatives, legitimacy, jurisdiction, provenance, accountability, policy source into ODRL, validated with shapes + human review) is a **compilation artefact owned by DBX-07** and produced under the attestation regime of **ADR-0015**. This ADR consumes the mapping's *output* (ranked, typed policy rules) and defines only how they compose at runtime.

## Alternatives considered

- **Let ODRL conflict-strategy operands decide everything (no fixed Databox strategy)** — rejected. Different policies could declare incompatible strategies, yielding non-determinism and, worse, a `permit`-wins strategy could appear to override a prohibition. rights-and-obligations.md requires "one deterministic conflict strategy"; the ODRL operand is subordinate (stage 3), not sovereign.
- **Make the non-relaxable invariants themselves ODRL rules for uniformity** — rejected. If the invariants live inside the policy corpus, a later policy edit or a mapping bug could relax them. Keeping them as code-level gates (stage 1, outside the corpus) is what makes "not relaxable by policy" true rather than merely intended.
- **Prefer the most recent policy on a tie (recency-wins)** — rejected as the tie-breaker. Recency is not a safety property; a newer, less-protective user preference must not silently defeat a mandatory baseline. "More protective wins" is the tie rule; recency is handled separately and lawfully by effective-time versioning (ADR-0014).
- **Resolve jurisdiction/emergency at runtime from constraints** — rejected. That is free-form legal interpretation, which review-item #12 and ADR-0015 forbid the runtime evaluator from performing. Jurisdiction/emergency effects must be pre-compiled and attested.

## Consequences

- **Positive:** one deterministic answer per action; the safety invariants are structurally unrelaxable; composition is auditable (every fail-closed carries a reason); the source ordering gives a principled, protection-biased tie rule aligned with the guardianship model.
- **Negative / cost:** authors must understand a five-stage precedence; a genuinely under-specified corpus will fail closed rather than "make a reasonable guess," which can deny legitimate actions until the corpus is completed. This is the intended trade (safety over availability for policy).
- **Privacy & threat notes:** blocks the central *ODRL-as-bypass* threat — a crafted permission cannot widen reachability, cross a tenant boundary, or defeat assurance/step-up. Because unsupported composition fails closed and is audit-visible, an attacker cannot silently exploit an ambiguity: the ambiguity denies and is logged. The audit reason codes must themselves avoid leaking protected facts (align with ADR-0023 non-disclosure and the 404-not-403 rule, DBX-01 §3).

## Failure behavior

Fail closed at every undecided point. Specifically: unknown/unsupported ODRL action, operand, or conflict-strategy → deny + audit reason `unsupported-policy`. Ambiguous source rank or missing rank metadata → deny + `ambiguous-rank`. Conflicting decisions that stages 1–4 do not resolve → deny + `unresolved-conflict`. A stage-1 invariant denial always overrides any downstream permission. A missing or unverifiable compiled-policy input (no attestation, bad digest) → the policy is not admitted (ADR-0015) and any action depending on it fails closed. Never fail open; never "default permit" to preserve availability.

## Open sub-questions / residual gates

- The concrete `conflict` operand vocabulary the Databox profile supports (which ODRL strategies are "supported" in stage 3) is owned by **DBX-07**.
- The exact reason-code catalogue and its non-disclosure review are shared with **DBX-14** (structured denial reasons) and **ADR-0023** (existence confidentiality).
- The WebCivics→ODRL loss-aware mapping and its SHACL shapes are **DBX-07** under **ADR-0015** attestation; this ADR is not unblocked-dependent on it, because until the mapping exists the evaluator simply has fewer ranked rules and still composes deterministically.
- No item here is Blocked: the composition strategy is fully specified for its scope.
