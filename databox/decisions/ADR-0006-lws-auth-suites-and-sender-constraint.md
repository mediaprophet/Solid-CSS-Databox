# ADR-0006 — LWS authentication suites and sender-constraint coexistence

- **Status:** Adopted-with-scope (OIDC + self-signed Controlled Identifier for the hackathon; SAML/DID deferred)
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security, cryptography — the self-signed Controlled Identifier proof and sender-constraint downgrade rules need human crypto review before production (DBX-12 gate).
- **Sources adjudicated:** S-21; S-23; S-19; HD-07; standards-roadmap.md "Proposed standards-aligned connection flow"; hackathon-profile.md.
- **Consumed by / blocks prompts:** DBX-06, DBX-12, DBX-14, HAK-03, HAK-04.
- **Relates to:** ADR-0005 (broker/token exchange), ADR-0007 (credential), ADR-0009 (token lifecycle).

## Context
The pinned LWS June 2026 draft defines authentication credentials independent of a single mechanism, an AS
discoverable via `WWW-Authenticate`, and RFC 8693 token exchange into storage-audience tokens. It ships
four candidate authentication suites: OIDC, SAML, controlled identifiers, `did:key`. The draft's access
tokens use the **Bearer** scheme, while Databox prefers **sender-constrained** tokens for higher-risk
access (standards-roadmap.md compatibility risks). CSS has none of this today (DBX-01 §9).

## Decision
- **Initially profile OIDC** as the interactive authentication suite (S-21). SAML is represented by an
  interface + fixture for the hackathon (government/university federation), **not** a live IdP.
- For **unattended sync**, adopt the pinned LWS **self-signed Controlled Identifier** suite (HD-07): the
  vault mints a fresh five-minute ES256 authentication JWT from its connection's pairwise holder key and
  presents it as the RFC 8693 **subject token**; the AS resolves the active connection + Access Grant from
  subject, client and storage realm and issues a five-minute access token. The interactive OIDC fixture is
  used only for onboarding, recovery and step-up — **not every sync**.
- Treat **controlled-identifier and `did:key` suites as explicit optional profiles**, never automatic
  equivalents to a WebID (S-21, ADR-0004). `did:key` is a future profile, not the hackathon default.
- **Sender-constraint coexistence (S-23):** preserve baseline LWS **Bearer** interoperability for
  permitted (lower) grades, and advertise a **profiled sender-constraint requirement (DPoP or equivalent
  proof-of-possession) for higher assurance grades**. A profiled sender-constraint extension **MUST NOT**
  be mislabeled as baseline LWS behavior (standards-roadmap.md). Downgrade behavior — what happens when a
  client cannot meet the sender-constraint requirement for a high grade — is: **deny the high-grade
  operation and return a step-up/capability challenge**, never silently downgrade the token.
- The **LWS ODRL Access Request/Grant** model is the standards surface carrying the connection ceremony
  (S-19): client, purpose, target, duration; extended only for Databox relationship, assurance and legal
  terms (ADR-0012/0013).

## Alternatives considered
- **Bearer everywhere (pure LWS baseline).** Rejected for high grades: bearer tokens are replayable;
  high-assurance records need sender constraint (isolation §threat "replaying a credential"). Kept for low
  grades to preserve interoperability.
- **Sender-constraint everywhere.** Rejected: breaks baseline LWS clients that only do Bearer, violating
  the interoperability guarantee (ADR-0025) for grades that don't need it.
- **`did:key`/controlled-identifier as the default consumer suite.** Rejected for hackathon (S-21,
  ADR-0004): not interchangeable with WebID on the Solid path; kept as optional profile.
- **Live SAML IdP for the hackathon.** Rejected (hackathon-profile.md): out of scope; interface + fixture
  only.

## Consequences
- **Positive:** unattended sync without storing a long-lived bearer refresh token (ADR-0009); standards
  alignment with LWS; graduated security matched to record grade.
- **Negative / cost:** two token schemes to support and test; the self-signed CID proof + token-exchange
  glue is net-new (DBX-01 §9) and security-sensitive.
- **Privacy & threat notes:** the five-minute holder-key JWT bounds replay windows; sender constraint for
  high grades closes token-theft escalation. Downgrade-attack surface is handled by "deny + step-up".

## Failure behavior
Unknown/unsupported authentication suite → reject. A high-grade request presenting a Bearer token where a
sender-constraint is required → deny + step-up challenge (never downgrade). Expired or wrong-realm subject
token → no access token issued.

## Open sub-questions / residual gates
- Exact RFC 8693 subject/actor-token modelling for the connection credential + holder proof → DBX-12
  (shared Blocked sub-question with ADR-0005).
- Whether "equivalent proof-of-possession" beyond DPoP is admitted for sender constraint → DBX-12 ADR.
- SAML suite concretisation and `did:key` profile → deferred beyond the hackathon (S-21).
