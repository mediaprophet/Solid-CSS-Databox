# ADR-0005 — Databox authorization server / broker and external IdP trust

- **Status:** Adopted (with a Blocked sub-question on broker↔storage token semantics)
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security, identity — the token-exchange trust boundary and issuer-claim contract are the highest-value attack surface; human security review required before production (DBX-12 gate).
- **Sources adjudicated:** R-03; review-item #1; review-item #2; S-03; S-04; S-05; S-20; implementation-decisions.md "Governing boundary".
- **Consumed by / blocks prompts:** DBX-04, DBX-06, DBX-12, DBX-27, HAK-03, HAK-04.
- **Relates to:** ADR-0006 (auth suites/token exchange), ADR-0009 (token lifecycle), ADR-0010 (assurance), ADR-0025 (interop).

## Context
Solid is the protected data-sharing layer, not the primary human IdP (implementation-decisions.md
governing boundary). A consumer normally authenticates to an organisation-approved external IdP first; a
controlled exchange then produces the CSS-compatible security context. CSS 7.1.9 has **no** issuer
allowlist and accepts any cryptographically valid issuer (DBX-01 §2), and **no** RFC 8693 token exchange
or AS-discovery (DBX-01 §9). Two review items were left "Decision required": whether a broker/token
exchange is required (review 2) and which IdPs are accepted (review 1).

## Decision
- Adopt a **separately deployable Databox authorization server / broker** (R-03). It is a trust boundary
  and **MUST** remain independently deployable even when bundled with CSS for a small install.
- **IdP trust is a per-program profile choice, not a universal allowlist** (review 1, S-03). Each program
  profile **MUST** declare its trusted issuers, protocols, the exact claim contract, accreditation, the
  assurance mapping (ADR-0010) and failure behavior. Providers such as myID/Entra/federation are
  *examples*, not built-in trust.
- The broker **MUST** validate the complete issuer, subject, audience, client, time, signature and
  assurance claim contract before producing any Databox security context (R-03). Unknown/unmapped claims
  fail closed.
- External IdPs authenticate the **human only**; they never become the Databox storage server or the WAC
  authority (R-03). The broker maps a verified external authentication to the program-specific
  WebID/relationship (ADR-0004) and normalized assurance (ADR-0010).
- **A conforming Solid-OIDC path MUST be preserved** (S-04, invariant 12, review 2): any exchanged token
  **MUST** retain validated WebID, client, issuer, audience and proof-of-possession semantics. A
  proprietary broker token **MUST NOT** be the only way to reach the resource server. Independent clients
  identify/register via the adopted Solid-OIDC client rules (S-05).
- **Track A** exposes the Solid-OIDC-compatible access path; **Track B** implements pinned LWS AS
  discovery (via `WWW-Authenticate` challenge) and RFC 8693 token exchange (R-03, S-20). Where Track B is
  enabled, the Databox broker **SHOULD** be the LWS authorization server (S-20), advertised and
  independently deployable.
- **Do not infer a broker merely because DPoP is preserved** (review 2): the broker exists to convert an
  external authentication credential into a storage-audience token, not as a side effect.

## Alternatives considered
- **No broker; accept external IdP tokens directly at CSS.** Rejected: external tokens are rarely
  audience/proof-suitable for CSS, and CSS has no issuer trust list (DBX-01 §2) — direct acceptance would
  trust any valid issuer. The broker is where per-program issuer trust and audience rebinding live.
- **Broker emits only a proprietary token.** Rejected (S-04, invariant 12): kills independent-client
  interoperability. A conforming Solid-OIDC path must remain.
- **Global allowlist of IdPs baked into the server.** Rejected (review 1): assurance and accreditation are
  program-specific; a global list would either over-trust or block legitimate programs.

## Consequences
- **Positive:** clean separation of human-identity assurance from resource authorization; per-program
  trust; supports both Track A and Track B without collapsing them.
- **Negative / cost:** a new service to build, deploy, key-manage and threat-model; the highest-value
  target in the system.
- **Privacy & threat notes:** defends confused-deputy, wrong-audience and token-replay (isolation §threat
  cases). The broker must never become a cross-program correlation point — it handles pairwise subjects
  only (ADR-0004).

## Failure behavior
Any claim outside the program's declared contract, wrong audience/client, expired or unverifiable
signature, or unmapped assurance → refuse to issue a token (fail closed). Broker unavailability → no new
tokens (existing short-lived tokens expire naturally); it never falls back to accepting raw external
tokens at the storage server.

## Open sub-questions / residual gates
- **Blocked sub-question:** the exact wire semantics binding the long-term connection credential + fresh
  holder-key proof into RFC 8693 token exchange (subject-token vs actor-token modelling) — unblocked by
  DBX-12/DBX-13 producing the token-exchange ADR with the pinned LWS draft; see ADR-0006 and ADR-0009.
- SAML and non-OIDC suites are evaluated in ADR-0006 (S-21), not here.
