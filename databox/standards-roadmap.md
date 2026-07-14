# Solid and Linked Web Storage Standards Roadmap

## Status date

This roadmap records the standards position reviewed on 2026-07-14. It must be refreshed before each compatibility
claim or release decision.

## DBX execution selection

The comprehensive DBX-01 through DBX-28 plan is the primary execution path. Track A is the production interoperability
baseline for the selected CSS version. Track B—the pinned W3C LWS Working Draft—is implemented through versioned,
experimental adapters and may graduate only through the conformance gates below. The shorter
[Hackathon profile](hackathon-profile.md) remains an optional early demonstrator, not the governing plan. Recommended
production decisions are recorded in [DBX recommended decisions](dbx-recommended-decisions.md).

## Standards governance

The W3C [Linked Web Storage Working Group](https://www.w3.org/groups/wg/lws/) is chartered to standardize a protocol
that loosely couples applications, identity and storage servers. Its charter runs from 2024-09-09 to 2026-09-08 and
uses the Solid Protocol as an input rather than treating every Community Group dependency as already mature.

Relevant sources are:

- the [Working Group charter](https://solid.github.io/solid-wg-charter/charter/);
- the [Working Group publication status](https://www.w3.org/groups/wg/lws/publications/);
- the [Linked Web Storage Protocol 1.0 Working Draft](https://www.w3.org/TR/lws10-core/);
- the LWS authentication suites for [OpenID Connect](https://www.w3.org/TR/lws10-authn-openid/),
  [SAML 2.0](https://www.w3.org/TR/lws10-authn-saml/),
  [controlled identifiers](https://www.w3.org/TR/lws10-authn-ssi-cid/) and
  [`did:key`](https://www.w3.org/TR/lws10-authn-ssi-did-key/);
- the current [Solid Protocol](https://solidproject.org/TR/protocol),
  [Solid-OIDC](https://solidproject.org/TR/oidc), authorization and notification reports used by deployed Solid
  implementations; and
- [Solid QA](https://solidproject.org/ED/qa) and the Working Group's future test suite and implementation report.

All LWS documents named above are Working Drafts, not W3C Recommendations. Their features, dependencies and wire
formats can change. The core draft also contains incomplete and feature-at-risk sections. They are authoritative
inputs for forward design, but not evidence that Community Solid Server already implements LWS 1.0.

## Two compatibility tracks

### Track A — deployed Solid ecosystem

Track A preserves interoperability with the CSS version selected by the release and independent clients using the
corresponding dated Solid Protocol, Solid-OIDC, WAC or ACP, and Solid Notifications reports.

This remains the initial production compatibility track. Databox extensions must not break its discovery,
authentication, HTTP/LDP, RDF, authorization or notification behavior.

### Track B — W3C Linked Web Storage 1.0

Track B implements a separately advertised, version-pinned LWS profile behind explicit feature flags until its
requirements and test suites are sufficiently stable. It must not be called W3C-conformant merely because selected
draft features work.

Track B is especially relevant to Databox because the June 2026 core draft includes:

- authentication credentials independent of a particular identity mechanism;
- a separate authorization server discoverable through a `WWW-Authenticate` challenge;
- OAuth 2.0 Token Exchange for converting OIDC, SAML or other authentication credentials into short-lived,
  storage-audience access tokens;
- storage descriptions and capability/service discovery;
- ODRL-derived access requests and access grants, including purpose, client, media-type, resource-type and temporal
  constraints; and
- a storage-controller role that can be distinct from the requesting consumer.

These concepts closely fit an organisation-hosted Databox, but their exact use requires decisions below.

## Proposed standards-aligned connection flow

```text
consumer + independent client
  -> organisation-approved OIDC, SAML or other adopted authentication suite
  -> signed authentication credential
  -> discover Databox authorization server and storage realm
  -> RFC 8693 token exchange
  -> short-lived, storage-audience access token
  -> ordinary LWS/Solid resource operation
  -> Databox assurance, relationship, ODRL and evidence enforcement
```

The connection credential is the long-term authority for the program relationship. With a fresh proof of its bound
holder key, it permits the vault to obtain ongoing short-lived access without repeating the original human login. It
is not substituted directly for an LWS access token. The Databox experimental profile must specify how this durable
authority and proof enter authorization/token exchange while keeping the pinned LWS authentication-credential model
intact. Program assurance remains an additional verified profile because the current LWS authentication suites do
not themselves define the Databox assurance crosswalk.

The portable [Databox Connection Credential](consumer-vault-interoperability.md) is the consumer-vault bootstrap. It
may carry the LWS Access Grant identifier and digest, storage discovery entry point and Databox profile versions.
Consistent with the LWS draft, the grant is a record that drives underlying authorization; neither it nor the
connection credential is presented to the storage server as the access token.

## Access request and grant alignment

The LWS ODRL-based Access Request and Access Grant model is a candidate standards surface for the Databox connection
ceremony:

```text
consumer requests access for a client, purpose, target and duration
  -> organisation/storage controller authenticates and evaluates the relationship
  -> controller issues a constrained access grant
  -> Databox packages its reference and discovery information in a connection credential
  -> consumer installs that credential in their selected vault
  -> authorization server uses active grants during token exchange
  -> Databox records grant, policy and revocation evidence
```

The Databox ODRL Profile should extend, not duplicate, the LWS Access Profile where the latter is applicable. Legal
rights, duties, consequences, receipts, review and redress remain Databox extensions unless adopted by the LWS
specification.

## Compatibility risks requiring isolation

- The checked-out CSS 7.1.9 source has no identified LWS 1.0 implementation surface; DBX-01 must confirm the gap.
- LWS access tokens in the current draft use the Bearer scheme, while Databox prefers sender-constrained tokens for
  higher-risk access. A profiled extension must not be mislabeled as baseline LWS behavior.
- LWS uses controlled identifier documents and multiple authentication suites; these are not automatically
  interchangeable with Solid WebIDs, `did:web`, `did:solid` or relationship credentials.
- LWS access grants may overlap with WAC, ACP and the Databox ODRL layer. One authoritative authorization composition
  and revocation model is required.
- The LWS notification text is incomplete. It cannot yet replace the Databox durable delivery and recovery contract.
- The organisation is normally the storage controller for institutional records, while the consumer is the protected
  assignee and rights holder. Documentation and UI must not imply that institutional custody eliminates consumer
  legal rights or redress.

## Conformance policy

Each release publishes separate results for Track A and Track B. The manifest records:

- exact dated specifications, Working Draft snapshots, commit hashes where necessary and dependency versions;
- supported server/client roles, authentication suites, authorization modes, media types and notification types;
- optional, experimental, feature-at-risk and unsupported features;
- test-suite version and assertion identifiers;
- independent implementations used for interoperability;
- security, privacy, accessibility and internationalization review status; and
- deviations, migration behavior and planned removal dates.

A Track B feature graduates from experimental only after its normative text is stable enough to test, the relevant
Working Group test assertions exist or equivalent tests are traceable, and independent interoperability has been
demonstrated. A later Working Draft never silently changes the behavior of an already deployed profile.
