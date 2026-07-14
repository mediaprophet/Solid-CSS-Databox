# ADR-0003 — Solid authorization baseline: WAC now, ACP-neutral composition

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the composition interface is the primary authorization chokepoint; an independent Hard reviewer must confirm no layer can broaden a denial (DBX-14).
- **Sources adjudicated:** R-01; HD-03; S-08; identity-and-access.md "Authorization layers".
- **Consumed by / blocks prompts:** DBX-07, DBX-14, DBX-27, HAK-03, HAK-04, HAK-05.
- **Relates to:** ADR-0005 (AS/broker), ADR-0010 (assurance), ADR-0025 (interop guarantee).

## Context
CSS ships two mutually exclusive Solid authorization surfaces chosen at startup by config
(DBX-01 §3): WAC (`config/default.json:19` → `WebAclReader`) and ACP (`file-acp.json:19` → `AcpReader`),
both feeding the same `PermissionReader` union. The Databox needs one interoperable baseline (S-08) and a
place to attach tenant, relationship, assurance, record-grade, immutability and ODRL conditions. The plan
fixes WAC for the hackathon (HD-03), but a production deployment may want ACP.

Critically, DBX-01 §2 found that **WAC as CSS ships it discards `client` and `issuer` claims** — the WAC
`AccessChecker`/`OwnerPermissionReader` read only `agent.webId`. ACP preserves all three. This constrains
how the Databox layer must carry non-WebID claims.

## Decision
- WAC **MUST** be the ordinary Solid authorization surface for the hackathon and the initial production
  Track A baseline. Exactly one authorization mode is advertised per deployment (S-08).
- The Databox authorization composition **MUST** be authorization-system-neutral: WAC and any future ACP
  adoption plug into the same composition interface. No Databox logic may assume WAC-specific internals.
- Authorization is the **conjunction** (identity-and-access.md, HD-03):
  `valid token AND active grant/relationship AND WAC permission AND Databox invariant+assurance checks AND applicable ODRL preconditions`.
- Every Databox layer may only **narrow** the standard result. No layer — WAC, tenant, relationship,
  assurance, immutability, ODRL — may broaden another layer's denial (S-08, invariant 12).
- Because WAC discards `client`/`issuer`, those claims and the assurance context **MUST** be carried in
  the Databox authorization layer (the authenticated request context of ADR-0009/DBX-12 and a Databox
  `PermissionReader`), **not** inside the WAC `AccessChecker`. See DBX-01 §3 for the idiomatic seam: a new
  `PermissionReader` unioned into `readers/default.json` that can force a mode to `false`.
- The LWS Access Grant (Track B) is the portable, standards-facing record of granted authority;
  provisioning compiles an active grant into WAC + Databox relationship state (R-01).

## Alternatives considered
- **ACP for the hackathon.** ACP natively carries client/issuer and is more expressive. Rejected for the
  hackathon (HD-03) because WAC is the mature default CSS path and WebID social sharing uses it directly;
  running both surfaces in parallel creates two policy truths (S-08). ACP remains a production option
  precisely because the composition stays neutral.
- **Replace WAC's `PermissionSet` type with a richer Databox permission type.** Rejected: it would fork
  core CSS and break generic-client interoperability (invariant 12). The Databox composes *around* the
  flat `PermissionSet`, narrowing it.
- **Put assurance/client checks inside the WAC `AccessChecker`.** Rejected: WAC never receives those
  claims, and it would couple Databox logic to WAC internals, defeating ACP-neutrality.

## Consequences
- **Positive:** reuses the mature CSS WAC path; keeps generic Solid clients working; a single deny-only
  composition point is easy to reason about and test (truth tables, DBX-14).
- **Negative / cost:** the Databox must independently re-carry client/issuer/assurance because WAC drops
  them; this is real new code (DBX-12) and a correctness risk if the two paths disagree.
- **Privacy & threat notes:** a broad WAC grant must not bypass assurance, tenant or ODRL prohibition —
  the "narrow only" rule is the core defence (DBX-03 confused-deputy / over-broad-permission cases).

## Failure behavior
Missing or unreadable policy input at any layer → deny (fail closed). A denial from any layer is final;
no later layer can turn it into an allow. Ambiguous composition → deny and audit.

## Open sub-questions / residual gates
- Exact precedence/reason-code model and step-up responses are specified by DBX-14 (ADR references this).
- ACP enablement path (a second config preset) is deferred to production; the neutral interface is the
  only hackathon obligation.
