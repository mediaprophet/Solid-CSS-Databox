# Institution Profile

The **Institution Profile** is the machine-validated definition of a program. It supplies the
program-specific facts (who is accountable, what records exist, on what legal basis, with what
retention and redress) while the universal Databox protocol supplies the invariants the profile may
not weaken.

- Schema version: `dbx-institution-profile/1.0.0`
- Types & validation:
  [`src/databox/profile/InstitutionProfile.ts`](../../src/databox/profile/InstitutionProfile.ts),
  [`InstitutionProfileSchema.ts`](../../src/databox/profile/InstitutionProfileSchema.ts),
  [`InstitutionProfileValidator.ts`](../../src/databox/profile/InstitutionProfileValidator.ts)
  (`loadInstitutionProfile()` validates fail-closed).
- Worked examples: [`databox/fixtures/loyalty-institution-profile.json`](../fixtures/loyalty-institution-profile.json)
  and the Seraphim/MegaMart profiles embedded in the server landing page.

## Field groups

| Group | Fields | Purpose |
|---|---|---|
| **Identity** | `profileId`, `profileVersion`, `effectiveInterval`, `synthetic`, `program.principal`, `program.accountableParty` | Who runs the program and who is accountable. |
| **Processors** | `processors[]` (`legalName`, `jurisdiction`, `purposes`, `readsPayload`) | The subcontractor chain and whether each may read payloads. |
| **Tenancy** | `tenancy` (`deploymentModel`: `path-only` \| `program-subdomain`, `origin`, `tokenAudience`) | Program isolation topology. Subdomains/origins are preferred over path-only. |
| **Crypto** | `crypto` (`signingSuite`, `signingKeyRef`, `atRestEncryption`, `applicationLevelEncryption`) | Signing and encryption configuration. |
| **Identity & assurance** | `identityProviders[]`, `assuranceMappings[]`, `tokenBroker`, `offlineGrantPolicy` | Accepted IdPs and how their claims map to assurance dimensions (identity proofing, authenticator strength, freshness, federation trust, step-up). |
| **Record classes** | `recordClasses[]` (`id`, `label`, `minimumAssurance[]`, `policyTemplate`, `legalBasis`, `purposes[]`, `existenceVisibility`) | The record types the program may deposit, and the assurance required to *see* vs *read* them. |
| **Submission classes** | `submissionClasses[]` (`id`, `label`, `minimumAssurance[]`, `policyTemplate`, `purposes[]`) | The kinds of submission the person may return (corrections, claims, preferences). |
| **Policies** | `policies` (`templates[]` with `odrlProfile`, `conflictStrategy`, `effectiveTimeBehavior`) | The ODRL policy templates governing each class — see [Policies & ODRL](policies-and-odrl.md). |
| **Compiled policy** | `compiledPolicy` (`compiledPolicyDigest`, `attestationId`, `attestationStatus`, `legalComplianceClaimed`) | The attested, compiled policy corpus and whether legal compliance is claimed. |
| **Legislative corpus** | `legislativeCorpus` (`manifestDigest`, `entries[]`) | The pinned legal sources the policy was compiled against. |
| **Lawfulness** | `legalBases[]`, `declaredPurposes[]` | The legal bases and purposes a record/submission may cite. |
| **Lifecycle** | `retention[]` (`retentionDays`, `deletionMode`: `crypto-erase` \| `tombstone` \| `supersede`, `tombstoneOnExpiry`), `systemsOfRecord[]` | Retention/deletion rules and the upstream systems of record. |
| **Delivery** | `notifications` (`notificationFormat`, `receiptFormat`) | Notification and receipt formats. |
| **Redress** | `redress` (`stepUpSupported`, `existenceVisibilityDefault`, `correctionResponseDays`, `appealRoutes[]`) | Consumer access, correction clocks and appeal routes. |

## How it is used

- `POST /programs` calls `loadInstitutionProfile()` — an invalid or internally inconsistent profile is
  rejected with `400` and nothing is provisioned.
- A deposit's `recordClass`, `legalBasis` and `purpose` must all be **declared** in the profile.
- Each record/submission class resolves to a **versioned ODRL policy**; the policy id and version are
  carried into receipts and audit events so parties can later prove which permissions and duties
  governed an exchange.

## A minimal shape

```jsonc
{
  "schemaVersion": "dbx-institution-profile/1.0.0",
  "profileId": "prog-example",
  "profileVersion": "1.0.0",
  "effectiveInterval": { "effectiveFrom": "2026-01-01T00:00:00Z", "effectiveUntil": "2027-01-01T00:00:00Z" },
  "program": {
    "principal": { "id": "party-principal", "legalName": "Example Program", "jurisdiction": "AU", "contact": "mailto:privacy@example" },
    "accountableParty": { "id": "party-accountable", "legalName": "Example Office", "jurisdiction": "AU" }
  },
  "tenancy": { "deploymentModel": "path-only", "origin": "https://localhost:3000/", "tokenAudience": "https://localhost:3000/" },
  "recordClasses": [
    { "id": "rc-note", "label": "Note", "minimumAssurance": [{ "dimension": "identityProofing", "minLevel": 2 }],
      "policyTemplate": "pt-records", "legalBasis": "lb-consent", "purposes": ["p-service"], "existenceVisibility": "visible" }
  ],
  "submissionClasses": [],
  "policies": { "templates": [{ "id": "pt-records", "version": "1.0.0", "odrlProfile": "https://w3id.org/solid-databox/odrl-profile/v1" }],
    "conflictStrategy": "prohibition-overrides", "effectiveTimeBehavior": "prospective" },
  "legalBases": [{ "id": "lb-consent", "description": "Consent." }],
  "declaredPurposes": [{ "id": "p-service", "description": "Service delivery." }],
  "retention": [{ "recordClass": "rc-note", "retentionDays": 2555, "deletionMode": "crypto-erase", "tombstoneOnExpiry": false }],
  "notifications": { "notificationFormat": "solid-notification/websocket", "receiptFormat": "vc-jose-cose/es256" },
  "redress": { "stepUpSupported": true, "existenceVisibilityDefault": "visible", "correctionResponseDays": 30, "appealRoutes": [] }
}
```

See the [loyalty fixture](../fixtures/loyalty-institution-profile.json) for a complete profile with
multiple record/submission classes, processors, assurance mappings and appeal routes.
