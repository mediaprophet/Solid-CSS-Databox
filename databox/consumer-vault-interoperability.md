# Consumer Vault Interoperability

## Required outcome

After onboarding, an organisation-hosted Databox issues a portable, long-term Databox Connection Credential to the
consumer's chosen Solid-compatible knowledge bank, vault, Pod agent or personal data service. The credential is the
durable authority for an automated relationship connection, similar in operational purpose to an API key. The
consumer service can hold and operate many independently scoped connections:

```text
consumer knowledge bank / vault
|- connection credential: Services Australia Databox
|- connection credential: ANU Databox
|- connection credential: Woolworths rewards Databox
|- connection credential: Coles rewards Databox
`- connection credential: electricity provider Databox
```

Each organisation sees only its own program-specific relationship. The vault is the aggregation point; the Databox
provider is not.

## Credential roles

Four artefacts remain separate:

| Artefact | Issuer or source | Purpose |
|---|---|---|
| Authentication credential | Consumer's accepted identity provider or adopted LWS authentication suite | Proves the agent/end-user identity and authentication event. |
| Databox Connection Credential | Organisation Databox | Long-term, holder-bound authority for one relationship; gives the vault a portable, verifiable description of how to connect and obtain access. |
| Access grant | Organisation/storage controller | Records the operations, targets, purposes and constraints authorized for the consumer agent. |
| Access token | Databox authorization server | Authorizes a short-lived request to one storage audience. |

The connection credential enables interoperability by bootstrapping and sustaining the connection. It authorizes
the bound vault agent to request ongoing access within the active grant without repeating the original human login.
It is not itself a bearer access token and does not authorize the organisation to enter the consumer's vault.

## API-key-like semantics

The connection credential is intentionally long-lived—normally for the relationship duration or a program-defined
period measured in months or years. It provides the useful properties expected from an API key:

- install once and use for unattended synchronisation;
- stable reference to one organisation program and Databox;
- narrow, predictable authority;
- explicit status, suspension, revocation and rotation;
- replacement during vault migration or key recovery; and
- no dependency on an interactive browser session for ordinary polling or notification handling.

Unlike a conventional shared-secret API key, the portable credential is bound to a public key controlled by the
vault. To use it, the vault proves possession of the corresponding private key in a signed client assertion,
challenge or adopted authentication-suite proof. The authorization server validates the credential, holder proof,
active access grant, client and requested storage realm before issuing a short-lived access token.

```text
long-term connection credential + fresh holder-key proof
  -> Databox authorization server
  -> short-lived, storage-audience access token
  -> permitted Solid/LWS operations
```

Copying the credential document alone is therefore insufficient. A deployment may implement a literal random API
secret only as a clearly labelled low-assurance hackathon fallback; it must be high entropy, stored only as a server
hash, transmitted only over TLS, separately revocable and excluded from URLs/logs. The holder-bound credential is
the target design.

For the current Solid track, it links the consumer's pairwise WebID or holder key to the Databox and the applicable
WAC/ACP/Databox policies. For the W3C LWS track, it can include an access-grant identifier and digest plus the storage
description or authorization discovery entry point. The LWS Access Grant remains a record of authorization and is
not presented to the storage server as an access token.

## Minimum credential contents

The normative schema and proof suite are implementation decisions, but the credential needs at least:

- credential identifier, type, issuer, issue/validity times and status/revocation method;
- stable schema and Databox profile versions;
- accountable organisation and bounded program identifier;
- opaque Databox/storage identifier and standards-conforming discovery entry point;
- program-specific holder identifier and proof-of-control binding;
- long-term connection authority, allowed unattended-use mode and reauthentication/step-up conditions;
- relationship identifier that is opaque outside the program;
- applicable access-grant or policy identifier, immutable version and digest;
- supported Solid/LWS compatibility profile identifiers;
- notification discovery and durable synchronisation capability references;
- record and submission capability classes, without embedding sensitive record contents;
- issuer verification method and key-history location; and
- terms, privacy notice, complaint, review and redress references.

It must not contain a reusable access token, refresh token, global consumer identifier, loyalty/customer number,
email address or a list of the consumer's other connections.

## Illustrative credential

This example is non-normative. A production profile must select a W3C Verifiable Credentials 2.0-compatible securing
mechanism, status method, schema and canonicalization behavior, or document another interoperable credential format.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://w3id.org/solid-databox/context/v1"
  ],
  "id": "urn:uuid:96cc71fc-5828-44a1-a57a-4f517e519b35",
  "type": ["VerifiableCredential", "DataboxConnectionCredential"],
  "issuer": "https://databox.rewards.example/id#issuer",
  "validFrom": "2026-07-14T00:00:00Z",
  "validUntil": "2027-07-14T00:00:00Z",
  "credentialSubject": {
    "id": "https://vault.example/id/rewards/8vK...#me",
    "connection": {
      "program": "https://databox.rewards.example/programs/rewards-v1",
      "databox": "https://databox.rewards.example/boxes/bx_7fV9.../",
      "storageDescription": "https://databox.rewards.example/boxes/bx_7fV9.../description",
      "accessGrant": "https://databox.rewards.example/grants/gr_2fa...",
      "accessGrantDigest": "urn:sha256:...",
      "accessProfile": "https://w3id.org/solid-databox/access/v1",
      "conformsTo": [
        "https://solidproject.org/TR/protocol",
        "https://www.w3.org/TR/lws10-core/"
      ],
      "syncProfile": "https://w3id.org/solid-databox/sync/v1"
    }
  },
  "credentialStatus": {
    "id": "https://databox.rewards.example/status/3#94567",
    "type": "BitstringStatusListEntry"
  },
  "credentialSchema": {
    "id": "https://w3id.org/solid-databox/schema/connection-v1",
    "type": "JsonSchema"
  }
}
```

Do not place live, mutable conformance URLs alone in evidence. The issued credential or associated evidence bundle
also records dated specification/profile identifiers and digests selected by the deployment.

## Installation ceremony

1. The consumer authenticates to the organisation at the assurance required to establish the relationship.
2. The consumer selects their vault/knowledge-bank client and supplies a pairwise identifier or holder key.
3. The vault proves control of that identifier/key and identifies its client software.
4. The Databox creates the isolated relationship, policy and access grant.
5. The Databox issues the connection credential to the vault through a standards-compatible response or explicit
   user-mediated transfer.
6. The vault validates issuer trust, proof, schema, holder binding, validity, status, program and endpoint policy.
7. The vault stores it and the bound private key in its private connection registry and performs authenticated
   discovery.
8. The vault proves possession of the bound key and obtains a short-lived access token through the selected Solid or
   LWS/Databox flow, without repeating the onboarding login, then performs an initial sync.
9. Both parties append evidence of issuance and installation without recording the consumer's other connections.

Installation does not require the organisation to receive read access to the vault. The vault may expose a narrowly
scoped callback or inbox, but that is a separate consumer-controlled grant.

## Synchronisation model

The preferred model remains notify then pull:

```text
organisation deposits record in its Databox
  -> Databox commits record, receipt and event
  -> minimal standard notification or connection-specific hint
  -> vault presents connection authority plus fresh holder-key proof
  -> authorization server issues a short-lived token
  -> vault reads permitted new records
  -> vault verifies issuer, payload digest, policy and receipt
  -> vault stores a consumer-controlled copy with provenance
```

After downtime, the vault uses the durable cursor/reconciliation interface rather than assuming WebSocket delivery
was complete. The credential supplies or discovers the applicable synchronisation profile.

Consumer-to-organisation communication is explicit:

```text
consumer selects information in vault
  -> vault constructs a program-specific submission
  -> vault authenticates to that Databox only
  -> vault appends to the permitted submission container
  -> Databox returns a signed acceptance receipt
```

The organisation does not query or crawl the vault. Direct delivery into a consumer inbox is optional and requires a
separate narrow append grant to that exact destination.

## Multi-connection isolation

The vault must isolate connection state by program:

- separate credential, token cache, pairwise identifier/key and endpoint set;
- tokens keyed by issuer, audience, client, holder and connection;
- no token, access grant or relationship credential replay across programs;
- no global connection list disclosed to an organisation;
- provenance on every imported record identifies its source Databox and program;
- policies from one Databox never authorize access to another;
- per-connection pause, revoke, resync, export and delete controls; and
- user-visible explanation of which organisation receives each outgoing field.

The consumer may link records inside their own knowledge bank. That private linking does not authorize the vault to
send the resulting graph, inferred facts or list of relationships back to any organisation.

## Lifecycle

The credential lifecycle includes issuance, installation acknowledgement, long-term unattended use, suspension,
revocation, expiry, renewal, holder-key rotation, vault migration and relationship closure. A new vault proves
control and receives a rotated credential or binding; copying an old credential file alone must not preserve
obsolete access. Ordinary sync does not require interactive login, but policy may require it for renewal, recovery,
holder changes, long inactivity or access to a higher-assurance record class.

Revoking the connection credential must cause or correlate with access-grant revocation and prevent new access-token
issuance within the declared revocation objective. Previously exported institutional records and signed receipts
remain verifiable subject to their retention and legal-policy rules.
