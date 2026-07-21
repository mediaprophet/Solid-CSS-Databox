# Isolation and Privacy

## Isolation objective

A Databox connection grants a narrowly scoped exchange relationship with one declared program. It grants no
visibility into the consumer's general personal storage, identity graph, other organisational relationships or
other Databox connections.

For a loyalty service, Woolworths may learn what the consumer deliberately exchanges with the Woolworths program.
It must not learn that the same person has a Coles Databox, university Databox or government Databox through the
Databox infrastructure.

## Trust boundaries

At least five boundaries require enforcement:

1. **Between programs:** one tenant cannot query, address or administer another tenant's resources.
2. **Between consumers:** one member cannot enumerate or access another member's Databox.
3. **Between program and wallet:** the program cannot browse the consumer's personal storage.
4. **Between provider and program data:** the hosting provider receives only the access its operating role requires.
5. **Between operations and analytics:** telemetry cannot silently reconstruct a cross-program identity graph.

RDF access policy protects resources from ordinary clients. It does not constrain database administrators, platform
service accounts, backups, queues, logging systems or support tooling. Those require infrastructure controls.

## Tenant controls

A multi-program provider should implement:

- separate program origins and token audiences;
- separate client registrations and service identities;
- routing that resolves and validates the tenant before Solid authorization;
- independent storage namespaces or databases;
- independent encryption and signing keys;
- independent queues, notification workers and audit streams;
- tenant-scoped administrative roles;
- explicit denial of platform-wide data-plane credentials;
- automated cross-tenant negative tests;
- tenant-aware backup, restore and deletion processes.

For higher assurance, deploy separate service instances or accounts per program. Where the provider itself must not
read payloads, use application-level encryption with keys controlled by the program principal and/or consumer.

## No wallet browsing

Registering a consumer inbox, WebID or agent endpoint is not permission to traverse it. The program should normally
deliver a notification and let the consumer agent pull the record.

Consumer-to-program information is sent by an explicit submission:

```text
consumer chooses information
        |
        v
consumer agent creates a program-specific disclosure
        |
        v
POST to the program Databox submission container
        |
        v
signed receipt returned to consumer
```

The program never executes a general query such as "read the consumer profile". If direct personal-storage access
is supported, it requires a separate grant naming the exact resource or inbox, operations, purpose and expiry.

## Data minimisation

Prefer derived, purpose-specific assertions over source data. For example, a consumer who wants food warnings can
submit:

```json
{
  "preference": "warn-about-gluten",
  "purpose": "product-warning-generation",
  "validUntil": "2027-07-01"
}
```

They need not disclose a diagnosis, medical record, clinician, other retailers' purchases or the reason for the
preference. The program profile should state whether a value is a preference, self-asserted fact or verified
credential; cryptographic validity does not make the underlying claim true.

## Identifier and metadata leakage

Prevent personal or correlating data from appearing in:

- domains and URI paths;
- browser history and referrer headers;
- access logs and error traces;
- object-storage keys;
- message topics and queue names;
- metrics labels;
- tracing baggage;
- notification previews;
- client identifiers;
- shared support dashboards.

Opaque identifiers reduce accidental disclosure but are not secrets. Authorization is required for every protected
operation, including existence checks and redirects. Error responses should not reveal whether another consumer's
box exists.

## Analytics

Program analytics must use program-local identifiers. The provider must not create a hidden global consumer key to
join data across customers.

Cross-program aggregation requires an independently documented legal and governance basis and should not be a
Databox protocol feature. Where aggregate operational reporting is necessary, minimise fields, apply thresholding
and ensure that small populations cannot be reidentified.

Program ODRL policies should prohibit disclosure, transfer, indexing or profiling outside the declared program and
express duties such as purpose limitation, retention expiry and deletion. These policies supplement infrastructure
isolation; they do not give the hosting provider a technical ability it would otherwise lack, nor do they substitute
for encryption, tenancy controls or legal accountability.

## Provider and subcontractor accountability

Every deployment records:

- the program principal;
- the Databox provider;
- relevant subcontractors;
- the party accountable to the consumer;
- processing locations and jurisdictions;
- incident and complaint contacts;
- retention and deletion responsibilities.

Outsourcing hosting does not transfer or erase program accountability. Administrative access by provider staff is a
high-assurance, purpose-bound and audited event.

## Threat cases

Conformance testing should attempt at least:

- changing the host or path of a valid token to address another program;
- replaying a relationship credential as though it were an access token;
- using a valid WebID from an unapproved client;
- guessing box and resource identifiers;
- requesting a high-grade record after low-assurance authentication;
- following RDF links outside the permitted Databox;
- querying another program through search, indexes or notifications;
- leaking identifiers through logs, metrics or error messages;
- using support or backup tooling to bypass tenant restrictions;
- correlating pairwise identities through shared claims or analytics.
