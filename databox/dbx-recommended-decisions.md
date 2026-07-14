# DBX Recommended Decisions

## Status

These are recommended defaults for the DBX-02 ADR process. They allow DBX-01 and the technical workstreams to begin,
but each production decision still requires the review and evidence specified by its prompt. Legal-policy
recommendations deliberately stop short of interpreting the legislation currently being processed.

## R-01 — Solid authorization baseline

Use WAC as the initial production Solid authorization surface because it is implemented by the selected CSS baseline
and supports standard WebID agent, group, origin, read, append, write and control semantics. Keep the Databox
authorization composition interface neutral so a deployment can adopt ACP later.

An LWS Access Grant is the portable/standards-track record of granted authority. Provisioning compiles an active grant
into WAC and Databox relationship state. WAC, tenant, relationship, assurance, immutability and ODRL layers form a
conjunction; no layer can broaden another layer's denial.

## R-02 — Consumer and institutional identifiers

The consumer vault creates a different HTTPS WebID/Controlled Identifier and P-256 key for each program by default.
An existing WebID may be used only through an explicit consumer choice and correlation warning. `did:key`, `did:web`
and `did:solid` are optional typed bindings, not replacements for a WebID where the selected Solid path requires one.

Each organisation, bridge service, human reviewer and automated agent has a distinct stable HTTPS identifier. The
organisation's identifier is the accountable principal and credential issuer; service identifiers carry operational
authority.

## R-03 — Authorization server and external identity

Use a separately deployable Databox authorization server/broker. It accepts only program-approved authentication
issuers and validates the complete issuer, subject, audience, client, time, signature and assurance claim contract.

- Track A exposes the adopted Solid-OIDC-compatible access path for existing clients.
- Track B implements pinned LWS authorization-server discovery and RFC 8693 Token Exchange.
- External IdPs authenticate the human; they do not become the Databox storage server or WAC authority.
- The broker maps verified external authentication to the program-specific WebID/relationship and normalized
  assurance context.

This is a trust boundary and must remain independently deployable even if bundled with CSS for a small installation.

## R-04 — Long-term connection credential

Issue a W3C VC Data Model 2.0 Databox Connection Credential secured with VC-JOSE-COSE/ES256. Bind it to one program,
opaque Databox, pairwise holder identifier, holder key, access-grant/policy digest and discovery profile. Give it a
program-defined months/years or relationship-duration lifetime, with status, suspension, revocation and rotation.

The credential is the API-key-like durable authority but not a bearer token. The vault presents a fresh proof from
the bound key to obtain a short-lived access token. Copied credential bytes alone do not authorize access.

## R-05 — Token, offline operation and step-up lifecycle

Do not issue general refresh tokens by default. For unattended operation, the vault creates a fresh short-lived
authentication proof from its connection key and exchanges it under the active credential/grant.

- access-token lifetime: five minutes by default;
- audience: exactly one Databox storage realm;
- client and holder binding: required;
- new-token issuance: check credential, relationship, grant, client and key status;
- resource access: validate token and current relationship/grant suspension for prompt revocation;
- inactivity: program profile defines when interactive reauthentication is required;
- step-up: require a new external authentication event with specified proofing/authenticator/freshness for protected
  record classes or sensitive operations;
- recovery and holder-key change: always interactive at an assurance appropriate to the relationship.

This avoids storing a high-value long-lived bearer refresh token in the consumer vault.

## R-06 — Assurance model

Normalize verified authentication into separate dimensions rather than a single unqualified LoA number:

- identity proofing;
- authenticator strength;
- federation/issuer trust;
- authentication freshness;
- step-up event;
- actor/represented-party and delegation evidence.

Program profiles map approved issuer claims into these dimensions and record classes state their minimums. Unknown or
unmapped claims fail closed. Customer matching remains a separate account-linking decision; assurance alone never
selects a customerID.

## R-07 — Durable notification and recovery

Use notify then pull:

1. commit the resource, acceptance receipt and ordered event;
2. expose the event through an authenticated, per-connection cursor feed;
3. emit a minimal Solid Notifications signal for low latency;
4. optionally deliver LDN to a separately registered durable inbox when a program profile requires it; and
5. reconcile from the cursor after disconnect, endpoint failure or retention-bounded downtime.

The cursor/event feed is the authoritative missed-event recovery contract. WebSocket delivery is never evidence that
the consumer durably received or read the record. LDN is an optional delivery profile, not the universal baseline.

## R-08 — ODRL duty fulfilment

Do not use one ambiguous `notifyHolder` completion rule. Define separate duties and evidence states:

- `dbx:makeAvailable` — fulfilled when the resource and event are durably committed and retrievable;
- `dbx:signalHolder` — fulfilled when an eligible notification signal is accepted by the selected channel;
- `dbx:deliverToInbox` — fulfilled only after a successful response from the registered durable inbox;
- `dbx:acknowledge` — fulfilled only by an authenticated consumer/vault acknowledgement;
- `dbx:issueReceipt` — fulfilled when a valid signed receipt is durably committed and returned or retrievable; and
- `dbx:stageForReview` — fulfilled when the submission is durably present in the governed review queue.

Queued, attempted, accepted, failed, acknowledged and remedied remain distinct evidence states. Each policy selects
the duty it actually requires instead of changing the meaning of “notified”.

## R-09 — Institutional integration plane

Use a separately deployable integration plane with connector APIs. It owns:

- a protected typed `organisation/program/source-system/customerID-namespace/customerID` mapping to opaque
  relationship, Databox and pairwise WebID identifiers;
- account-linking and ambiguity/review workflow;
- transactional source outbox consumption;
- schema/policy transformation and institutional record signing;
- stable namespaced source-event idempotency;
- Databox deposit receipts and reconciliation;
- consumer-submission intake and staff-review routing; and
- program administration, connector health and failure recovery.

Raw customerIDs remain inside this plane. Identity credentials can support linking evidence but never replace the
authoritative mapping registry.

## R-10 — Data exchange and social sharing

Organisation bridges append signed records to organisation-controlled Databox containers. Consumers retrieve through
standard Solid/LWS HTTP and retain independent copies. Consumer submissions use authenticated append/create into the
program's Databox, followed by review; the organisation does not crawl the vault.

The organisation controls WAC on its institutional copy. The consumer controls WAC on the copy in their vault and can
use ordinary WebID-based social sharing there. Sharing a vault copy does not modify the institutional source record or
reveal the vault's other Databox connections.

## R-11 — Immutability, receipts and evidence

Accepted records, submissions, dispositions and receipts are append-only. Correction uses supersession; deletion
uses the adopted tombstone/retention process. Every accepted operation produces a signed receipt bound to canonical
payload digest, parties, transaction, time, idempotency key, policy/profile digest and activated duties.

Use a transactional resource/evidence/outbox boundary. The production evidence ledger is external to ordinary Pod
mutation and retains signing-key history and verification material.

## R-12 — Legal-policy mapping workstream

Do not block the technical Databox implementation on unfinished legislative analysis, and do not invent a statutory
mapping from incomplete material.

Proceed now with a **technical ODRL profile** containing only deterministic operational terms needed by the system:
read/create/deposit/submit, purpose and temporal constraints, receipt, notification states, retention, tombstone and
review staging. Use clearly synthetic policies in tests.

Define a stable compiled-policy input interface containing:

- jurisdiction and applicability scope;
- authoritative source/corpus manifest digest;
- commencement, repeal and transition result;
- machine-proposed normative mapping;
- human attestation and accountable reviewer;
- WebCivics source and jural terms;
- compiled ODRL policy/profile digest and effective interval; and
- appeal/redress metadata.

When the legislation corpus is ready, a separate Hard legal-policy prompt maps the human-reviewed WebCivics/legal
model into this interface and tests it against the ODRL evaluator. Runtime code consumes signed compiled policies; it
never performs free-form legal interpretation. A compliance release cannot pass until that later mapping and human
approval are complete, but identity, storage, integration, credential, exchange and evidence work can proceed.

## R-13 — Standards and conformance claims

Maintain separate manifests:

- **Track A:** dated Solid Protocol, Solid-OIDC, WAC and supported Solid Notifications behavior used by existing CSS
  clients; and
- **Track B:** pinned W3C LWS Working Draft features, clearly marked experimental until sufficiently stable and
  independently tested.

The product may implement both through adapters, but it must never collapse them into an ambiguous “Solid/LWS
conformant” claim. Test at least two independent client stacks and an external accepted identity issuer before a
production interoperability claim.

## R-14 — Record awareness, access and correction

Treat consumer record awareness as a first-class Databox capability. Provide an authenticated, program-local record
and disclosure index with authorized metadata, current/superseded/disputed state, provenance, applicable policy and
access/correction/complaint routes. Decide existence visibility separately from payload access so step-up and lawful
non-disclosure can be enforced without side channels.

Model correction as an append-only governed exchange: signed acknowledgement, configurable response clock,
institutional source-system case, reasoned disposition, superseding record or conspicuously linked statement, prior
recipient propagation where applicable, and durable evidence. The attached CDR Rules supply a candidate CDR profile
including dashboard disclosures and a 10-business-day correction response, but R-12 still requires applicability and
exception mapping plus accountable human review before any compliance claim.

## Recommended sequencing consequence

DBX-01 starts immediately. DBX-02 should convert R-01 through R-14 into ADRs, recording any rejected alternative.
DBX-07 implements the technical Databox/LWS ODRL profile without statutory interpretation. DBX-20 implements the
deterministic evaluator and compiled-policy interface using synthetic fixtures. The legal-policy mapping and
attestation work begins when the legislation corpus is ready and becomes a release gate only for a legal-compliance
profile.
