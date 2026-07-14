<!--
ADR — Databox decision register (DBX-02). Cluster: foundational — Solid interoperability guarantee.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0025 — Solid interoperability guarantee for non-Databox clients

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the CORS/credentials/redirect/cookie/CSRF cross-origin rules (S-13) and the no-existence-leak denial behavior (S-12) are security-sensitive and need a named security reviewer; privacy — the "safely ignorable extension advertising must not leak relationship facts" surface should be sighted by a privacy reviewer.
- **Sources adjudicated:** S-03, S-05, S-07, S-09, S-10, S-12, S-13, S-14, S-15, S-16, S-19, S-25; implementation-decisions.md "Solid interoperability requirement"; README invariant 12; DBX-01 §2 (auth), §3 (404-not-403 existence rule), §4 (LDP/converter/storage-description surface).
- **Consumed by / blocks prompts:** DBX-05 (capability matrix / representation semantics), DBX-24 (progressive-enhancement client experience), DBX-27 (independent-interop proof). Also consumed by DBX-04, DBX-06, DBX-12, DBX-15, DBX-21.
- **Relates to:** ADR-0003 (adopted authorization surface / narrow-not-broaden — WAC baseline), ADR-0005 (Solid-OIDC path / external issuer acceptance), ADR-0020 (offline receipt/proof verification detail), ADR-0002 (advertised topology this guarantee is discovered over), ADR-0024 (enabling Track B must not break this Track A guarantee, S-25).

## Context

Invariant 12 is the load-bearing promise of the whole design: "Databox extensions preserve the standard Solid discovery, authentication and resource-operation surface so an independent conforming Solid client can exercise its granted access without proprietary transport or tokens." implementation-decisions.md restates it operationally: after the connection ceremony a consumer must be able to use an **independent conforming Solid client** to discover the server, authenticate through the adopted Solid-OIDC path with a user-controlled WebID/issuer, read permitted resources over standard HTTP + RDF content negotiation, append a permitted submission via standard LDP, use an advertised standard Solid notification channel, and receive standard status codes/headers on denial. The Databox must not become a proprietary API merely because an external login is used during onboarding. Equally, Solid compatibility does **not** imply public access, acceptance of every IdP, Pod-owner control over institutional evidence, or permission to overwrite append-only records.

The supporting S-questions sharpen this: S-03/S-05 (independent Solid-OIDC issuer + user WebID after onboarding; CSS need not be the IdP; standard client identification/registration), S-07 (standard HTTP/LDP ops + RDF media types per resource class, published as a capability matrix; append-only enforced by authorization/method denial, not by redefining methods), S-09 (generic discovery via standard links/descriptions + a Linked-Data connection document, no hidden SDK registry), S-10 (extensions advertised via stable RDF IRIs/profiles/`Link` remain safely ignorable), S-12 (denials keep standard status codes/challenges/headers with no existence leak), S-13 (CORS/credentials/redirect/cookie/CSRF for cross-origin browser clients), S-14 (RDF/evidence verifiable offline with pinned contexts), S-15 (guaranteed basic experience; advanced semantics are progressive enhancement), S-16 (interop proven by ≥2 independent stacks + 1 external issuer), S-19 (LWS access-request/grant as the candidate ceremony surface), S-25 (Track B must not change Track A representations).

CSS 7.1.9 gives this guarantee real substrate (DBX-01): the LDP/HTTP method handlers, RDF content negotiation, storage-description discovery (`StorageDescriptionAdvertiser`/`Handler`, §4), Solid-OIDC/DPoP verification via `@solid/access-token-verifier` (§2), and — importantly — the **existence-hiding denial rule already exists**: `PermissionBasedAuthorizer.reportAccessError` returns **404 instead of 403/401** when the agent lacks Read (§3, "as it makes any other agent permissions irrelevant"). The Databox authorizer **narrows** the standard result via a unioned `PermissionReader` (§3) and MUST NOT broaden a denial (S-08 / invariant 12). This ADR fixes the guarantee; the specific auth path, authorization surface and proof detail are delegated to related ADRs.

## Decision

After the connection ceremony, an **independent conforming Solid client** using an **accepted external Solid-OIDC issuer + a user-controlled WebID** MUST be able to do all of the following **without any Databox SDK, proprietary transport or proprietary token**:

1. **Discover** the resource server and its advertised capabilities through standard Solid links/descriptions and a **Linked-Data connection document** — **no hidden SDK registry** (S-09). Discovery reuses the CSS storage-description mechanism (DBX-01 §4); Databox and LWS capabilities are advertised as additive RDF, not a private catalogue.

2. **Authenticate** via the **adopted Solid-OIDC path** using an accepted user-controlled WebID and external issuer. **CSS need not be the IdP** (S-03/S-05); the program profile declares which issuers/assurance it accepts (this is not universal public acceptance — implementation-decisions.md). Standard Solid-OIDC client identification/registration is supported; any trust restriction is documented independently of any wallet vendor (S-05). *(The exact Solid-OIDC/broker path is ADR-0005; the assurance gate is the program profile.)*

3. **Read** permitted resources with **standard HTTP + RDF content negotiation** (Turtle/JSON-LD as the resource permits) — S-07. Representations are the standard Solid/LDP representations; enabling Track B MUST NOT change them (S-25; enforced by ADR-0024).

4. **Append** a permitted submission via **standard Solid/LDP operations** (POST create into a submission container). Append-only semantics are enforced through **authorization and method denial, not by redefining HTTP methods** (S-07; DBX-01 §4 `ReadOnlyStore`-pattern decorator that allows create, rejects replace via `hasResource`).

5. **Use an advertised standard Solid notification channel** (S-15) — advertised exactly as the pinned Solid Notifications spec defines it. This standard channel is a hint; the durable recovery contract is separate and separately named (ADR-0011, S-26) and is never presented as the Solid client API.

6. **Receive standard status codes / challenges / headers on denial, with NO existence leak** (S-12). Denials keep ordinary HTTP semantics and MUST **reuse the CSS 404-not-403 rule** (DBX-01 §3): lacking Read yields 404, not 403/401, so a probe cannot confirm a resource or another consumer's box exists. Machine-safe Databox reason/step-up data is carried in a **profiled representation** that does not break a generic client.

**Narrow-never-broaden (invariant 12, S-08).** Databox checks (tenant, relationship, assurance, ODRL, append-only) may **narrow** the standard authorization result but **MUST NEVER broaden a denial** into an allow. They compose as a unioned `PermissionReader` around the standard WAC result (DBX-01 §3), so a generic client's granted access is never silently widened by Databox logic and a standard denial is never overturned.

**Safely-ignorable extensions (S-10, S-15).** Databox extensions are advertised via **stable RDF IRIs, profiles and HTTP `Link`/content-type parameters**; an unknown extension **remains safely ignorable** by a generic client. Advanced semantics — ODRL rendering, receipt-proof verification, program review workflow — are **progressive enhancement**; their absence in a generic client MUST NOT block basic discovery, authentication, permitted read/append or standard notifications (S-15).

**Cross-origin browser clients (S-13, MUST).** Because independent browser clients are not same-origin portal code, the deployment MUST define and advertise **CORS** (allowed origins/methods/headers, credentialed-request handling), **credentials/cookie** rules (program-bound per ADR-0002; no reliance on ambient same-origin cookies), **redirect** handling for the OIDC front channel, and **CSRF** protections for state-changing operations. These rules are program-origin-bound (ADR-0002) and MUST NOT assume same-origin behavior.

**Offline-verifiable RDF/evidence (S-14).** Exported RDF and evidence MUST be verifiable **without dereferencing mutable or organisation-private contexts**: use stable contexts/vocabularies with **pinned hashes** (ADR-0001) and provide offline verification bundles; test JSON-LD and at least one Turtle/RDF path where the resource permits. *(Receipt/proof-suite detail is deferred to ADR-0020.)*

**Ceremony standards surface (S-19).** The **LWS ODRL-based access-request / access-grant model is the candidate standards surface** for the connection ceremony (client, purpose, target, duration), **extended only** for Databox-specific relationship, assurance and legal-policy terms — it is not duplicated or replaced by a proprietary ceremony. *(Track B pinning/isolation per ADR-0001/ADR-0024.)*

## Alternatives considered

- **Ship a Databox SDK / proprietary transport as the only client path.** Rejected (invariant 12, S-09): it makes the Databox a proprietary API, defeats portability and the "independent conforming client" promise, and hides discovery in a private registry. All six capabilities must work with a generic Solid client.
- **Require CSS to be the identity provider.** Rejected (S-03/S-05): the governing boundary is that Solid is the protected data-sharing layer, not the primary human IdP; consumers authenticate to an organisation-approved external issuer. CSS need not be the IdP.
- **Return 403/401 on denial with a descriptive reason.** Rejected (S-12, DBX-01 §3): revealing 403 confirms the resource exists and leaks another consumer's box existence. The CSS 404-not-403 existence-hiding behavior is reused; safe reason/step-up data goes in a profiled representation only.
- **Enforce append-only by redefining or restricting HTTP methods (custom verbs / blanket read-only).** Rejected (S-07; DBX-01 §4 sharp edge): `setRepresentation` serves both create and replace, so a blanket block would break legitimate creation; and redefining methods breaks generic clients. Append-only is enforced by authorization + selective method denial that allows create and rejects replace/modify/delete.
- **Let Databox ODRL/assurance logic override a standard grant when it wants to allow more (e.g., emergency access).** Rejected (invariant 12, S-08): Databox checks may only narrow, never broaden, a standard authorization result. Broadening would make the standard surface an unreliable description of actual access.
- **Advertise extensions with bespoke non-RDF headers or custom content types a generic client cannot ignore.** Rejected (S-10): extensions must be stable RDF IRIs/profiles/`Link` parameters that are safely ignorable; anything a generic client chokes on breaks invariant 12.
- **Assume same-origin portal behavior for browser clients.** Rejected (S-13): independent browser clients are cross-origin; without explicit CORS/credential/redirect/CSRF rules they cannot exercise granted access, breaking the guarantee.

## Consequences

- **Positive:** The Databox is provably a Solid resource server, not a walled API: a stock Solid client with a user's own WebID/issuer can discover, authenticate, read, append and subscribe. Reusing CSS's LDP/converter/storage-description/404-hiding substrate (DBX-01 §2-§4) means most of the guarantee is standard behavior plus a narrowing authorizer, not a new transport. Progressive enhancement lets advanced Databox features exist without gating basic access.
- **Negative / cost:** The guarantee is a standing test obligation — it must be *proven*, not asserted (S-16: ≥2 independent non-Databox client stacks + 1 external issuer), which is real interop-testing cost owned by DBX-27. Carrying machine-safe reason/step-up data in a profiled representation without breaking generic clients (S-12) and defining correct cross-origin CORS/CSRF (S-13) are exacting. Offline-verifiable RDF with pinned contexts (S-14) constrains vocabulary choices.
- **Privacy & threat notes:** The 404-not-403 reuse closes the *existence-leak* and *guess-box/resource-identifier* threats (isolation-and-privacy.md) at the interoperability boundary. Safely-ignorable RDF advertising must not itself leak relationship facts (a generic client discovering the box must not learn other connections — invariant 5; privacy review). The cross-origin rules (S-13) are where CSRF/credential-leak threats for browser clients are closed; getting CORS credentialed-request handling wrong is a real risk (security review). Narrow-never-broaden guarantees Databox logic cannot be tricked into widening access beyond the standard grant.

## Failure behavior

Fail closed, without leaking:
- A denied or unauthenticated request follows the **404-not-403** existence-hiding rule (DBX-01 §3) — never a 403 that confirms existence, never a body that reveals another consumer's box.
- If a Databox narrowing check cannot be evaluated (missing/invalid tenant, relationship, assurance or ODRL input), it resolves to **deny**; it MUST NOT default to the broader standard grant.
- If a generic client requests a representation the resource class does not support, it receives a standard `406`/`415`/`405` (per the capability matrix, S-07) — not a proprietary error and not a silent Track B substitution (S-25).
- If offline verification context/hashes are unavailable or fail to match the pinned values (S-14), the evidence is treated as unverifiable rather than assumed valid.
- Cross-origin requests that fail CORS/credential/CSRF rules (S-13) are refused per standard browser/security semantics; ambiguous origin ⇒ deny (never wildcard-with-credentials).
- Advanced-semantic absence in a client is not a failure at all: basic discovery/auth/read/append/notify MUST still succeed (S-15).

## Open sub-questions / residual gates

- **Interop is PROVEN, not asserted:** demonstrating the guarantee against **≥2 independent non-Databox client stacks + 1 external Solid-OIDC issuer** (S-16) is owned by **DBX-27** — recorded here as the residual proof gate. This ADR fixes the guaranteed behaviors; DBX-27 supplies the evidence.
- The **published capability matrix** (which HTTP/LDP ops and RDF media types per resource class, S-07) is authored by **DBX-05**; this ADR fixes the standards-preservation rules it must satisfy.
- The **exact Solid-OIDC path, external-issuer acceptance and client-registration rules** (S-03/S-05) are fixed by **ADR-0005**; the **authorization surface / narrow-not-broaden baseline** (S-08) by **ADR-0003**; this ADR requires only that they preserve the standard client experience.
- The **receipt/proof-suite offline-verification detail** (S-14) is deferred to **ADR-0020**; this ADR fixes the pinned-context / offline-bundle requirement.
- The **concrete CORS/credentials/redirect/cookie/CSRF configuration and test vectors** (S-13) are owned by DBX-06/DBX-26 under the named security reviewer; the *requirement to define and advertise them* is fixed here.
- The **progressive-enhancement client experience** (S-15) detail is owned by **DBX-24**.
