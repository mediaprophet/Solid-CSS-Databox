# LWS-first Hackathon Profile

## Objective

Build a working, standards-track prototype in which two organisation-hosted Databoxes issue portable connection
credentials to one consumer-controlled Solid-compatible vault. The vault uses those credentials to discover each
Databox, obtain short-lived access, synchronise records and make an explicit submission without disclosing its other
connections.

The hackathon optimizes for demonstrating the intended future interoperable architecture. It may implement current
W3C Working Draft behavior before Community Solid Server or mainstream clients implement it, provided every draft
dependency is pinned, advertised as experimental and isolated behind an adapter.

The binding choices for identifiers, WAC, credentials, customer mappings, exports and submissions are fixed in
[Hackathon decisions](hackathon-decisions.md).

## Fixed prototype baseline

- Community Solid Server source baseline: 7.1.9 in this repository.
- Primary protocol direction: W3C Linked Web Storage Protocol 1.0, June 2026 Working Draft snapshot.
- Authentication suite: LWS OpenID Connect first; SAML is represented by an interface and fixture, not a live IdP.
- Authorization flow: authorization-server discovery and RFC 8693 OAuth Token Exchange.
- Resource access token: signed JWT, storage-audience-bound, five-minute maximum lifetime for the demo.
- Access agreement: LWS ODRL-based Access Request and Access Grant extended by the Databox ODRL Profile.
- Portable long-term authority: W3C VC Data Model 2.0 `DataboxConnectionCredential`, secured with VC-JOSE-COSE/ES256,
  bound to a vault-controlled pairwise HTTPS WebID/Controlled Identifier key and issued by each Databox for unattended
  connection use.
- Solid authorization surface: WAC; LWS Access Grants plus Databox/ODRL enforcement narrow the WAC result. ACP is
  deferred from the hackathon.
- Resource server: CSS HTTP/RDF storage with an LWS discovery and operation adapter.
- Live notification: an advertised CSS-supported Solid notification channel.
- Missed-event recovery: experimental Databox cursor feed; it is not described as a completed LWS notification
  feature.
- Evidence: append-only event records and signed acceptance receipts sufficient for the synthetic demonstration.
- Data: synthetic organisation, consumer, retail receipt, warranty, dietary metadata and correction fixtures only.

This is an experimental profile, not a W3C conformance claim or production security accreditation.

## Deliberate hackathon choices

### LWS-first, CSS-backed

Implement the LWS-facing contracts as thin, versioned adapters over CSS extension points. Do not wait for upstream
CSS support and do not refactor unrelated CSS internals. Preserve existing Solid routes wherever possible so the
prototype demonstrates an evolutionary path rather than a replacement server.

### External identity simulation

Use a separate local OIDC issuer that represents an organisation-approved external IdP for onboarding, recovery and
step-up. It issues an LWS-compatible OIDC authentication credential whose URI subject is associated with the
consumer's program-specific identifier and whose client and authorization-server audience are bound. Do not imply
that this fixture is a myID production integration.

After onboarding, the vault uses the pinned LWS self-signed Controlled Identifier suite: it creates a fresh signed
authentication JWT from the connection's pairwise key. The authorization server validates it, resolves the active
connection and Access Grant for subject, client and Databox realm, and exchanges it for a short-lived access token.
The connection credential document is not used as a bearer subject token.

### Portable connection credential

Each Databox issues one connection credential containing:

- issuer, program and opaque Databox identifier;
- pairwise consumer subject and holder-key binding;
- LWS storage-description and authorization discovery entry points;
- access-grant identifier and digest;
- Databox/LWS/ODRL profile identifiers and versions;
- notification and cursor-sync discovery;
- status/revocation location; and
- schema and verification method.

The vault imports the credential into a per-program connection registry. No access or refresh token is embedded.
For subsequent unattended sync, the vault presents the connection credential identifier and a fresh proof from its
bound key; the experimental authorization adapter validates them and issues the short-lived storage token. The local
OIDC fixture remains the initial human-authentication and step-up source, not a requirement for every sync.

### Authorization and ODRL

For the demonstration, the active LWS Access Grant is the standards-facing authorization record. A composed Databox
authorizer additionally enforces:

- program tenant and storage realm;
- subject/client/audience match;
- active relationship and credential status;
- record class and synthetic assurance grade;
- append-only record/submission behavior; and
- selected Databox ODRL duties.

Implement two duties end to end: issue a signed acceptance receipt and notify the holder. Record queued, fulfilled
and failed states without attempting the complete legislative-policy system during the hackathon.

### Notification and sync

Use a Solid notification channel as a low-latency hint. The vault then retrieves through HTTP. Provide a minimal
cursor endpoint so the demo can stop the vault, add records, restart it and recover missed events. Clearly label the
cursor profile as a Databox experiment because the LWS Working Draft notification section is incomplete.

## Demonstration topology

```text
synthetic retailer A bridge -> Databox A (CSS + LWS adapter) --\
                                                             \
                                                              > consumer vault
                                                             /
synthetic agency B bridge --> Databox B (CSS + LWS adapter) --/
                                  |
                     external OIDC + authorization server
```

The two Databoxes may be separate local instances or rigorously isolated tenants. Separate origins are preferable
when the hackathon environment supports them.

## Required demonstration

1. Start two synthetic organisation Databoxes and one consumer vault.
2. Authenticate the same human through program-specific subjects.
3. Issue and visibly import two different connection credentials.
4. Show that neither credential contains a reusable token or the other relationship.
5. Discover each LWS storage and authorization server from the credential/HTTP surface.
6. Exchange an OIDC authentication credential for a short-lived, correctly audience-bound access token.
7. Deposit a signed retail receipt/warranty record and an agency notice.
8. Notify the vault and retrieve both records into its knowledge bank with provenance.
9. Stop the vault, deposit another record, restart and recover through the cursor feed.
10. Submit a correction or preference to one organisation and retain its signed acceptance receipt.
11. Demonstrate that the other organisation cannot read that submission or enumerate the other connection.
12. Revoke one connection and show that new tokens fail while the other connection continues working.

## Explicitly deferred

- live myID, Entra ID or university federation integration;
- SAML, controlled-identifier self-signing and DID authentication-suite implementations;
- complete Solid/LWS conformance or independent-client certification;
- production key management, HSMs, WORM audit storage and encrypted backups;
- full legislative-corpus ingestion and human-attestation workflow;
- complete ODRL action, conflict, consequence and remedy coverage;
- real retailer, agency or personal data;
- production malware scanning, retention and lawful-deletion operations; and
- production availability, scale and disaster-recovery claims.

Deferred items must be visible in the demo README and cannot be represented as implemented.

## Executable hackathon prompts

The prompts below are the hackathon execution path. The full DBX-01 through DBX-28 plan remains the path from
prototype to production evidence.

### HAK-01 — CSS/LWS adapter spike

**Agent level:** Hard

> Trace one authenticated GET and POST through CSS. Build the smallest experimental adapter that advertises a pinned
> LWS storage description and maps read/create operations onto CSS without changing existing Solid routes. Add
> integration tests for discovery, content type and `Link` headers.

**Gate:** an HTTP client can discover the synthetic storage and create/read one resource through the adapter.

### HAK-02 — Hackathon contracts and fixtures

**Agent level:** Medium, with Hard review

> Create pinned profile constants, JSON-LD contexts, schemas and synthetic fixtures for storage descriptions,
> connection credentials, access requests/grants, records, submissions, receipts and cursor events. Mark every
> experimental term and specification snapshot. Encode every HD-01 through HD-16 decision from
> `databox/hackathon-decisions.md`; do not silently select an alternative.

**Gate:** valid fixtures pass schema/shape checks and cross-program identifiers are visibly distinct.

### HAK-03 — External OIDC fixture

**Agent level:** Medium

> Configure a separate local OIDC issuer and client for two pairwise program subjects. Issue signed, audience-bound
> LWS OIDC authentication credentials for onboarding/step-up and expose discovery/JWKS. Create the two vault-
> controlled pairwise HTTPS WebID/Controlled Identifier documents and self-signed authentication fixtures used for
> unattended sync. Use no real people or institutional credentials.

**Gate:** positive credentials validate; wrong issuer, subject, client, audience and expired fixtures fail.

### HAK-04 — LWS authorization server and token exchange

**Agent level:** Hard

> Implement authorization-server discovery, metadata and RFC 8693 token exchange for the pinned LWS profile. Resolve
> an active access grant for subject, client and storage realm, then issue a signed access JWT of at most five minutes.
> Add the versioned Databox extension that accepts a long-term connection-credential reference plus a fresh signed
> holder-key proof for unattended exchanges. Add storage-side signature, issuer, audience, time and grant-status
> validation.

**Gate:** valid exchange enables one permitted request; wrong realm, client, grant, issuer and revoked grant fail.

### HAK-05 — Access request/grant and ODRL slice

**Agent level:** Hard

> Implement the LWS ODRL Access Request/Grant containers and the Databox extensions needed for program, relationship,
> record class and two duties: issue receipt and notify holder. Persist grant versions and revocation state.

**Gate:** the authorization server uses the active grant; revocation prevents new tokens; unsupported policy terms
fail closed.

### HAK-06 — Databox provisioning and credential issuance

**Agent level:** Hard

> Provision two opaque, isolated synthetic Databoxes and issue a VC 2.0 Databox Connection Credential for each. Bind
> holder, storage discovery, access-grant digest, profiles, sync and status. Implement verify/export/import fixtures;
> make it long-lived and usable for unattended token acquisition only with fresh proof of its bound vault key; embed
> no bearer or refresh token.

**Gate:** credentials independently verify and bootstrap the correct Databox; swapping program, holder, grant or
endpoint fails.

### HAK-07 — Record, submission and receipt flow

**Agent level:** Medium, with Hard authorization review

> Implement append-only deposit and submission containers, idempotency, synthetic record validation and signed
> acceptance receipts. Add RetailCo receipt/warranty/product/allergen and recall events, an AgencyCo notice, and one
> consumer correction. Receive the correction through authenticated HTTP create; use notifications only as hints.

**Gate:** accepted resources cannot be overwritten; duplicate idempotency keys return the original logical outcome;
cross-program writes fail.

### HAK-08 — Notification and cursor recovery

**Agent level:** Medium

> Advertise and use one CSS-supported Solid notification channel for hints. Implement a minimal authenticated,
> per-connection cursor feed over committed events with ordering, deduplication and retention metadata.

**Gate:** a disconnected vault recovers every missed logical event exactly once after restart.

### HAK-09 — Consumer knowledge-bank/vault

**Agent level:** Medium

> Build the reference vault with a private connection registry. Import two connection credentials, validate them,
> discover services, obtain tokens, sync records with provenance and submit selected data to one Databox. Keep keys,
> tokens, cursors and identifiers isolated by connection. Store imported copies under consumer-controlled WAC so a
> WebID-based social-share demonstration does not modify the organisation's Databox ACL.

**Gate:** the UI/API shows two connections and combined consumer knowledge while neither organisation can discover
the other connection or receive unselected fields.

### HAK-10 — Revocation and negative paths

**Agent level:** Hard

> Add connection/grant revocation, expired-token handling, wrong-audience replay, credential substitution, endpoint
> tampering, cross-tenant enumeration and append-only bypass tests. Show safe user-visible failure and retained audit
> evidence.

**Gate:** revoking A prevents new A access without interrupting B; every listed attack has a deterministic denial.

### HAK-11 — Scripted end-to-end demonstration

**Agent level:** Hard integrator

> Automate the twelve-step required demonstration from clean startup with deterministic synthetic data. Capture
> machine-readable evidence for credentials, discovery, token exchange, records, notifications, recovery, submission,
> receipt, isolation and revocation.

**Gate:** one command runs the scenario reliably and produces an evidence directory with no secrets or personal data.

### HAK-12 — Demo presentation and limitations

**Agent level:** Easy, with Hard accuracy review

> Produce the architecture diagram, five-minute demonstration script, setup instructions, standards manifest and
> limitations page. Label LWS behavior as a pinned experimental Working Draft implementation and distinguish actual,
> simulated and deferred integrations.

**Gate:** a new operator can run the demo, and no slide or README makes a production or W3C conformance claim.
