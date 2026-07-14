# Community Solid Server Implementation Scope

## Strategy

Implement Databox behavior as an extension package and configuration profile around Community Solid Server (CSS).
Avoid a long-lived fork until a generally useful CSS extension seam is proven to be missing.

CSS supplies the Solid data plane:

- LDP-compatible containers and resources;
- Solid-OIDC authentication;
- WebID-based identity;
- WAC and ACP authorization;
- multiple Pod provisioning;
- authenticated reads and writes;
- change-notification subscriptions;
- modular Components.js configuration.

The Databox extension supplies relationship, assurance, evidence and institutional workflow semantics.

## Solid compatibility boundary

Keep the ordinary Solid protocol path intact. Databox behavior should be introduced through composed authorization,
validation, immutable storage rules, advertised RDF profiles and post-operation evidence—not by replacing Solid HTTP
with a private API.

The standard surface includes, for the specification versions adopted by the release:

- HTTP/LDP resource and container operations, content negotiation and conditional requests;
- Solid resource/storage discovery and advertised auxiliary resources;
- Solid-OIDC authentication, WebID and client identification, including DPoP where required;
- the deployment's declared WAC or ACP authorization surface;
- CORS and authentication challenges suitable for independent browser and native clients; and
- any Solid Notifications channels the server advertises.

Databox-specific profiles may narrow an operation because of tenant, assurance, relationship, immutability or ODRL
requirements. They must return a standards-compatible denial and must not make a standard operation mean something
different. A generic client can read or append within its grant without understanding the additional terms; a
Databox-aware client can additionally render duties, verify receipts, request step-up and participate in review.

The onboarding portal and an identity broker are outside the Solid data plane. If a broker is adopted, its output
must feed a conforming Solid-OIDC resource-access path. The packaged deployment must also prove access from an
independent client using an external accepted Solid-OIDC issuer; testing only CSS's bundled IdP or the reference
Databox agent is insufficient.

Every release should publish a machine-readable compatibility manifest containing the CSS version, dated Solid
specification baselines, authorization mode, supported RDF media types, notification channel types, extensions and
known deviations. Maintain separate current-Solid and W3C Linked Web Storage tracks as defined in the
[Standards roadmap](standards-roadmap.md); draft LWS adapters must be explicitly advertised and feature-flagged.

## Proposed package

```text
@solid-databox/css-extension/
|- src/
|  |- authentication/
|  |- authorization/
|  |- provisioning/
|  |- protocol/
|  |- policy/odrl/
|  |- storage/
|  |- receipts/
|  |- notifications/
|  `- audit/
|- config/
|- templates/
|- profiles/
`- test/
   |- integration/
   `- conformance/
```

Institution-specific bridges remain separate services because they contain system-of-record mappings, workforce
identity, review workflows and business logic.

The hackathon integration plane additionally provides a protected, typed
`organisation/program/source-system/customerID-namespace/customerID` mapping to opaque relationship and Databox IDs;
a transactional source outbox consumer; program service WebID/client authentication; transformation/signing;
idempotent deposit; reconciliation; and submission-to-review routing. See
[Hackathon decisions](hackathon-decisions.md). Entra or another identity credential can support customer-linking
evidence but is not the operational mapping store.

## Authentication changes

CSS credentials currently retain an agent WebID, client identifier and issuer. Databox enforcement additionally
needs trusted assurance, authentication time, acting party, represented party and delegation context.

Implement an assurance-aware credentials extractor that:

- preserves Solid-OIDC token and sender-constraint validation;
- accepts assurance claims only from trusted issuers;
- maps external claims to a program assurance profile;
- distinguishes institutional service, operator, consumer and guardian identities;
- produces a request context suitable for authorization and audit.

If the token-verification dependency does not expose verified claims, extend that dependency or add a verified claim
adapter. Never decode a JWT without verification merely to obtain assurance.

## Authorization changes

Compose the selected ordinary Solid authorization system with a Databox policy reader or authorizer. The hackathon
uses WAC; a production profile may select WAC or ACP. The composed authorizer evaluates:

- program tenant and audience;
- WebID, client and issuer;
- active relationship;
- resource record class;
- current assurance versus minimum assurance;
- delegation scope and validity;
- immutable operation rules;
- declared submission purpose.
- applicable ODRL permission, prohibition, constraint and precondition duty.

The handler should produce structured allow and deny reason codes. A step-up denial should indicate the required
assurance without revealing protected resource contents.

## ODRL policy evaluation

Define a Databox ODRL Profile covering the program-specific actions, constraints, duties, consequences and remedies
that are not already in the ODRL Core or Common Vocabulary. The implementation needs:

- an ODRL validator that rejects malformed or unsupported policies;
- an evaluator with an explicit conflict strategy;
- a registry that resolves immutable policy versions;
- precondition duty checks before protected actions;
- obligation handlers for notification, receipt issuance, retention, deletion and review;
- durable duty state and retry processing;
- signed audit evidence for fulfillment, failure, consequence and remedy;
- fail-closed behavior for unknown profile terms.

ODRL is not a replacement for WAC or ACP. Solid authorization and Databox authorization guard HTTP access; ODRL
governs allowed use and required behavior concerning the asset. The policy attached to an accepted record must not
be silently replaced.

## Request context and audit

The current CSS authorization handler extracts credentials but downstream storage change events do not carry those
credentials. A Databox handler should retain authenticated and authorization context through operation completion so
that audit events can bind an actor to the exact accepted or denied request.

This can initially be done by replacing the configured authorization wrapper. A possible upstream CSS improvement is
a generic authenticated operation context and post-authorization audit hook.

## Provisioning

Create an organisation-only provisioning service using CSS Pod generation and Databox-specific templates. Provision:

- opaque box identifier;
- program-local relationship mapping;
- records, submissions, dispositions, receipts and audit-view containers;
- WAC or ACP resources generated from the program profile (WAC for the hackathon);
- notification destination and connection document;
- portable Databox Connection Credential and corresponding access-grant/policy binding;
- per-box encryption or key references where required.

Do not expose self-service Pod ownership as the Databox administration model. The consumer receives scoped data-plane
rights, not unrestricted control over institutional evidence or audit.

## Protocol gateway

Add an operation handler before ordinary storage mutation that validates:

- allowed container and operation;
- RDF/JSON-LD shape;
- signed record or credential proof;
- issuer and credential status;
- addressed holder and Databox relationship;
- record class, legal basis and minimum assurance;
- canonical digest and idempotency key;
- content-size and media-type limits.

Use streaming validation or bounded buffering for large binary evidence. Malware scanning and quarantine belong in a
controlled ingestion workflow and must not silently change the accepted payload.

## Storage enforcement

Add a storage or operation decorator that makes records, submissions, receipts and audit append-only according to
their class. ACP alone is insufficient because an administrative writer could otherwise issue an ordinary update or
delete.

For production evidence, use a durable event/audit subsystem outside ordinary Pod resources. CSS storage contains
the exchange resources and consumer-visible projections, not the only copy of the evidence ledger.

## Notification delivery

CSS can emit Solid change notifications to subscriptions. The Databox protocol also requires active delivery to a
consumer inbox in profiles that mandate Linked Data Notifications. Implement a durable outbound dispatcher with
endpoint validation, retries, idempotency, minimised payloads and audit integration.

## Work packages

1. Publish the universal Databox vocabulary, conformance requirements and profile schema.
2. Publish and validate the Databox ODRL Profile and program policy templates.
3. Build a synthetic loyalty-program profile and resource templates.
4. Implement opaque provisioning and tenant isolation.
5. Implement assurance-aware credentials and policy enforcement.
6. Implement the ODRL evaluator, obligation engine and durable duty state.
7. Implement deposit and submission validation.
8. Implement append-only resources, signed receipts and audit binding.
9. Implement durable outbound notification delivery.
10. Build a synthetic retailer bridge and review queue.
11. Run interoperability and adversarial conformance tests.
12. Propose only generic extension improvements upstream to CSS.
13. Publish and verify the Solid compatibility manifest with independent clients and an external accepted issuer.

The work packages are decomposed into executable prompts, dependency gates and agent capability levels in the
[Prompt implementation plan](prompt-implementation-plan.md). Progress is measured by accepted prompt outputs and
passing gates rather than calendar estimates.

## Minimum demonstration

A useful first demonstration proves:

- one wallet connects using different pairwise identities to two loyalty programs;
- neither program or provider tenant can discover the other connection;
- one program deposits a signed receipt with warranty and dietary metadata;
- the consumer retrieves and independently retains it;
- the consumer submits a scoped preference or correction and receives a signed receipt;
- low-assurance authentication cannot retrieve a high-grade record;
- an approved step-up session can retrieve it;
- neither party can overwrite an accepted record or submission;
- ODRL duties are activated, fulfilled or failed with independently verifiable evidence;
- cross-tenant, wrong-client, replay, enumeration and deletion attempts are denied and audited;
- relationship revocation and consumer key rotation take effect.

## Test layers

Use unit tests for claim mapping, policy decisions, canonicalization and receipt signatures. Use CSS integration tests
for HTTP methods, the selected WAC/ACP surface, provisioning and notification behavior. Use end-to-end tests with real
issuer and consumer agents. Add adversarial tests for tenant escape, confused deputy behavior, SSRF, replay,
correlation and administrative
bypass. Add policy tests for malformed ODRL, unknown profile terms, conflicting rules, unmet preconditions, expired
constraints, failed duties and required remedies.

Conformance should test observable guarantees, not simply the presence of configuration files.
