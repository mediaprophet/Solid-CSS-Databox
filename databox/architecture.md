# Architecture

## Participants

| Participant | Responsibility |
|---|---|
| Program principal | Defines the purpose, record classes, legal basis, retention and redress process. |
| Databox provider | Operates isolated storage, authorization, messaging, receipts and audit. |
| Issuer bridge | Converts institutional records into signed Databox deposits. |
| Consumer | Chooses a personal agent and decides what to submit. |
| Consumer agent | Authenticates, retrieves, verifies, stores and submits on the consumer's behalf. |
| Identity provider | Authenticates a person or institutional actor at a recorded level of assurance. |
| Review officer | Reviews submissions and signs or authorizes dispositions. |
| Auditor or regulator | Verifies evidence under a separately authorized process. |

The acting agent and represented person must remain distinct. This is necessary for guardians, employees acting for
an organisation, automated services and software operating for a person.

## Recommended topology

Use a distinct origin for each program where practical:

```text
https://databox.woolworths.example/
https://databox.coles.example/
```

A contracted platform may instead use program subdomains:

```text
https://woolworths.databox-provider.example/
https://coles.databox-provider.example/
```

Subdomains are preferable to path-only tenancy because token audiences, cookies, browser origins, CORS policies,
client registrations and operational controls can all be program-bound.

## Resource layout

An illustrative Databox is:

```text
/boxes/{opaque-box-id}/
|- connection
|- records/
|  |- receipts/
|  |- warranties/
|  |- product-information/
|  |- rewards/
|  `- correspondence/
|- submissions/
|  |- corrections/
|  |- warranty-claims/
|  `- preferences/
|- dispositions/
|- receipts/
|- record-index/
|- disclosure-view/
`- audit-view/
```

The box identifier should be generated from at least 128 bits of cryptographically secure randomness. It must not
be a name, email address, loyalty number, student number, customer reference or an unkeyed hash of one of those
values.

The provider keeps a protected server-side mapping:

```text
opaque box identifier --> program-local relationship record
```

Identifiers are never reassigned. Resource identifiers within a box are independently random so that receipt or
submission volume cannot be inferred by incrementing a sequence.

## Control plane and data plane

Provisioning, customer matching, staff administration and key management form a control plane. Solid resource
operations form the data plane. They should not share an unrestricted public API.

The control plane:

- creates and suspends Databoxes;
- binds program-local identities;
- installs access policies;
- rotates keys and revokes relationships;
- manages retention and lawful deletion;
- never acts through an ordinary consumer token.

The data plane:

- accepts validated deposits and submissions;
- authorizes retrieval;
- emits notifications and receipts;
- prevents destructive changes;
- records evidence.

## Personal storage connection

The consumer registers an agent identity, notification destination and optional storage destination. The Databox
issues a portable connection credential that the consumer installs in their Solid-compatible knowledge bank, vault,
Pod agent or personal data service. Registration is not an authorization for the program to traverse that storage.

One vault can hold many independently scoped connection credentials. Each credential bootstraps discovery and access
for one organisation program. It must not disclose the other credentials or give a Databox provider a platform-wide
view of the consumer's relationships. See [Consumer vault interoperability](consumer-vault-interoperability.md).

The preferred delivery pattern is notify then pull:

1. The program deposits a record in its Databox.
2. The Databox sends a minimal notification to the consumer agent.
3. The agent authenticates to the Databox and retrieves the record.
4. The agent stores an independent copy wherever the consumer chooses.

Direct push into personal storage is optional and requires a separate, narrowly scoped append grant to a specific
inbox. It must not be inferred from the existence of a relationship credential.

## Program profile

Every deployment needs a machine-validated profile containing:

- program principal and accountable party;
- processor or subcontractor chain;
- program origin and token audience;
- permitted identity providers and assurance mappings;
- record types and minimum assurance;
- permitted consumer submission types;
- retention, deletion and tombstone rules;
- legal basis and declared purposes;
- ODRL profile, policy templates, conflict strategy and obligation handlers;
- notification and receipt formats;
- review, complaint and redress routes;
- record-existence visibility, consumer access and correction routes;
- correction response clocks, statement-association and prior-recipient notification rules;
- storage, encryption, signing and audit configuration.

The universal protocol defines invariants. The profile supplies program-specific facts and must not weaken those
invariants.

Each record and submission class should resolve to a versioned ODRL policy. Policy identifiers and versions are
included in receipts and audit events so the parties can later establish which permissions, prohibitions, constraints
and duties governed an exchange.

## Institutional integration plane

The institutional integration plane is a separately deployable control-plane service between systems of record and
CSS. It owns connectors, customer resolution, the protected institutional-key-to-Databox mapping, transformation,
source outbox consumption, institutional signing, idempotency, reconciliation, submission intake and staff-review
integration.

```text
institutional source transaction
  -> committed source outbox event with typed customerID
  -> protected mapping registry resolves opaque relationship/Databox
  -> policy and schema transformation
  -> program service WebID signs and deposits record
  -> Databox returns signed acceptance receipt
  -> integration plane records source-to-Databox evidence
```

The mapping key includes organisation, program, source system and identifier namespace. The raw customerID never
enters a public resource URI, connection credential, consumer vault or notification. The bridge can run beside CSS
for a small deployment or behind an enterprise API gateway, but its mapping database and business workflows remain
outside the public Solid request path. Hackathon details are fixed in
[Hackathon decisions](hackathon-decisions.md).

The integration plane also routes a consumer correction from the opaque Databox record to a governed case in the
responsible system of record. It returns the institutional disposition, publishes any superseding record, and
reconciles the Databox and source state. A correction recorded only in the Databox is incomplete if the institution
continues to use or disclose the uncorrected source record.

## Consumer record awareness

Expose an authenticated, program-local record and disclosure projection so the consumer can discover relevant
records, request payload access, identify current/superseded/disputed state, and invoke correction or complaint
routes. The projection joins safe Solid resource metadata with a minimised view of evidence-ledger events.

Existence and payload access are separate authorization decisions. A profile may require step-up before payload
access, and may suppress even the existence of a record where an applicable exception requires it. Standard Solid
containment and HTTP/LDP operations remain available to independently implemented clients with the relevant grant;
the projection is an application feature, not a proprietary replacement protocol. See
[Legal design review: data awareness, access and correction](legal-review-cdr-data-awareness-and-correction.md).
