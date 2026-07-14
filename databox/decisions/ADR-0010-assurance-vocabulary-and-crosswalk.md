# ADR-0010 — Assurance vocabulary and crosswalk

- **Status:** Adopted (vocabulary adopted; per-program crosswalk is a Profile choice)
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** identity, security — the claim→assurance crosswalk is a forgery/escalation surface; human identity/security review required per program (DBX-06/DBX-12 gate).
- **Sources adjudicated:** R-06; review-item #3; identity-and-access.md "Authentication assurance".
- **Consumed by / blocks prompts:** DBX-06, DBX-12, DBX-14, HAK-03, HAK-04.
- **Relates to:** ADR-0005 (broker validates claims), ADR-0008 (linking is separate), ADR-0009 (step-up).

## Context
Review item 3 confirmed the assurance *dimensions* are known but the *vocabulary and crosswalk* are not.
CSS `Credentials` carries **no assurance field at all** (DBX-01 §2) — assurance-aware access is entirely
new. The server must never accept an assurance value from an unsigned header or an unverified token decode
(identity-and-access.md).

## Decision
- Normalize verified authentication into **separate dimensions**, not a single unqualified LoA number
  (R-06, identity-and-access.md):
  - identity proofing strength;
  - authenticator strength;
  - federation / issuer trust (+ IdP accreditation);
  - authentication freshness (authentication time);
  - step-up state;
  - actor / represented-party and delegation evidence.
- The crosswalk from a program's approved issuer claims **into these dimensions** is a **signed, versioned,
  per-program Profile choice** (review 3, R-06). Record classes state their **minimums** per dimension;
  the record-class gate uses the normalized result (ADR-0014 record grades).
- **Unknown or unmapped claims fail closed** (R-06): an assurance dimension that cannot be derived from a
  *verified* claim is treated as its lowest value, and access requiring more is denied.
- Assurance is carried in the authenticated request context (DBX-12), **never** trusted from a request
  header or an unverified JWT decode (identity-and-access.md), and **never** inside the WAC AccessChecker
  (which can't see it — ADR-0003).
- **Assurance never selects a customerID** — customer matching is a separate decision (R-06, ADR-0008).
- Delegation/represented-entity is a first-class dimension: the acting agent and represented person remain
  distinct (architecture.md), enabling guardians/employees/automated services (ADR-0009 guardianship).

## Alternatives considered
- **Single LoA integer (e.g. LoA1–4).** Rejected (R-06, review 3): collapses proofing, authenticator,
  freshness and federation into one number, losing the ability to require (e.g.) fresh strong-authenticator
  for one record class but not another, and hiding which dimension failed.
- **A fixed global assurance vocabulary baked into the server.** Rejected: issuer claim sets and national
  frameworks differ; the crosswalk must be per-program and signed/versioned (review 3).
- **Best-effort mapping of unknown claims.** Rejected: unmapped → fail closed, or forged/novel claims could
  escalate grade (isolation §threat "requesting a high-grade record after low-assurance authentication").

## Consequences
- **Positive:** fine-grained, forgery-resistant, per-dimension gating; step-up can target the exact missing
  dimension; auditable which dimension caused a denial.
- **Negative / cost:** each program must author and human-review a crosswalk; more complex than an integer;
  the normalized-context type is new (DBX-12).
- **Privacy & threat notes:** defends assurance-forgery and low-assurance escalation. The crosswalk file
  itself is security-critical config — signed and versioned, tested with forged-claim negatives (DBX-12
  gate: forged assurance/actor claims are rejected).

## Failure behavior
Assurance claim from an unsigned/unverified source → ignored (treated as absent → lowest grade). Any
required dimension underived → deny + step-up challenge (ADR-0009). Unknown crosswalk version → refuse to
evaluate (fail closed).

## Open sub-questions / residual gates
- The concrete dimension value scales and the signed crosswalk schema → DBX-06 (institution profile
  schema) + DBX-12.
- Delegation/guardianship evidence format → DBX-13/DBX-14.
