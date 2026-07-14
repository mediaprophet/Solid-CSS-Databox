# ADR-0009 — Access-token, offline-operation, step-up and revocation lifecycle

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — revocation latency and offline-grant behavior are the core of prompt revocation; human security review required (DBX-12/DBX-13 gate).
- **Sources adjudicated:** R-05; review-item #6; S-23; identity-and-access.md "Revocation and recovery".
- **Consumed by / blocks prompts:** DBX-12, DBX-13, DBX-14, HAK-04, HAK-10.
- **Relates to:** ADR-0005 (broker), ADR-0006 (auth suites/sender-constraint), ADR-0007 (credential), ADR-0008 (proof), ADR-0010 (assurance/step-up).

## Context
Review item 6 left refresh/revoke/step-up as "Decision required". The connection credential is long-lived
but must not become a bearer refresh token (ADR-0007). Revocation must be prompt (isolation §threat).
CSS provides no such lifecycle; the LWS draft's RFC 8693 exchange (ADR-0006) is the mechanism.

## Decision
- **No general refresh tokens by default** (R-05). For unattended operation the vault mints a fresh
  short-lived authentication proof from its connection key and exchanges it under the active
  credential/grant (ADR-0006/0008). This avoids storing a high-value long-lived bearer refresh token in
  the vault.
- **Access token:** lifetime **five minutes** default (demo); audience **exactly one** Databox storage
  realm; client **and** holder binding required; sender-constrained for higher grades (ADR-0006, S-23)
  (R-05).
- **New-token issuance MUST check** credential status, relationship status, grant status, client and key
  status before issuing (R-05). Any failing → no token.
- **Resource access MUST re-validate** the token **and** the current relationship/grant suspension state
  on each request, so revocation takes effect within one token lifetime (prompt revocation) rather than
  waiting for token expiry alone (R-05).
- **Step-up (ADR-0010):** protected record classes or sensitive operations **MUST** require a new external
  authentication event with specified proofing/authenticator/freshness. Step-up is distinct from appeal
  (ADR-0023).
- **Inactivity:** the program profile defines when interactive re-authentication is required (R-05).
- **Recovery and holder-key change MUST always be interactive**, at an assurance appropriate to the
  relationship; an email-only reset **MUST NOT** restore access to records that required strong identity
  proofing (identity-and-access.md, R-05).
- **Supported lifecycle events** (identity-and-access.md): relationship suspension/revocation, key
  loss/replacement, agent migration, compromised-client removal, IdP/signing-key rotation, guardian
  appointment/expiry/revocation, and **retention of historical provenance without retaining obsolete
  access** (vault migration preserves history, not old access — DBX-13 gate).

## Alternatives considered
- **Issue long-lived refresh tokens for convenience.** Rejected (R-05): a stored long-lived bearer refresh
  token is a high-value theft target and defeats the holder-key model (ADR-0007).
- **Rely on token expiry alone for revocation.** Rejected: leaves a window up to the token lifetime with
  no server-side check; per-request relationship/grant re-validation gives prompt revocation.
- **Longer access-token lifetime to reduce exchange frequency.** Rejected for the demo: five minutes
  bounds replay and revocation latency; frequency is cheap given the self-signed CID exchange (ADR-0006).
- **Email-based recovery.** Rejected for high-proofing records: recovery assurance must match the original
  proofing (identity-and-access.md).

## Consequences
- **Positive:** no stored long-lived bearer secret; prompt (≤ one token lifetime) revocation; graduated
  step-up; clean separation of migration (keep history) from access (drop obsolete).
- **Negative / cost:** frequent token exchanges; per-request relationship/grant lookup adds latency and a
  hot path to optimise; guardianship lifecycle is complex (deferred detail to DBX-13).
- **Privacy & threat notes:** defends token-replay and stale-access-after-revocation. Revoking connection
  A must not affect connection B (HAK-10 gate) — enforced by per-connection isolation (ADR-0004/0007).

## Failure behavior
Any status/binding check failing → no token. Revoked/suspended relationship detected at resource time →
deny even if the token is unexpired. Recovery below the required assurance → refuse to restore
high-proofing records.

## Open sub-questions / residual gates
- Exact revocation-propagation mechanism and acceptable latency SLO → DBX-13.
- Guardianship (appointment/expiry/revocation, delegated scope) full model → DBX-13/DBX-14.
- Token-family/rotation detail if any bounded offline grant is later admitted → DBX-12 ADR.
