<!--
CANONICAL ADR TEMPLATE for the Databox decision register (DBX-02).
Copy this structure exactly. Keep every heading. Fill every field.
Status vocabulary (from implementation-decisions.md):
  Adopted | Adopted-with-scope | Profile choice | Blocked (decision required) | Rejected-as-stated
"Blocked" means the decision cannot be finalised yet; it MUST name the exact input that unblocks it
and the prompt that owns that input.
-->
# ADR-XXXX — <concise decision title>

- **Status:** <Adopted | Adopted-with-scope | Profile choice | Blocked (decision required) | Rejected-as-stated>
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** <none | security | cryptography | identity | legal-policy | privacy> — <one line why, or "none">
- **Sources adjudicated:** <R-xx; HD-xx; review-item #n; S-xx — list all this ADR resolves>
- **Consumed by / blocks prompts:** <DBX-xx, HAK-xx …>
- **Relates to:** <ADR-xxxx …>

## Context
<The question. Why it matters to an invariant. The CSS 7.1.9 reality from DBX-01 where relevant
(cite the extension map). Do not restate the whole design doc — state the decision problem.>

## Decision
<The normative position, stated so an implementer cannot misread it. Use MUST/SHOULD/MAY.
This is what dependent prompts consume.>

## Alternatives considered
- **<alternative>** — <why rejected or deferred; the consequence of choosing it>.
- **<alternative>** — <…>.

## Consequences
- **Positive:** <…>
- **Negative / cost:** <…>
- **Privacy & threat notes:** <what attack this opens or closes; link to a DBX-03 threat if known>

## Failure behavior
<Fail-closed rules. What happens on missing/invalid/ambiguous input. Never fail open.>

## Open sub-questions / residual gates
<What remains unresolved and which prompt owns it. If Status is Blocked, state EXACTLY what input
unblocks it and who supplies it. If fully Adopted, write "none — fully specified for its scope.">
