# Hackathon Binding Decisions

## Purpose

This document resolves the blocking questions for HAK-01 through HAK-12. It is normative for the hackathon profile.
It does not settle the full production decision register.

## Identity, WebID and social sharing

### HD-01 — Consumer identifier

The vault creates one pairwise HTTPS WebID/Controlled Identifier and P-256 key for each Databox connection. The URI
is controlled by the vault and resolves to the public verification and service information required by the pinned
Solid/LWS profile.

`did:key` is an optional future authentication-suite profile, not the hackathon default. A consumer may later bind an
existing WebID through an explicit migration/linking ceremony; no organisation receives a global identifier by
default.

### HD-02 — Organisation and service identifiers

Each synthetic organisation has a stable HTTPS organisation identifier used as accountable principal and connection-
credential issuer. Each institutional bridge has a separate service WebID/client identifier and signing key. A human
operator, organisation and software service are never represented by the same identifier.

### HD-03 — WAC and policy composition

WAC is the ordinary Solid authorization surface for the hackathon because it supports WebID-based access and is the
default mature CSS path in this repository. The LWS Access Grant is the Track B standards-facing record of granted
authority. Databox relationship, tenant, assurance, record-class, immutability and ODRL checks can only narrow the
result.

```text
valid authentication/token
AND active LWS Access Grant / relationship
AND WAC permission
AND Databox invariant and assurance checks
AND applicable ODRL preconditions
```

ACP is deferred from the hackathon to avoid two parallel Solid policy surfaces. It remains a production option.

### HD-04 — Social sharing boundary

The organisation controls WAC for its institutional Databox copy. The consumer does not rewrite that ACL during the
demo. After synchronisation, the consumer controls WAC on the copy in their own vault and may share it with other
WebIDs. Sharing the consumer copy does not change the institutional source record or disclose the vault's other
connections.

## Long-term connection credential

### HD-05 — Credential format

Use W3C Verifiable Credentials Data Model 2.0 secured with VC-JOSE-COSE as `application/vc+jwt`, signed with ES256.
Use the connection schema and status endpoint defined by the hackathon profile. BBS selective-disclosure
cryptosuites are not required for the demonstration.

### HD-06 — Long-term holder binding

The Databox Connection Credential is valid for one year in the demo and is bound to the connection's pairwise HTTPS
WebID/Controlled Identifier and P-256 public key. The vault retains the private key. Credential bytes without fresh
proof of that key do not enable access.

### HD-07 — Unattended consumer authentication

After OIDC-based onboarding, ordinary vault synchronisation uses the pinned LWS self-signed Controlled Identifier
authentication suite. The vault creates a fresh five-minute ES256 authentication JWT from its connection key and
presents it as the RFC 8693 subject token. The authorization server resolves the active connection and Access Grant
from subject, client and storage realm and issues a five-minute access token.

The separate OIDC fixture is used for human onboarding, recovery and step-up, not every sync. Entra-style client
credentials are relevant to an institutional bridge, not an answer to consumer-vault authentication.

## Institutional integration plane

### HD-08 — Component boundary

The institutional integration plane is a separate service with a defined connector API. It can be deployed beside
CSS in the hackathon `docker-compose`, while remaining separately deployable as an enterprise gateway. Institution-
specific database mappings and business workflows do not run inside the public CSS resource path.

### HD-09 — Institutional identifier

The integration input uses a typed institutional key:

```text
organisation + program + source-system + customerID-namespace + customerID
```

For the synthetic systems, `customerID` is the stable internal customer primary key. The raw value never appears in
a Databox URI, connection credential, notification, vault record or cross-tenant log.

### HD-10 — Authoritative relationship mapping

A protected relational-style mapping registry in the integration plane is authoritative:

```text
typed institutional key -> opaque relationship ID -> opaque Databox ID -> pairwise consumer WebID
```

For the hackathon this can be a durable local JSON/SQLite-style store behind a repository interface; no database
vendor is required. Entra Verified ID or another credential may provide supporting identity evidence, but it does
not replace the operational mapping registry.

### HD-11 — Customer linking proof

Assurance level alone does not prove which customer record is correct. The connection ceremony combines:

1. a validated external authentication event and its assurance;
2. program-specific claims or an explicit account-linking challenge sufficient to resolve exactly one synthetic
   customer record;
3. vault proof of the pairwise holder key; and
4. an audited confirmation before the mapping becomes active.

Ambiguous, duplicate or already-bound customer matches fail closed and enter a synthetic review path.

### HD-12 — Source event and outbox

Both synthetic source systems commit business events and a source outbox entry together. The bridge drains the
outbox and deposits records into the resolved Databox. A retry uses the same stable, namespaced source event ID.

The idempotency key is not generated anew for each attempt. Use:

```text
organisation/program/source-system/event-type/source-event-id
```

The external representation may use a tenant-keyed HMAC of that tuple when exposing it would reveal internal system
information. The Databox acceptance receipt echoes the idempotency key and assigned record.

### HD-13 — Institutional service authority

Each bridge authenticates as its own program-specific service agent. WAC permits it to append only to the record
containers assigned to that service. Databox validation additionally requires matching program, relationship,
record class, source-event identity and issuer signature. It has no consumer-vault access and no cross-program role.

### HD-14 — Initial exported records

RetailCo exports a digital receipt containing synthetic warranty, product and allergen metadata, followed by a
synthetic recall update. AgencyCo exports a synthetic service notice. These records are sufficient to demonstrate
multiple sources, policy classes, supersession and aggregation without real institutional data.

### HD-15 — Consumer submission return path

The vault sends a correction or preference through an authenticated HTTP `POST`/create operation to the permitted
append-only submission container in that organisation's Databox. The Databox returns a signed acceptance receipt.

The integration plane consumes the committed submission event and places it in a staff-review queue. A reviewer
appends a disposition that is returned through the Databox. LDN, Solid Notifications or chat may alert a participant;
they are not the authoritative submission transport and do not directly update the legacy system.

## Demonstration selection

### HD-16 — Synthetic systems

Use two isolated synthetic programs:

1. **RetailCo**, with customer, purchase, receipt, warranty, product, allergen and recall events; and
2. **AgencyCo**, with customer, service-notice and correction-review events.

One consumer vault receives a different long-term connection credential from each program. The demo proves that a
RetailCo customerID, mapping, WebID, credential, token, WAC rule, event and submission cannot be used at AgencyCo, and
vice versa.

## Execution consequence

HAK-01 can start immediately. HAK-02 must encode these decisions in versioned contracts and fixtures. An
implementation agent may not substitute `did:key`, ACP, BBS, Entra Verified ID mappings, per-retry idempotency keys,
LDN submissions or direct legacy writes without a new decision record.
