# ADR-0008 — Consumer proof ceremony, holder-key binding and customer linking

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** identity, security — the account-linking step that resolves exactly one customer record is a confused-deputy / mis-binding risk; human identity review required (DBX-13 gate).
- **Sources adjudicated:** R-04; R-05 (proof side); HD-06; HD-11; identity-and-access.md "Connection ceremony".
- **Consumed by / blocks prompts:** DBX-13, DBX-16, DBX-22, DBX-24, HAK-03, HAK-06.
- **Relates to:** ADR-0004 (pairwise identity), ADR-0007 (credential), ADR-0009 (token lifecycle), ADR-0016 (mapping registry).

## Context
Establishing a connection must (a) prove the human is the right customer, (b) prove the vault controls the
holder key, and (c) bind those to an opaque relationship without leaking a customer identifier. Assurance
level alone never proves *which* customer record is correct (HD-11). CSS has `randomUUID`/`randomBytes`
primitives and a TokenOwnershipValidator pattern (DBX-01 §5) but no such multi-factor linking ceremony.

## Decision
The connection ceremony (identity-and-access.md steps 1–9) **MUST** combine all of (HD-11):
1. a validated **external authentication event** and its assurance (ADR-0005, ADR-0010);
2. **program-specific claims or an explicit account-linking challenge** sufficient to resolve **exactly
   one** customer record in the integration plane (ADR-0016);
3. **vault proof of the pairwise holder key** (a signed challenge from the connection's P-256 key, HD-06);
   and
4. an **audited confirmation** before the mapping becomes active.

- Ambiguous, duplicate or already-bound customer matches **MUST fail closed** and enter a governed review
  path (HD-11) — never auto-bind on a best guess.
- Holder-key control **MUST** be re-proven at connection, at **every unattended token request** (fresh
  five-minute JWT, ADR-0006/0009), and at migration and recovery (R-04). Possession of the credential
  document is never sufficient (ADR-0007).
- The resolved binding is `typed institutional key → opaque relationship → opaque Databox → pairwise WebID`
  (ADR-0016). The **raw customerID never leaves the integration plane** and never enters the credential,
  URI, notification or vault (isolation invariant, HD-09).
- Assurance and customer-matching are **separate decisions**: assurance never selects a customerID (R-06,
  ADR-0010).

## Alternatives considered
- **Assurance-only binding (trust the IdP subject to identify the customer).** Rejected (HD-11): a
  high-assurance login proves *who the human is to the IdP*, not which internal customer record maps to
  them; conflating them mis-binds records to the wrong person.
- **Auto-resolve ambiguous matches by heuristic.** Rejected: silent mis-binding is a severe privacy/
  integrity failure; ambiguity must fail closed into human review.
- **Credential-possession as proof of holder (skip per-request key proof).** Rejected (ADR-0007,
  invariant 4): turns the credential into a bearer token.

## Consequences
- **Positive:** strong, auditable, multi-factor binding; wrong-customer mis-binding is structurally
  prevented; holder-key proof at every exchange bounds replay.
- **Negative / cost:** onboarding is heavier (external auth + linking challenge + key proof + audited
  confirmation); a review path must exist for ambiguity (DBX-23).
- **Privacy & threat notes:** defends coerced-consumer and mis-binding threats; the audited confirmation
  gives an evidence trail (ADR-0019). Residual: the linking challenge design must not itself leak customer
  data — owned by DBX-13/DBX-16.

## Failure behavior
Any of the four factors missing/invalid, or a customer match that is ambiguous/duplicate/already-bound →
do not activate the mapping; enter governed review (fail closed). Holder-key proof failure at any later
exchange → deny that exchange.

## Open sub-questions / residual gates
- Concrete account-linking challenge design (what program-specific claims, how to avoid leaking customer
  data) → DBX-13 + DBX-16.
- Audited-confirmation evidence shape → DBX-19 (evidence ledger).
