# Implementation Decisions and Open Questions

## Purpose

This register turns the implementation review into decisions that engineering agents can safely consume. It
distinguishes architectural invariants from recommendations and unresolved protocol choices. A statement in a
concept document is not proof that a mechanism already exists in Community Solid Server (CSS).

Status meanings:

- **Adopted** — a Databox architectural requirement, subject to detailed specification;
- **Profile choice** — each organisation must declare and validate its choice;
- **Decision required** — alternatives must be resolved in an ADR before dependent implementation;
- **Rejected as stated** — the proposed answer would create a false assurance or unsafe implementation.

## Governing boundary

Solid is the protected data-sharing layer, not the primary human identity provider. A consumer normally authenticates
to an organisation-approved identity provider first. A controlled exchange or broker may then produce the
CSS-compatible security context required for a Databox request. That is a proposed component, not functionality that
can be assumed to exist in CSS.

The implementation must keep four artefacts distinct:

1. an external authentication event and its assurance evidence;
2. a relationship credential describing the program-specific binding;
3. a short-lived, audience-bound and sender-constrained access token;
4. independently verifiable record and acceptance evidence.

The relationship credential is not an API key and possession of it does not grant background access.

## Adjudication of the implementation review

| # | Question | Status | Correct implementation position | Resolving prompt |
|---:|---|---|---|---|
| 1 | Which identity providers are accepted? | Profile choice | Providers such as myID, Entra ID or institutional federation are examples, not a universal allow-list. Each program profile must declare trusted issuers, protocols, claim contract, accreditation, assurance mapping and failure behavior. | DBX-02, DBX-06, DBX-12 |
| 2 | Is an identity broker or token exchange required? | Decision required | A broker is recommended when the external token is not directly suitable for CSS. Specify token exchange, audience, issuer, DPoP or equivalent proof-of-possession, key binding and trust boundaries before implementation. Do not infer a broker merely because DPoP is preserved. | DBX-02, DBX-04, DBX-12 |
| 3 | How is level of assurance mapped to access grade? | Profile choice | The dimensions are known, but the vocabulary and crosswalk are not. A signed, versioned mapping must distinguish identity proofing, authenticator, federation, freshness and step-up; record-class gates use the normalized result. | DBX-02, DBX-06, DBX-14 |
| 4 | Does the connection credential enable a long-running vault connection? | Adopted | Yes. It is the long-term, API-key-like authority installed in the consumer's vault and permits unattended connection use within its active grant. It is holder-key-bound rather than a bearer secret and is used with fresh proof to obtain short-lived access tokens. Interactive login is reserved for issuance, recovery, renewal/step-up conditions and material changes. | DBX-02, DBX-12, DBX-13, DBX-24 |
| 5 | Must each relationship bind a WebID, DID and public key? | Rejected as stated | Do not require three identifiers without a protocol need. Use an HTTP(S) WebID where Solid-OIDC/ACP requires one, bind the active holder key, and make a DID optional. If used, specify DID method, verification relationship, controller and rotation rules. | DBX-02, DBX-07, DBX-13 |
| 6 | How are tokens refreshed, revoked and stepped up? | Decision required | Relationship suspension, key rotation and step-up are requirements. Refresh-token/offline-grant issuance, token family rotation, introspection or status, revocation latency and re-authentication triggers need a normative protocol ADR. | DBX-02, DBX-12, DBX-13 |
| 7 | Are WebSockets required? | Adopted | No. HTTPS operations are authoritative. WebSockets or Solid Notifications may provide low-latency hints only; they cannot be the sole durable record of a deposit, submission or duty. | DBX-04, DBX-21 |
| 8 | Is LDN the mandatory durable baseline? | Decision required | The design requires an interoperable durable notification contract, but must choose whether that is outbound LDN, a durable consumer inbox, a pull event feed, or a profiled combination. An HTTP POST success is not by itself proof of durable consumer access. | DBX-02, DBX-04, DBX-21 |
| 9 | Can missed events be recovered from the outbox/inbox? | Rejected as stated | A provider outbox supports reliable dispatch; it does not automatically give the consumer a recovery API. Define a cursor-based event feed or state-reconciliation protocol, retention window, ordering rules and deduplication keys. | DBX-04, DBX-21, DBX-24 |
| 10 | When is an ODRL notification duty fulfilled? | Decision required | Queued, attempted, sent, HTTP-accepted, durably retrievable and consumer-acknowledged are distinct states. Each policy template must select its fulfilment condition and remedy; the evidence ledger records every transition. | DBX-02, DBX-07, DBX-20, DBX-21 |
| 11 | Does an ELI identifier provide versioning, hashing and pinning? | Rejected as stated | ELI can identify legislation and versions where a publisher supplies suitable metadata. It does not automatically pin the processed corpus. Create an immutable corpus manifest containing source URI, jurisdiction, expression/version, retrieval time, media type, canonical content digest and provenance. | DBX-02, DBX-06, DBX-18 |
| 12 | Does the ODRL evaluator decide commencement, repeal and transition? | Rejected as stated | Legal temporal and jurisdictional applicability belongs in a legal-ingestion/compilation stage with human attestation. The runtime evaluator consumes a signed, versioned compiled policy and records the exact inputs; it must not improvise legal interpretation. | DBX-04, DBX-06, DBX-07, DBX-20 |
| 13 | Are machine outputs merely proposed until human-attested? | Adopted with scope | Machine-generated legal interpretations and normative mappings remain proposed until an authorized human attests them. This does not mean every factual system event needs prior human signature. Record author, method, verification state and attester separately. | DBX-05, DBX-07, DBX-19 |
| 14 | Is the WebCivics-to-ODRL mapping already defined? | Decision required | It is a required compilation artefact, not an existing implementation. Define loss-aware mappings for jural correlatives, legitimacy, jurisdiction, provenance, accountability and policy source; validate them with shapes and human review. | DBX-07, DBX-20 |
| 15 | Is policy conflict precedence settled? | Partly adopted | Use the WebCivics source ordering as an input: mandatory baseline outranks guardian policy, which outranks user preference; ties prefer the more protective result. Still specify how this composes with ODRL conflict strategies, statutory conflicts, jurisdiction and emergency exceptions. | DBX-02, DBX-07, DBX-14, DBX-20 |
| 16 | Is appeal implemented by step-up or a staff queue? | Rejected as a single choice | Step-up remedies insufficient authentication; review and appeal contest a substantive decision. A denial may expose both routes when applicable, without leaking protected facts. Define responsible body, filing method, time limits, evidence and outcome notification. | DBX-06, DBX-14, DBX-23 |
| 17 | Do policy updates affect only new records? | Rejected as stated | Accepted record bytes and historical evidence remain immutable, but authorization and legal obligations can change. Each update needs effective time, affected asset classes, prospective/retroactive rule, migration or re-evaluation behavior and retained historical policy material. | DBX-02, DBX-06, DBX-20 |
| 18 | Does a signed receipt prove which legislative corpus governed? | Rejected as stated | A policy-version string is insufficient. Bind the receipt/evidence event to the compiled policy digest, corpus-manifest digest, interpretation/attestation identifier, evaluator version and retained verification material. | DBX-06, DBX-18, DBX-19 |

## Identity identifier decision

Solid-OIDC identifies a user with an HTTP(S) WebID. A DID therefore must not silently replace the WebID in an
existing Solid authorization path. `did:web` can identify an organisation or key controller where its DNS and TLS
control model is acceptable. The [Solid DID method](https://solid.github.io/did-method-solid/) is useful input for
experimentation, but production adoption requires an explicit maturity, resolution, recovery and interoperability
decision. A relationship credential may link identifiers without making them interchangeable.

Recommended minimum binding:

```text
program audience + opaque Databox ID + pairwise holder identifier + holder key
```

Add a WebID when the selected Solid authentication/authorization path requires it. Add a DID only for a documented
verification or portability purpose.

## Transport decision

Use protocols by function:

| Function | Authoritative mechanism | Optional acceleration |
|---|---|---|
| Login and connection ceremony | HTTPS redirect/front-channel plus secure back-channel exchange | None required |
| Deposit, retrieval and submission | Authenticated HTTPS | None required |
| Signed acceptance receipt | Synchronous HTTPS response after durable commit | Later retrieval endpoint |
| Durable event discovery | Profiled LDN/inbox or cursor-based pull feed | WebSocket/Solid Notification hint |
| Large or resumable evidence | Profiled HTTPS upload protocol | Progress events |

A real-time hint carries an opaque event identifier, not sensitive record content. After any disconnect, the
consumer agent recovers from the durable event mechanism and reconciles current state.

## Legislative policy provenance

The enforceable chain is:

```text
authoritative legal source
  -> immutable corpus manifest and content digests
  -> jurisdiction/commencement/applicability analysis
  -> machine-proposed normative mapping
  -> authorized human attestation
  -> signed Databox/ODRL policy bundle
  -> ACP and Databox runtime controls
  -> receipt and append-only evidence event
```

Later verification must be possible without trusting a mutable URL. The retained evidence bundle therefore needs
the policy/profile versions, their digests, the corpus-manifest digest, attestation, evaluator version, signing-key
history and applicable status/revocation evidence.

## Solid interoperability requirement

The organisation-hosted Databox is a Solid resource server with additional constraints and workflows. It must not
become a proprietary API merely because the organisation uses an external login during onboarding.

After the connection ceremony, a consumer must be able to use an independent conforming Solid client to:

1. discover the resource server and its advertised capabilities;
2. authenticate through the adopted Solid-OIDC path using an accepted user-controlled WebID and issuer;
3. retrieve resources for which the consumer has read access using standard HTTP and RDF content negotiation;
4. append a permitted submission using standard Solid/LDP operations;
5. discover and use any advertised standard Solid notification channel; and
6. receive standard HTTP status codes and discovery headers when an operation is denied or unsupported.

A generic Solid client is not expected to understand every Databox ODRL term, render a legal explanation, verify a
Databox receipt proof suite or perform a program review workflow. Those are progressively enhanced capabilities.
Their absence must not prevent basic standards-compliant access. Conversely, Solid compatibility does not imply
public access, acceptance of every identity provider, Pod-owner control over institutional evidence, or permission
to overwrite append-only records.

The implementation baseline must pin dated versions of the [Solid Protocol](https://solidproject.org/TR/protocol),
[Solid-OIDC](https://solidproject.org/TR/oidc), the selected authorization specification, and the
[Solid Notifications Protocol](https://solidproject.org/TR/notifications-protocol). These reports evolve; a claim
of compatibility must identify the exact testable baseline rather than say only “Solid compatible”.

## Additional Solid interoperability questions

These questions supplement the original 18 and must be resolved before a production conformance claim. S-18 through
S-27 arise from the W3C Linked Web Storage Working Group charter and June 2026 Working Drafts; see the
[Standards roadmap](standards-roadmap.md).

| ID | Question | Recommended direction | Primary prompts |
|---|---|---|---|
| S-01 | Which dated Solid specifications, errata and conformance-test versions form the release baseline? | Pin them in a signed compatibility manifest and review changes during upgrades. | DBX-01, DBX-02, DBX-27 |
| S-02 | Is the Databox presented as a Solid storage, a resource subtree, or another advertised service? | Specify its discoverable topology and avoid claiming personal Pod ownership where the organisation is custodian. | DBX-02, DBX-04, DBX-27 |
| S-03 | Can a consumer use an independent Solid-OIDC issuer and WebID after onboarding? | Yes, when the issuer and achieved assurance satisfy the program profile; do not require CSS to be the IdP. | DBX-06, DBX-12, DBX-24 |
| S-04 | If a broker is used, does it output a fully conforming Solid-OIDC exchange or a proprietary token? | Preserve a conforming Solid-OIDC path. Any exchanged token must retain validated WebID, client, issuer, audience and proof-of-possession semantics. | DBX-02, DBX-12, DBX-27 |
| S-05 | How does an independent client identify and register itself? | Support the adopted Solid-OIDC client identifier/discovery rules; document any trust restrictions independently of the wallet vendor. | DBX-06, DBX-12, DBX-27 |
| S-06 | Must the consumer use a pairwise WebID, and who creates it? | Permit user-controlled pairwise WebIDs but do not silently mint an organisation-controlled identity or require a global correlatable WebID. Define migration and recovery. | DBX-02, DBX-13, DBX-24 |
| S-07 | Which standard HTTP/LDP operations and RDF media types work on each Databox resource class? | Publish a capability matrix. Preserve standard semantics; enforce append-only rules through authorization and method denial rather than redefining methods. | DBX-05, DBX-15, DBX-17, DBX-27 |
| S-08 | Which authorization system is the interoperable baseline: WAC, ACP, or a declared combination? | Choose and advertise one per deployment. Databox checks may narrow standard authorization but never broaden a denial. Test with clients that do not understand Databox policy. | DBX-02, DBX-07, DBX-14, DBX-27 |
| S-09 | Can a generic client discover containers, access-control resources and storage metadata without custom URL knowledge? | Provide standard links and descriptions, plus a connection document that uses Linked Data rather than a hidden SDK registry. | DBX-04, DBX-10, DBX-27 |
| S-10 | How are Databox extensions advertised without changing ordinary Solid representations? | Use stable RDF IRIs, profiles and HTTP `Link`/content-type parameters where specified; unknown extensions remain safely ignorable. | DBX-05, DBX-07, DBX-15 |
| S-11 | Which notification mechanisms are standard Solid subscriptions, and which are Databox durable delivery? | Advertise supported Solid channels exactly as specified and keep the durable recovery/duty contract separately named. Never call an internal outbox a Solid client API. | DBX-04, DBX-21, DBX-27 |
| S-12 | Do custom denials preserve standard status codes, authentication challenges, headers and non-disclosure behavior? | Yes. Put machine-safe Databox reason and step-up data in a profiled representation without breaking ordinary clients. | DBX-05, DBX-14, DBX-27 |
| S-13 | Are browser clients supported across program origins? | Define CORS, credentials, redirects, cookies and CSRF rules for independent browser clients; do not rely on same-origin portal behavior. | DBX-03, DBX-06, DBX-26, DBX-27 |
| S-14 | Can exported RDF and evidence be consumed without dereferencing mutable or organisation-private contexts? | Use stable contexts/vocabularies, pinned hashes where necessary and offline verification bundles. Test JSON-LD and at least one Turtle/RDF path where the resource permits it. | DBX-07, DBX-18, DBX-24 |
| S-15 | What basic experience is guaranteed to a non-Databox-aware Solid client? | Guarantee discovery, authentication, permitted read/append operations and standard notifications; expose advanced semantics as progressive enhancement. | DBX-05, DBX-24, DBX-27 |
| S-16 | Which independent implementations prove interoperability? | Test at least two non-Databox client stacks and one external Solid-OIDC issuer, alongside the reference agent; record limitations rather than substituting mocks. | DBX-25, DBX-27 |
| S-17 | How will upstream Solid and CSS changes be adopted without silently breaking compatibility? | Maintain a compatibility manifest, upstream-change watch, regression suite and explicit migration/deprecation policy. | DBX-01, DBX-27, DBX-28 |
| S-18 | Does the release claim current Solid compatibility, LWS 1.0 Working Draft compatibility, or both? | Publish separate Track A and Track B results. Never merge their assertions into an ambiguous “Solid compatible” claim. | DBX-01, DBX-02, DBX-27 |
| S-19 | Can the LWS access-request/grant model carry the Databox connection ceremony? | Prototype it as the standards surface for client, purpose, target and duration; extend it only for Databox-specific relationship, assurance and legal-policy terms. | DBX-04, DBX-07, DBX-13 |
| S-20 | Is the Databox broker the LWS authorization server? | Prefer this alignment where Track B is enabled: advertise it, accept adopted authentication-credential types and perform RFC 8693 token exchange. Keep the role independently deployable. | DBX-04, DBX-12 |
| S-21 | Which LWS authentication suites are supported? | Initially profile OIDC and evaluate SAML for government/university federation. Treat controlled-identifier and `did:key` suites as explicit optional profiles, not automatic equivalents. | DBX-02, DBX-06, DBX-12 |
| S-22 | How are WebIDs, controlled identifiers, DIDs, IdP subjects and pairwise relationship identifiers related? | Define typed, directional bindings and authoritative resolvers. Do not collapse identifiers into one interchangeable subject field. | DBX-02, DBX-07, DBX-13 |
| S-23 | How can sender-constrained high-assurance access coexist with the current LWS Bearer-token baseline? | Preserve baseline interoperability for permitted grades and advertise a profiled sender-constraint requirement for higher grades; resolve downgrade and client-capability behavior in an ADR. | DBX-02, DBX-12, DBX-14 |
| S-24 | Who is the LWS storage controller for an organisation-hosted Databox? | The accountable organisation normally controls the storage; the consumer is the protected assignee/rights holder. Encode governance, redress and non-waivable rights separately from storage control. | DBX-04, DBX-06, DBX-07 |
| S-25 | How do LWS media types, storage descriptions, containers and operations coexist with the CSS Solid/LDP surface? | Build versioned adapters and capability negotiation. Do not change a Track A resource representation merely by enabling Track B. | DBX-04, DBX-05, DBX-15, DBX-27 |
| S-26 | Can the incomplete LWS notification text be used as the durable Databox contract? | No. Track its development, implement only pinned testable assertions, and retain the separately specified durable recovery mechanism. | DBX-02, DBX-21, DBX-27 |
| S-27 | What maturity gate applies to changing Working Draft features? | Feature-flag and pin them; require migration review, traceable tests, independent interoperation and security/privacy/accessibility/internationalization review before graduation. | DBX-27, DBX-28 |

## Definition of resolved

An item marked **Decision required** becomes adopted only when an ADR supplies:

- normative behavior and failure behavior;
- privacy and threat analysis;
- interoperable request, response and evidence shapes;
- lifecycle, recovery and revocation behavior;
- conformance tests; and
- named human approval for security, legal-policy or cryptographic choices where applicable.
