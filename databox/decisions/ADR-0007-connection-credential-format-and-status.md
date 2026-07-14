# ADR-0007 — Databox Connection Credential: format, binding and status

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** cryptography, privacy — the holder-binding and "not-a-bearer-token" property is a core invariant; human crypto + privacy review required before production (DBX-13 gate).
- **Sources adjudicated:** R-04; HD-05; HD-06; review-item #4; identity-and-access.md "Databox Connection Credential"; consumer-vault-interoperability.md.
- **Consumed by / blocks prompts:** DBX-07, DBX-13, DBX-24, HAK-02, HAK-06.
- **Relates to:** ADR-0004 (pairwise holder), ADR-0008 (proof ceremony), ADR-0009 (token lifecycle), ADR-0020 (record proof suite alignment).

## Context
The connection credential is the long-term, portable authority a consumer installs in a vault to bootstrap
one program connection (invariant 4). Review item 4 confirmed it enables long-running unattended
connection use, but **as holder-key-bound authority, not a bearer secret**. CSS's existing long-lived
credential (client-credentials) is a reusable bearer secret (DBX-01 §2) — exactly what this must not be.
Format was fixed for the hackathon (HD-05/HD-06); this ADR makes it the production baseline and records
the rejected alternatives.

## Decision
- Issue a **W3C Verifiable Credentials Data Model 2.0** `DataboxConnectionCredential`, secured with
  **VC-JOSE-COSE**, media type `application/vc+jwt`, signed with **ES256** (HD-05, R-04). BBS
  selective-disclosure cryptosuites are **not** required for the demo (HD-05); may be a later profile.
- The credential **MUST** bind, at minimum: issuer (the accountable organisation, ADR-0004), program,
  opaque Databox identifier (ADR-0002), pairwise consumer subject + holder-key binding (ADR-0004),
  LWS storage-description + authorization-discovery entry points, access-grant identifier **and digest**,
  Databox/LWS/ODRL profile identifiers + versions, notification/cursor discovery, and status/revocation
  location (consumer-vault-interoperability.md; identity-and-access.md example).
- Credential status **MUST** use **BitstringStatusList** (`BitstringStatusListEntry`) (identity-and-access.md).
- Lifetime is program-defined **months/years or relationship-duration** (HD-06: one year in the demo),
  with status, suspension, revocation and rotation (R-04, ADR-0009).
- **The credential document is NOT a bearer token** (invariant 4, review 4): possession of its bytes alone
  **MUST NOT** authorize any request. Access requires a **fresh proof from the bound holder key**
  (ADR-0008) exchanged for a short-lived, audience-bound access token (ADR-0009). No access or refresh
  token is embedded (HD-06, consumer-vault-interoperability.md).
- **No global customer key or internal customer identifier** in the credential (R-04, isolation invariant);
  internal identifiers included only if strictly necessary and protected.
- A vault holds **many** such credentials, one per program, in an isolated per-program connection registry;
  a credential **MUST NOT** disclose the other connections (invariant 5, DBX-24).

## Alternatives considered
- **Reuse CSS client-credentials (`randomBytes(64)` secret).** Rejected: it is a reusable bearer secret
  (DBX-01 §2) — copied bytes would grant access, violating invariant 4. Studied as a lifecycle-store
  pattern only, deliberately diverged from.
- **SD-JWT / BBS selective disclosure now.** Deferred: adds complexity the hackathon doesn't need (HD-05);
  revisit when field-level minimised disclosure of credential contents is required.
- **StatusList2021 / OCSP-style status.** Rejected in favour of BitstringStatusList (VC 2.0-aligned,
  pinned in ADR-0001); avoids a second status mechanism.
- **Longer-lived embedded refresh token for convenience.** Rejected (ADR-0009, R-05): storing a
  high-value long-lived bearer refresh token in the vault is the exact anti-pattern the holder-key model
  avoids.

## Consequences
- **Positive:** stolen credential bytes are useless without the holder key; portable across conforming
  vaults; per-program isolation; standards-aligned (VC 2.0).
- **Negative / cost:** requires a VC-JOSE-COSE/ES256 toolchain (new dependency, DBX-01 §10) and a
  holder-proof ceremony at every unattended exchange (ADR-0008) — more moving parts than a bearer key.
- **Privacy & threat notes:** defends credential-replay and cross-program-replay (isolation §threat).
  Residual: vault key compromise → ADR-0009 rotation/revocation; status-list privacy (herd size) noted for
  DBX-13.

## Failure behavior
Credential presented without a valid fresh holder-key proof → no token (fail closed). Revoked/expired/
suspended status → refuse. Credential whose bound Databox/program/grant does not match the addressed realm
→ refuse (defends swap attacks, HAK-06 gate).

## Open sub-questions / residual gates
- BitstringStatusList herd-privacy and hosting location → DBX-13.
- Exact JSON-LD context pinning + schema → DBX-07/HAK-02 (must use pinned contexts per ADR-0025/S-14).
- Whether record proofs reuse this exact suite → yes, aligned in ADR-0020.
