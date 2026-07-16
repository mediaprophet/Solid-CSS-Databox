# Policies & ODRL

Rights, prohibitions and obligations **travel with records** as versioned
[ODRL](https://www.w3.org/TR/odrl-model/) policies and produce **auditable duties**. This is what lets
a Databox exchange be checked after the fact: which permissions applied, which prohibitions overrode
them, and which duties were owed and fulfilled.

- Vocabulary & profile: [`src/databox/odrl/terms.ts`](../../src/databox/odrl/terms.ts),
  [`TermSupport.ts`](../../src/databox/odrl/TermSupport.ts)
- Evaluator & duty engine: [`src/databox/policy/PolicyEngine.ts`](../../src/databox/policy/PolicyEngine.ts)
- Design: [rights and obligations](../rights-and-obligations.md) and ADRs
  [0012](../decisions/ADR-0012-odrl-duty-catalogue-and-fulfilment.md)–[0015](../decisions/ADR-0015-legal-policy-compilation-boundary.md).

## Policy templates

Each record class and submission class in the [Institution Profile](institution-profile.md) names a
`policyTemplate`, and `policies.templates[]` binds that template to a specific `odrlProfile` and
version (e.g. `https://w3id.org/solid-databox/odrl-profile/v1`). Because policies are **versioned**, a
receipt can pin exactly which policy governed an exchange.

## Conflict & effective time

- `conflictStrategy` — how overlapping rules resolve. The reference profiles use
  `prohibition-overrides` (a prohibition beats a permission). See
  [ADR-0013](../decisions/ADR-0013-odrl-conflict-and-precedence.md).
- `effectiveTimeBehavior` — e.g. `prospective`: a policy change applies going forward, not
  retroactively. See [ADR-0014](../decisions/ADR-0014-policy-versioning-and-effective-time.md).

Only a bounded, known set of ODRL actions and duties is admitted; unknown actions and deprecated terms
are rejected (see the [invalid policy fixtures](../fixtures/policies/)).

## Duties

Permissions and prohibitions are static; **duties** are the live part. The duty engine tracks each
owed duty through its lifecycle (owed → fulfilled/breached), so obligations such as "notify the holder"
or "delete on expiry" become evidence rather than prose.

## The legal-compilation boundary

The Databox draws a hard line between *policy execution* (what the engine enforces) and *legal
compliance* (a human, corpus-grounded judgement):

- A program may declare a compiled policy attested against a **pinned legislative corpus**
  (`compiledPolicy`, `legislativeCorpus`), but this is a technical attestation, **not** an automated
  claim of legal compliance.
- `POST /programs` only lets a program advertise legal compliance (`claimsLegalCompliance: true`) if a
  supplied compliance assessment **passes the publication gate** in the
  [compliance engine](../../src/databox/compliance/ComplianceEngine.ts). Otherwise the registration is
  rejected. See [ADR-0015](../decisions/ADR-0015-legal-policy-compilation-boundary.md) and the
  [Australian compliance registry](../../src/databox/compliance/AustralianComplianceRegistry.ts).

The compliance layer is **human-reviewed decision support**, not an oracle: it is designed to *block*
unsupported legal claims, not to manufacture them.
