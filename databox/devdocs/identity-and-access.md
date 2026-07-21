# Identity and Access

## Connection ceremony

1. The consumer visits the program's Databox service.
2. The program authenticates them at the assurance required to establish the relationship.
3. The program resolves the login to its internal relationship record.
4. The consumer nominates a personal agent, WebID or wallet-controlled key.
5. The agent proves control through Solid-OIDC, a signed challenge or an equivalent cryptographic ceremony.
6. The provider creates an opaque Databox and installs program-specific policy.
7. The program issues a signed Databox Connection Credential to the consumer agent or selected vault.
8. The vault validates and stores it as one independently scoped connection among many.
9. The vault uses the credential to bootstrap standards-based discovery and obtains short-lived tokens for access.

Higher-risk records can require step-up authentication even after the relationship has been established.

## Separate credential functions

Do not use one API key for every purpose. Use separate artefacts:

| Artefact | Function | Typical lifetime |
|---|---|---|
| Databox Connection Credential | Long-term, holder-bound connection authority that describes the program, Databox, discovery, pairwise holder, access-grant/policy reference and relationship status. | Months, years or relationship duration; revocable and rotatable |
| Access token | Authorizes a particular client and current session against one audience. | Minutes |
| Record credential | Makes a receipt, warranty, determination or other record independently verifiable. | Record lifetime |
| Receipt | Proves that a specific payload was accepted at a specific time. | Evidence lifetime |

Access tokens should be audience-bound, short-lived and sender-constrained where the adopted compatibility profile
supports or requires it. The connection credential is designed to be stored in a Pod, vault or wallet, but possession
of its document alone must not authorize a request. A vault presents fresh proof of the bound key to obtain a
short-lived token without interactive login for every sync. See
[Consumer vault interoperability](consumer-vault-interoperability.md).

## Pairwise identifiers

A consumer agent should be able to present a different identifier to each program:

```text
Woolworths sees: https://wallet.example/id/woolworths/8vK...#me
Coles sees:      https://wallet.example/id/coles/2pR...#me
```

Both may be controlled by the same wallet, but neither profile links to the other. A shared provider must not insert
a global consumer identifier into tokens, credentials, URLs, logs or analytics accessible across tenants.

The program may maintain its own internal member number, but it stays behind the protected mapping layer. Where a
deterministic opaque identifier is unavoidable, use a tenant-specific keyed HMAC rather than an unkeyed hash.
Random stored identifiers remain preferable because secret rotation does not change them.

## Databox Connection Credential

An illustrative minimal credential is shown below. The fuller interoperability shape, flows and isolation rules are
defined in [Consumer vault interoperability](consumer-vault-interoperability.md).

```json
{
  "type": ["VerifiableCredential", "DataboxConnectionCredential"],
  "issuer": "https://databox.woolworths.example/",
  "credentialSubject": {
    "pairwiseHolder": "https://wallet.example/id/woolworths/8vK...#me",
    "databox": "https://databox.woolworths.example/boxes/bx_7fV9.../",
    "program": "RewardsProgram",
    "storageDescription": "https://databox.woolworths.example/boxes/bx_7fV9.../description",
    "accessGrant": "https://databox.woolworths.example/grants/gr_2fa...",
    "accessProfile": "https://databox.woolworths.example/policies/member-v1"
  },
  "validFrom": "2026-07-14T00:00:00Z",
  "validUntil": "2027-07-14T00:00:00Z",
  "credentialStatus": {
    "type": "BitstringStatusListEntry"
  }
}
```

Production credentials also require stable discovery semantics, schema, proof mechanism, status endpoint,
access-grant/policy digest, key-rotation policy and privacy review. Internal customer identifiers should not be
included unless strictly necessary and protected.

## Authentication assurance

Authorization evaluates the current authentication, not only the WebID. Relevant dimensions include:

- identity proofing strength;
- authenticator strength;
- federation strength;
- authentication time;
- step-up state;
- identity-provider accreditation or trust;
- delegation authority and scope.

The server records the trusted token claims and maps them to a program-defined assurance scale. It must never accept
an assurance value from an unsigned request header or an unverified token decode.

## Authorization layers

Authorization is the conjunction of several decisions:

```text
valid token
AND correct program audience
AND permitted issuer
AND permitted WebID or pairwise subject
AND permitted client
AND active relationship
AND sufficient assurance
AND permitted operation and resource
AND valid delegation, if acting for another person
```

WAC or ACP supplies the ordinary Solid resource authorization surface. The hackathon selects WAC so WebID-based
access and social sharing use the default CSS path; a production profile may select ACP. Assurance, record grade,
relationship status, guardianship and immutable-record rules require an additional Databox policy layer.

ODRL complements these controls by expressing what an authorized party may or must do with a record. WAC/ACP answers
whether an HTTP operation can reach a resource; ODRL describes permitted and prohibited use, constraints, duties,
consequences and remedies. An ODRL expression does not enforce itself, so the Databox requires a policy evaluator,
obligation handlers and audit evidence. See [Rights and obligations](rights-and-obligations.md).

## Illustrative permissions

| Actor | Records | Submissions | Receipts | Audit view |
|---|---|---|---|---|
| Consumer agent | Read permitted records | Append and read own | Read | Read permitted events |
| Program issuer | Append | No general access | Append | Append events |
| Review officer | Read relevant | Read assigned | Write disposition | Append events |
| Guardian | Delegated scope only | Delegated append | Delegated read | Limited |
| Provider operator | No ordinary data-plane permission | None | None | Operational metadata only |

Accepted records and submissions should be append-only. Program administrators use a separately controlled
management process; they do not receive a wildcard data-plane token.

## Revocation and recovery

The design must support:

- relationship suspension and revocation;
- loss and replacement of a consumer key;
- personal-agent migration;
- removal of a compromised client;
- identity-provider or signing-key rotation;
- guardian appointment, expiry and revocation;
- retention of historical provenance without retaining obsolete access.

Recovery must re-establish the real-world relationship at an appropriate assurance level. An email-only reset must
not restore access to records that originally required strong identity proofing.
