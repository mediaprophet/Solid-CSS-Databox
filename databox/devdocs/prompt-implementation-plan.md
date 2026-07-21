# Prompt Implementation Plan

## Purpose

This plan turns the Databox architecture into an ordered set of implementation prompts. Progress is measured by
completed prompts and passed gates, not weeks. Each prompt produces reviewable artifacts and tests that become the
inputs to later prompts.

DBX-01 through DBX-28 is the primary execution path to a production-quality, independently assessed release. Use
[DBX recommended decisions](dbx-recommended-decisions.md) as input to DBX-02, not as a substitute for its ADR and
review outputs. HAK-01 through HAK-12 in the [Hackathon profile](hackathon-profile.md) is an optional early
demonstrator; hackathon success does not imply the DBX gates have passed.

Do not send the entire plan to one coding agent with an instruction to "implement everything". Run prompts in order
within each dependency chain, retain their outputs in the repository, and use the indicated agent capability.

## Agent capability levels

| Level | Suitable work | Required behavior |
|---|---|---|
| Easy | Mechanical scaffolding, indexes, fixtures, documentation and bounded tests. | Follow established decisions; do not create architecture. |
| Medium | Multi-file implementation using known interfaces and existing repository patterns. | Inspect code, implement tests, explain trade-offs and stop on unresolved security decisions. |
| Hard | Architecture, identity, cryptography, policy semantics, tenancy, evidence and adversarial security. | Use the strongest reasoning agent available; document assumptions, attack cases and alternatives. |

An Easy agent must not make a Hard decision merely because a prompt is underspecified. Escalate the missing decision
and leave the dependent implementation blocked. Hard outputs involving identity, cryptography, legal policy or
production security also require human review by the relevant domain owner.

## Agent assignment rules

- **Easy prompts:** one Easy or stronger implementation agent; ordinary code review.
- **Medium prompts:** one Medium or stronger implementation agent; a separate Medium reviewer.
- **Hard prompts:** one Hard lead agent; at least one independent Hard reviewer for security-sensitive changes.
- **Cryptographic and identity prompts:** Hard agent plus human security/identity review.
- **ODRL and legal-policy prompts:** Hard agent plus human policy/domain review.
- **Tenant-isolation prompts:** Hard agent plus adversarial review by an agent that did not implement the change.
- **Release gate:** a Hard integrator reviews the collected evidence; no agent self-certifies its own subsystem.

Agent level describes the reasoning and review requirement, not the number of files changed. A ten-line authorization
change can be Hard; a large generated fixture can be Easy.

## Global prompt preamble

Prepend this text to every implementation prompt:

> You are working on the organisation-hosted Solid Databox implementation for Community Solid Server. Read all
> Markdown files in `databox/` and any accepted decision records or handoff documents produced by prerequisite
> prompts before acting. Preserve program isolation, pairwise identity, assurance-aware access, explicit consumer
> submission, append-only evidence and the separation between WAC/ACP and ODRL. Inspect the current repository and reuse
> its extension patterns. Do not weaken an invariant to make a test pass. Do not invent an unresolved security or
> protocol decision: record the blocker and stop that dependent part. Implement the requested artifacts and tests,
> run relevant validation, and finish with changed files, decisions used, tests run, residual risks and inputs needed
> by the next prompt.

## Handoff contract

Every prompt creates or updates a short handoff record containing:

- prompt identifier and status;
- commits or changed files;
- decisions consumed and created;
- commands and test results;
- security assumptions;
- unresolved questions;
- exact artifacts available to dependent prompts.

Use stable prompt identifiers such as `DBX-01`. A prompt is complete only when its acceptance gate passes. Partial
code without the gate evidence remains incomplete.

## Dependency overview

```text
DBX-01
  |-- DBX-02 -- DBX-03 -- DBX-04 -- DBX-05
  |                         |
  |                         `-- DBX-07
  |-- DBX-06 -------------------|
  |-- DBX-08 -- DBX-09 ---------|
                               v
DBX-10 -- DBX-11 -- DBX-12 -- DBX-13 -- DBX-14
   |          |         |         |         |
   `----------+---------+---------+---------+
                         v
DBX-15 -- DBX-16 -- DBX-17 -- DBX-18 -- DBX-19 -- DBX-20
   |                                               |
   `---------------------- DBX-21 -----------------|
                                                   v
DBX-22 -- DBX-23 -- DBX-24 -- DBX-25 -- DBX-26 -- DBX-27 -- DBX-28
```

Parallel execution is allowed only where prompts do not modify the same contracts. Contract-producing prompts must
be accepted before their consumers begin.

## Wave A: discovery and binding decisions

### DBX-01 — Repository and extension inventory

**Agent level:** Medium  
**Depends on:** none

**Prompt:**

> Inspect CSS authentication, authorization, operation handling, storage decorators, Pod provisioning,
> notifications, Components.js configuration and tests. Produce an extension map naming the existing interfaces and
> configuration points Databox should reuse, replace or wrap. Identify where verified claims and authenticated actor
> context are lost. Against the pinned W3C LWS 1.0 Working Draft, identify whether CSS already implements or lacks
> authorization-server discovery, RFC 8693 token exchange, LWS authentication suites, storage descriptions,
> `application/lws+json`, access requests/grants and LWS operation semantics. Make no production-code changes.

**Artifacts:** extension map, relevant file/line references, initial dependency list and candidate upstream seams.

**Acceptance gate:** another Medium agent can trace deposit, retrieval and denial requests through CSS using only the
map, and every claimed seam is backed by source evidence.

### DBX-02 — Normative decision register

**Agent level:** Hard  
**Depends on:** DBX-01

**Prompt:**

> Convert unresolved Databox questions into explicit decision records. Cover box topology, ownership, consumer proof
> ceremony, pairwise identifiers, assurance vocabulary, notification mechanism, receipt states, append-only rules,
> deletion/tombstones, policy versioning, ODRL conflict strategy, VC proof/status format, encryption boundary and
> binary evidence. Adjudicate every item in `implementation-decisions.md`, including external IdP trust, broker/token
> exchange, offline grants, identifier binding, notification recovery and fulfilment, legal temporal applicability,
> policy-update effects and legislative-corpus proof. Resolve or explicitly block each S-01 through S-27 Solid/LWS
> interoperability question and pin the dated specification baseline. For each decision give alternatives,
> consequences, recommendation and status. Start from `databox/dbx-recommended-decisions.md`; record why each
> recommendation is adopted, modified or rejected. Separate the technical ODRL profile from the later human-reviewed
> legal-policy mapping so unfinished legislative processing does not cause agents to invent legal rules.

**Artifacts:** decision index and one ADR per decision.

**Acceptance gate:** no later contract depends on an undocumented choice; unresolved decisions explicitly identify
which prompts they block.

### DBX-03 — Threat model and abuse cases

**Agent level:** Hard  
**Depends on:** DBX-01, DBX-02

**Prompt:**

> Produce a threat model for consumers, programs, a shared Databox provider, institutional bridges, identity
> providers, support staff, queues, logs, backups and consumer agents. Model cross-program correlation, tenant escape,
> confused deputy behavior, token replay, identifier enumeration, SSRF, malicious RDF, policy substitution, audit
> tampering, operator bypass, key compromise and coerced consumers. Map each threat to a control and planned test.

**Artifacts:** trust-boundary diagram, threat register, control mapping and adversarial-test backlog.

**Acceptance gate:** every invariant has at least one threat and verification method; provider administration is
inside the threat model rather than assumed trusted.

### DBX-04 — Reference architecture and interface boundaries

**Agent level:** Hard  
**Depends on:** DBX-01, DBX-02, DBX-03

**Prompt:**

> Define the deployable architecture: CSS extension, provisioning control plane, institutional bridge, ODRL service,
> evidence ledger, transactional outbox, notification worker, review queue and consumer agent. Specify trust
> boundaries, synchronous and asynchronous interfaces, failure ownership and which system is authoritative for each
> state. Include the boundary between external human IdPs, any token broker and CSS; distinguish authoritative HTTPS,
> durable event recovery and optional WebSocket/Solid Notification hints. Include the legal-source ingestion,
> applicability, human-attestation and policy-compilation stages. Record architecture decisions; do not implement
> components. Define separate Track A Solid and Track B LWS adapters. For Track B, model authentication credentials,
> authorization-server discovery, token exchange, storage discovery and ODRL-based access requests/grants without
> claiming that draft interfaces are already supplied by CSS.

**Artifacts:** component diagram, sequence diagrams, interface catalog and authoritative-state matrix.

**Acceptance gate:** deposit, submission, denial, notification failure, key rotation and policy update can each be
traced without an undefined state transition.

### DBX-05 — Executable conformance requirements

**Agent level:** Hard  
**Depends on:** DBX-02, DBX-03, DBX-04

**Prompt:**

> Translate Databox invariants and adopted decisions into uniquely identified, testable requirements. Separate server,
> bridge, provider, consumer-agent and deployment conformance. Include positive, negative and evidence requirements.
> Add a Solid compatibility matrix for discovery, authentication, WebID/client identification, HTTP/LDP methods,
> RDF content negotiation, conditional requests, WAC or ACP, CORS, notifications and standard error behavior against
> the pinned specification versions. Link every requirement to its decision, threat and future test identifier.

**Artifacts:** conformance matrix and test-identification scheme.

**Acceptance gate:** each normative requirement has an observable pass/fail condition and no requirement merely says
that a configuration file or class exists.

## Wave B: schemas, policy and scaffold

### DBX-06 — Institution profile schema

**Agent level:** Medium  
**Depends on:** DBX-02, DBX-04

**Prompt:**

> Define and implement the machine-validated institution/program profile schema. Include principals, processors,
> origins, identity providers, assurance mappings, record classes, submission classes, ODRL policies, legal bases,
> retention, redress, systems of record, notification, signing, encryption, tenancy and deployment settings. Provide
> trusted issuer/claim contracts, token-broker settings where adopted, offline-grant policy, legislative corpus
> manifests, compiled-policy and human-attestation references, policy effective-time behavior and appeal routes.
> Include record-existence visibility, consumer index fields, access/correction routes, response-clock calendars,
> statement association, disclosure-ledger projection and prior-recipient correction/notification behavior.
> Provide valid and invalid examples plus schema tests.

**Artifacts:** versioned schema, examples, loader types and validation tests.

**Acceptance gate:** all required architectural inputs are represented; unknown security-critical fields are rejected;
invalid assurance, origin, policy and retention combinations fail validation.

### DBX-07 — Databox vocabulary and ODRL Profile

**Agent level:** Hard  
**Depends on:** DBX-02, DBX-04, DBX-05

**Prompt:**

> Publish a machine-loadable Databox vocabulary and ODRL Profile. Reuse ODRL Core/Common terms before defining custom
> terms. Define each custom action, operand, constraint, duty, consequence and remedy with processing semantics.
> Define a reviewed, loss-aware mapping from the applicable WebCivics jural, jurisdiction, policy, legitimacy and
> accountability terms. Include profile versioning, policy-source precedence, ODRL conflict composition, duty
> fulfilment states, validation shapes, examples and conformance tests. Do not treat ODRL as a replacement for WAC/ACP or
> make the runtime evaluator interpret legislation. Until the reviewed legislation corpus is available, implement
> only the deterministic technical Databox/LWS ODRL terms and the signed compiled-policy input interface, using
> synthetic legal-policy fixtures. Mark the WebCivics/statutory mapping as a gated follow-on artifact.

**Artifacts:** RDF vocabulary, ODRL Profile, SHACL or equivalent validation, examples and term-level tests.

**Acceptance gate:** every custom term has a stable IRI and deterministic evaluator behavior; unknown terms fail
closed; a human policy reviewer approves the model.

### DBX-08 — Synthetic loyalty-program profile

**Agent level:** Medium  
**Depends on:** DBX-06, DBX-07

**Prompt:**

> Create a synthetic loyalty-program profile with no real customer data. Model digital receipts, line items, warranty,
> product information, allergens, dietary warning preferences, rewards, recalls, corrections, warranty claims and
> review dispositions. Supply low- and high-assurance record classes, ODRL policies and expected negative cases.

**Artifacts:** complete synthetic profile, keys for testing only, fixtures and scenario catalog.

**Acceptance gate:** the profile validates and exercises every required policy, exchange and isolation mechanism
without embedding Woolworths, Coles or another real organisation's confidential details.

### DBX-09 — Extension package scaffold

**Agent level:** Easy  
**Depends on:** DBX-01, DBX-04

**Prompt:**

> Scaffold the agreed Databox CSS extension package, Components.js configuration, test directories and exported
> interfaces. Add build, lint and unit-test wiring using repository conventions. Include placeholder interfaces only
> where contracts have already been accepted; do not invent implementations.

**Artifacts:** compiling package scaffold and baseline tests.

**Acceptance gate:** clean build and test pass; no placeholder silently permits access or claims conformance.

## Wave C: provisioning, identity and authorization

### DBX-10 — Opaque identifiers and provisioning model

**Agent level:** Medium  
**Depends on:** DBX-06, DBX-08, DBX-09

**Prompt:**

> Implement cryptographically random box and resource identifiers, protected program-local mappings and idempotent
> provisioning. Create Databox containers, connection metadata and program-scoped policies from the validated
> profile. Prevent PII, sequential identifiers and cross-program identifier reuse.

**Artifacts:** provisioner, templates, mapping store and provisioning tests.

**Acceptance gate:** repeated authorized provisioning is deterministic at the relationship level; enumeration and
cross-tenant collision tests fail safely; URLs and logs contain no internal member identifiers.

### DBX-11 — Tenant isolation enforcement

**Agent level:** Hard  
**Depends on:** DBX-03, DBX-04, DBX-10

**Prompt:**

> Enforce program tenancy before resource authorization. Bind origins, token audiences, service identities, storage,
> queues, logs, signing keys and administrative roles to a tenant. Remove or constrain platform-wide data-plane
> credentials. Add negative tests across normal APIs, search/index behavior, notifications, support operations and
> backup/restore boundaries.

**Artifacts:** tenant resolver, isolation middleware/configuration and adversarial tests.

**Acceptance gate:** an independent Hard agent cannot cross tenants using a valid identity or service credential from
another program; operational tooling is included in the test evidence.

### DBX-12 — Authenticated request context

**Agent level:** Hard  
**Depends on:** DBX-01, DBX-02, DBX-09

**Prompt:**

> Extend authentication context to retain only cryptographically verified WebID, client, issuer, audience, assurance,
> authentication time, actor, represented entity and delegation claims. Preserve DPoP or sender-constraint checks.
> Carry this immutable context through authorization, operation outcome and audit without trusting request headers or
> an unverified JWT decode. Implement the adopted direct-federation or token-broker boundary and validate the external
> issuer/claim contract. Keep external login, relationship credential and access token distinct; do not replace a
> Solid WebID with a DID unless an adopted protocol explicitly defines that behavior. Preserve a standards-conforming
> Solid-OIDC path for independent clients and an accepted external issuer; do not make a proprietary broker token the
> only way to access the resource server. Where the LWS track is adopted, implement the selected authentication-suite
> adapter, RFC 8693 token exchange, authorization-server metadata/challenge and storage-audience access tokens behind
> versioned discovery. Keep assurance claims and sender constraint as advertised Databox profiles unless the pinned
> LWS draft makes them normative.

**Artifacts:** typed request context, extractor/adapter, propagation changes and claim-validation tests.

**Acceptance gate:** forged assurance and actor claims are rejected; accepted claims can be traced into allow, deny
and completed-operation audit events; human identity/security review passes.

### DBX-13 — Databox Connection Credential lifecycle

**Agent level:** Hard  
**Depends on:** DBX-02, DBX-07, DBX-10, DBX-12

**Prompt:**

> Implement issuance, export/import, validation, installation acknowledgement, status, revocation, renewal and
> rotation for program-specific Databox Connection Credentials. Bind the opaque Databox, program, standards-based
> discovery, immutable access-grant/policy reference and digest, compatibility profiles, pairwise consumer identity
> and holder key without exposing a global customer key. Prove consumer-vault key control during connection,
> every unattended token request, migration and recovery. Treat the credential as the explicitly consented long-term
> authority for background connection use, with months/years or relationship-duration validity, inactivity,
> reauthentication, rotation and revocation rules. Ensure its document is not accepted as a bearer access token;
> issue separately audience-bound, short-lived access tokens after validating fresh holder-key proof.

**Artifacts:** connection-credential schema/service, issuer/export/import interfaces, status mechanism, discovery and
grant binding, proof ceremony and lifecycle tests.

**Acceptance gate:** a conforming consumer vault can install the exported credential and maintain unattended access
to only its Databox without repeated interactive login; copied credential bytes without the holder key fail; replay
against another program fails; no reusable bearer token, shared secret or global identifier is present;
revoked and expired relationships fail; vault migration preserves history without preserving obsolete access; human
cryptographic and privacy review passes.

### DBX-14 — Composed authorization engine

**Agent level:** Hard  
**Depends on:** DBX-07, DBX-11, DBX-12, DBX-13

**Prompt:**

> Implement authorization as the conjunction of tenant, Solid-OIDC, the selected WAC/ACP surface, relationship,
> client, assurance, record grade, delegation, immutable-operation and ODRL precondition decisions. Use WAC for the
> hackathon as fixed by HD-03; keep the composition interface authorization-system-neutral. Produce structured reason
> codes and safe
> step-up responses. Define deterministic precedence and fail closed on missing policy inputs.

**Artifacts:** authorization components, decision model and exhaustive policy tests.

**Acceptance gate:** truth-table tests cover every layer; broad WAC/ACP permission cannot bypass assurance, tenant,
immutability or ODRL prohibition; denial does not reveal protected resource existence.

## Wave D: exchange, policy execution and evidence

### DBX-15 — Deposit and submission validation

**Agent level:** Medium  
**Depends on:** DBX-05, DBX-08, DBX-14

**Prompt:**

> Implement the protocol gateway for deposits and consumer submissions. Validate container, media type, size, shape,
> addressed relationship, issuer, record class, legal basis, declared purpose, policy reference and idempotency. Add
> bounded handling for binary evidence and a quarantine contract for malware scanning. For corrections, validate the
> target record/assertion, requested operation, proposed value or statement, supporting evidence and authority to act.

**Artifacts:** validators, gateway handlers, error vocabulary and positive/negative fixtures.

**Acceptance gate:** malformed, oversized, misaddressed, wrong-purpose and duplicate inputs have deterministic,
non-leaking outcomes; accepted bytes are not silently transformed.

### DBX-16 — Verifiable record proof validation

**Agent level:** Hard  
**Depends on:** DBX-02, DBX-08, DBX-15

**Prompt:**

> Implement the adopted proof suite, canonicalization and credential-status checks for records and submissions.
> Enforce trusted issuers and key history, distinguish a cryptographically valid claim from a true claim, and preserve
> the exact accepted payload digest. Add malicious-context, key-rotation and status-revocation tests.

**Artifacts:** proof validator, trust registry integration and cryptographic test vectors.

**Acceptance gate:** known test vectors pass; altered payloads, unknown contexts, revoked credentials and substituted
keys fail; human cryptographic review passes.

### DBX-17 — Append-only resource enforcement

**Agent level:** Hard  
**Depends on:** DBX-14, DBX-15

**Prompt:**

> Implement storage or operation decorators that make accepted records, submissions, receipts and evidence
> append-only. Support superseding records, linked dispositions and tombstones without destructive rewriting. Ensure
> administrative and owner permissions cannot bypass these invariants through ordinary Solid operations. Make a
> correction or associated statement apparent from the current representation and authorized record index without
> erasing the prior evidence history.

**Artifacts:** immutable storage policy, supersession/tombstone model and bypass tests.

**Acceptance gate:** PUT, PATCH and DELETE bypass attempts fail for every actor class; accepted history remains
retrievable according to retention policy; legal deletion produces the adopted tombstone evidence.

### DBX-18 — Signed acceptance receipts

**Agent level:** Hard  
**Depends on:** DBX-16, DBX-17

**Prompt:**

> Implement canonical payload digests and signed acceptance receipts containing transaction, assigned resource,
> parties, time, policy version and digest, activated duties and idempotency key. Where a legal policy governs the
> transaction, bind the compiled-policy digest, corpus-manifest digest, human-attestation identifier and evaluator
> version. Distinguish accepted, notified, retrieved, acknowledged, reviewed and disposed states. Never issue
> acceptance before durable commit.
> Correction acceptance receipts also bind the target record, response profile, calculated due time and complaint
> route without asserting that the proposed correction has been accepted as true.

**Artifacts:** receipt schema, signer/verifier, state vocabulary and test vectors.

**Acceptance gate:** receipts verify independently after export; duplicate idempotency keys return the original
logical outcome; altered receipt or record bytes fail verification.

### DBX-19 — Evidence ledger and audit binding

**Agent level:** Hard  
**Depends on:** DBX-03, DBX-12, DBX-17, DBX-18

**Prompt:**

> Implement the adopted append-only evidence ledger and consumer-visible audit projection. Bind authenticated actor,
> represented entity, assurance, decision, operation, digests, institutional principal, policy evaluation, receipt,
> notification and disposition outcomes. Record denied requests without leaking sensitive content.
> Produce a minimised consumer record/disclosure projection that supports record awareness, current version and
> dispute state, access/correction routes and applicable disclosure history. Treat record-existence visibility and
> payload authorization separately and test non-disclosure side channels.

**Artifacts:** ledger adapter, event schema, integrity mechanism, projection and verification tests.

**Acceptance gate:** modification or reordering is detectable; allow, deny and partial-failure paths retain actor and
policy context; ordinary Pod operations cannot rewrite the ledger.

### DBX-20 — ODRL evaluator and obligation engine

**Agent level:** Hard  
**Depends on:** DBX-07, DBX-14, DBX-19

**Prompt:**

> Implement ODRL validation, immutable policy resolution, deterministic evaluation and durable duty instances. Handle
> precondition duties, post-action obligations, constraints, conflict strategy, consequences and remedies. Implement
> handlers for receipt issuance, holder notification, retention, deletion/tombstone and review staging. Record every
> transition in evidence. Consume signed, human-attested compiled policy bundles; do not decide legislative
> commencement, repeal, transition or jurisdiction in the request path. Apply effective-time and policy-update rules
> from the adopted ADR.
> Add deterministic handlers for record-index availability, correction acknowledgement and assessment, statement
> association, reasons/complaint routes and per-recipient correction propagation. Keep acceptance, review, source
> correction, notification and recipient completion as separate duty states.

**Artifacts:** evaluator, policy registry, duty state machine, handlers and policy test suite.

**Acceptance gate:** unsupported terms and ambiguous conflicts fail closed; queued is not treated as fulfilled;
retries are idempotent; policy substitution is detectable; independent Hard and human policy review pass.

### DBX-21 — Transactional outbox and notification delivery

**Agent level:** Hard  
**Depends on:** DBX-03, DBX-18, DBX-19, DBX-20

**Prompt:**

> Implement durable outbound LDN or the adopted notification mechanism using a transactional outbox. Add endpoint
> validation, SSRF protection, bounded redirects, retries, deduplication, endpoint rotation, minimal payloads and
> delivery evidence. Implement the adopted cursor/event-feed or state-reconciliation recovery contract so a consumer
> can recover after disconnect or retention-bounded downtime; an internal outbox is not that API. Treat WebSockets or
> Solid Notifications as optional hints. Ensure notification failure does not erase an accepted deposit or falsely
> fulfill an ODRL duty, and apply the policy-specific definition of fulfilment.

**Artifacts:** outbox, dispatcher, endpoint policy, worker and failure/recovery tests.

**Acceptance gate:** crash, retry and reconnect tests do not lose or duplicate logical events; a consumer can recover
missed events through the specified durable contract; private-network targets are blocked; duty state accurately
distinguishes queued, sent, transport-accepted, durably retrievable, acknowledged and failed where applicable.

## Wave E: bridge, review and consumer interoperability

### DBX-22 — Synthetic institutional bridge

**Agent level:** Medium  
**Depends on:** DBX-08, DBX-15, DBX-18, DBX-21

**Prompt:**

> Build a synthetic retailer bridge that consumes committed purchase events and deposits digital receipts, warranty,
> product, allergen and recall records. Use a transactional source/outbox boundary, program service identity and
> stable namespaced source-event idempotency. Resolve a typed customerID only through the protected relationship
> mapping registry and retain the returned Databox receipt. Do not connect to a real retailer or use real customer
> data. Add the reverse governed correction-case path: map an opaque target to its protected source record, submit a
> case, receive a disposition, publish a superseding record or linked statement and reconcile both systems.

**Artifacts:** runnable bridge, synthetic source, mappings and recovery tests.

**Acceptance gate:** replaying source events creates no duplicate logical receipts; provenance identifies software
actor and program principal; bridge failure is observable and recoverable.

### DBX-23 — Submission review and disposition workflow

**Agent level:** Medium  
**Depends on:** DBX-15, DBX-17, DBX-20, DBX-22

**Prompt:**

> Implement a review queue for corrections, warranty claims and preferences. Preserve submitter identity and payload
> digest, enforce staff assignment and assurance, prevent direct destructive system-of-record updates, and append a
> signed human or governed disposition linked to the submission. Consumer submissions arrive through authenticated
> HTTP create on the Databox submission container; notifications only signal the committed event. Fulfill or fail
> applicable ODRL duties.
> Issue an immediate signed acknowledgement, calculate and monitor the applicable response clock, support corrected,
> statement-associated, partially-corrected, no-change, more-information-required and redirected dispositions, and
> expose reasons and complaint routes. Generate separately tracked prior-recipient duties from disclosure evidence
> where the adopted policy requires them.

**Artifacts:** review adapter/UI or API, disposition schema and workflow tests.

**Acceptance gate:** no submission changes the synthetic system of record before an authorized disposition; actor
transfers and decisions are reconstructable; overdue and failed review duties are visible.

### DBX-24 — Reference consumer agent

**Agent level:** Medium  
**Depends on:** DBX-13, DBX-18, DBX-21

**Prompt:**

> Build a minimal reference consumer agent that controls separate pairwise identities for two synthetic programs,
> imports and manages their Databox Connection Credentials in an isolated connection registry, registers notification
> endpoints, authenticates, retrieves and verifies records, stores independent copies,
> presents understandable ODRL terms, submits a scoped preference/correction and verifies acceptance receipts. It
> must not expose a general wallet-browsing API to programs. Implement the Databox features on top of ordinary Solid
> discovery, Solid-OIDC and HTTP resource operations rather than a private SDK-only transport.
> Display the authorized record/disclosure index, current and disputed versions, correction clock and disposition;
> support payload step-up without assuming that index visibility always authorizes payload access.

**Artifacts:** runnable vault/agent, connection-credential importer, isolated connection registry, local knowledge
store, multi-program fixture and end-to-end scenario.

**Acceptance gate:** adding, pausing, rotating and removing one connection does not affect another; neither synthetic
program learns the other identity or connection; imported credentials bootstrap standards-based access without
embedded bearer secrets; exported records and receipts verify independently; submission disclosure contains only
selected fields.

## Wave F: integration, adversarial assurance and release

### DBX-25 — End-to-end integration suite

**Agent level:** Medium  
**Depends on:** DBX-22, DBX-23, DBX-24

**Prompt:**

> Implement deterministic end-to-end tests covering onboarding, low/high assurance, deposit, notification, retrieval,
> retained copy, consumer submission, receipt, review, disposition, policy duties, supersession, revocation, key
> rotation and recovery across two isolated programs.

**Artifacts:** automated scenario suite, fixtures and evidence bundle.

**Acceptance gate:** all conformance requirements assigned to normal behavior have passing observable tests; failures
identify the responsible component and preserved evidence.

### DBX-26 — Adversarial security suite

**Agent level:** Hard  
**Depends on:** DBX-03, DBX-25

**Prompt:**

> Implement and run the threat-model attacks: cross-tenant access, pairwise correlation, wrong audience/client,
> assurance forgery, DPoP replay, credential replay, identifier enumeration, malicious RDF/JSON-LD, SSRF, policy
> substitution, immutable-resource bypass, audit tampering, queue duplication and administrative escape. Add newly
> discovered threats and fixes without weakening expected controls.

**Artifacts:** adversarial suite, findings, fixes and residual-risk register.

**Acceptance gate:** an independent Hard security agent reviews results and reproduces critical negative tests; no
critical or high unresolved tenant, identity, cryptographic or evidence finding remains.

### DBX-27 — Interoperability and conformance assessment

**Agent level:** Hard  
**Depends on:** DBX-05, DBX-25, DBX-26

**Prompt:**

> Run Solid interoperability checks and the Databox conformance matrix against the packaged deployment. Validate
> the pinned dated Solid Protocol, Solid-OIDC, selected authorization and Notifications baselines. Validate standard
> discovery, an external user-controlled WebID and accepted issuer, independent client identification, HTTP/LDP
> methods, RDF content negotiation, conditional requests, CORS, authorization, standard challenges/errors and every
> advertised notification channel. Run at least two independent non-Databox Solid client stacks plus the reference
> agent. Then validate Databox credential, receipt and ODRL behavior as a separate extension layer. Produce a
> machine-readable compatibility manifest and human-readable results with evidence links and explicit
> non-conformance. Report current-Solid/CSS and W3C LWS Working Draft results separately, including experimental,
> incomplete and feature-at-risk assertions. Use the Working Group test suite when available and map local tests to
> its assertion identifiers.

**Artifacts:** compatibility manifest, conformance report, independent-client evidence and exception register.

**Acceptance gate:** every requirement is passed, failed or explicitly not applicable with evidence; a consumer using
an independent client and accepted external Solid-OIDC issuer can discover, authenticate, read permitted resources,
append a permitted submission and use an advertised notification channel; no requirement is marked passed solely
because code or configuration exists.

### DBX-28 — Operational and release readiness

**Agent level:** Hard, with Easy documentation subtasks  
**Depends on:** DBX-25, DBX-26, DBX-27

**Prompt:**

> Assemble deployment, key ceremony, tenant onboarding, backup/restore, audit verification, incident response,
> relationship recovery, policy publication, duty monitoring, retention/deletion and upgrade runbooks. Generate an
> SBOM, dependency and secret scan, configuration hardening checklist and rollback plan. Have a Hard integrator review
> all prompt handoffs, decisions, residual risks and conformance evidence. Include a standards-watch and migration
> process for W3C LWS publication changes, with security, privacy, accessibility and internationalization review gates
> for graduating draft features.

**Artifacts:** runbooks, deployment profiles, security artifacts, release checklist and signed readiness decision.

**Acceptance gate:** restore and key-rotation rehearsals pass; operators can detect failed duties and notification
backlogs; accepted residual risks have named owners; release approval is independent of subsystem implementers.

## Prompt execution board

Track each prompt with these states:

```text
not-ready --> ready --> running --> review --> accepted
                    |          |          |
                    v          v          v
                 blocked    changes     rejected
```

A prompt becomes `ready` only when all dependencies are `accepted`. A rejected prompt returns to `ready` with review
findings included in its next context. A blocked prompt records the missing decision or artifact; it does not fill the
gap with an assumption.

## Completion definition

The implementation plan is complete when DBX-01 through DBX-28 are accepted and the release record links to:

- all binding decisions;
- the threat and residual-risk registers;
- validated program and ODRL profiles;
- build and test evidence;
- cryptographic, identity, policy and tenant-isolation reviews;
- interoperability and conformance results;
- operational rehearsal results;
- named owners for every accepted residual risk.

Completion is an evidence-backed state, not the exhaustion of a prompt count. New findings create a new numbered
prompt with dependencies and acceptance criteria rather than being hidden inside an existing completion claim.
