# ADR-0004 — Consumer and institutional identifiers; pairwise WebID; DID optionality

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** identity, privacy — pairwise-identifier and correlation-resistance design must pass human identity/privacy review before production (DBX-13 gate).
- **Sources adjudicated:** R-02; HD-01; HD-02; review-item #5; S-06; S-22; identity-and-access.md "Pairwise identifiers".
- **Consumed by / blocks prompts:** DBX-07, DBX-10, DBX-13, DBX-24, HAK-01, HAK-03, HAK-06.
- **Relates to:** ADR-0002 (opaque box IDs), ADR-0007 (holder binding), ADR-0016 (mapping registry).

## Context
Isolation (invariant 1, isolation-and-privacy.md) requires that no organisation and no shared provider
obtains a global, correlatable consumer identifier. Solid-OIDC identifies a user with an HTTP(S) WebID;
the review proposed requiring WebID + DID + public key on every relationship (review 5). CSS today has no
pairwise-identity concept and mints pod identifiers from slugs (DBX-01 §5).

## Decision
- The consumer vault **MUST** create a **distinct pairwise HTTPS WebID/Controlled Identifier and a fresh
  P-256 key per program/Databox connection** by default (HD-01, R-02). The URI is vault-controlled and
  resolves to the verification/service info the pinned Solid/LWS profile requires.
- Neither pairwise profile links to the other; a shared provider **MUST NOT** insert a global consumer
  identifier into tokens, credentials, URLs, logs or analytics (S-06, isolation-and-privacy.md).
- **Reject "require WebID + DID + key" as stated** (review 5): use an HTTP(S) WebID where the selected
  Solid/LWS path requires one, bind the active holder key, and make DID **optional**. `did:key`, `did:web`,
  `did:solid` are optional *typed* bindings, never silent replacements for a WebID on an existing Solid
  authorization path. If a DID is used, its method, verification relationship, controller and rotation
  rules **MUST** be specified (defer concrete DID work to DBX-13/DBX-07).
- Identifier relationships **MUST** be typed and directional (S-22): a resolver maps
  `IdP subject → program relationship`, `relationship → pairwise WebID`, `pairwise WebID → holder key`.
  Identifiers **MUST NOT** be collapsed into one interchangeable "subject" field.
- An existing consumer WebID **MAY** be reused only via explicit consumer choice plus a correlation
  warning and a migration/linking ceremony (HD-01, S-06). Default is always fresh-pairwise.
- **Institutional identifiers (HD-02, R-02):** each organisation, bridge service, human reviewer and
  automated agent has a distinct stable HTTPS identifier. The organisation identifier is the accountable
  principal and connection-credential issuer; bridge/service identifiers carry operational authority. A
  human, an organisation and a software service are **never** the same identifier.
- Any unavoidable deterministic opaque identifier **MUST** use a tenant-specific keyed HMAC, never an
  unkeyed hash; random stored identifiers are preferred (identity-and-access.md).

## Alternatives considered
- **One consumer WebID across programs (simplest).** Rejected: directly creates the global correlatable
  identifier invariant 1 forbids.
- **Mandatory DID-based identity (`did:key`/`did:solid`) instead of WebID.** Rejected for hackathon/Track A:
  Solid-OIDC/WAC require an HTTP(S) WebID; a DID would break the standard path (review 5, S-22). Kept as an
  optional Track B authentication-suite profile (ADR-0006).
- **Organisation mints the consumer's pairwise WebID.** Rejected: silently minting an org-controlled
  identity violates S-06 ("do not silently mint an organisation-controlled identity"); the vault controls
  the URI.

## Consequences
- **Positive:** structural correlation resistance; each connection is independently revocable/migratable;
  no global key to leak.
- **Negative / cost:** the vault must manage N keypairs and N WebID documents and their recovery
  (ADR-0009 recovery rules); more key material to protect.
- **Privacy & threat notes:** defends the cross-program-correlation and pairwise-identity-correlation
  threats (isolation §threat cases). Residual risk: correlation via shared claims/timing/analytics —
  handled by ADR-0010 (unmapped claims fail closed) and isolation controls, tested in DBX-26.

## Failure behavior
A request whose pairwise subject does not resolve to an active relationship for the addressed program →
deny (fail closed). A DID presented where the path requires a WebID and no typed binding exists → reject.
Reused-WebID without the explicit consent+warning flag → treat as configuration error, refuse to provision.

## Open sub-questions / residual gates
- Concrete DID method selection and controlled-identifier document shape → DBX-13/DBX-07 (optional profile).
- Pairwise-WebID recovery and migration ceremony detail → DBX-13 (see ADR-0009 for lifecycle triggers).
