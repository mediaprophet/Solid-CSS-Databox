# Records, receipts & evidence

This is what happens to data after a deposit — how a source event becomes an immutable, authorised,
receipted record, and how the person retrieves it.

## Records vs submissions

- **Records** flow organisation → person (receipts, warranties, notices, case notes). Each belongs to
  a **record class** declared in the profile.
- **Submissions** flow person → organisation (corrections, claims, preferences). Each belongs to a
  **submission class**. Submissions are *explicit disclosures by the person*, never reads the
  organisation performs against personal storage.

## The deposit pipeline

A `POST /source-events` deposit is drained through the bridge and the
[deposit/submission gateway](../../src/databox/gateway/DepositSubmissionGateway.ts):

1. **Idempotency** — a replayed `sourceEventId` is rejected, not double-committed.
2. **Bounds & shape** — payloads are capped (1 MB) and constrained to the allowed media types
   (LD+JSON by default); RDF is shape-validated against pinned limits.
3. **Binary quarantine** — binary evidence passes a fail-closed scanner before acceptance.
4. **Class checks** — `recordClass`, `legalBasis` and `purpose` must be declared in the profile.
5. **Commit** — on success the **exact accepted bytes** are committed to CSS storage at an opaque
   `acceptedResource` URL (live preset via `CssDataboxStore`).
6. **Receipt** — an [acceptance receipt](../../src/databox/receipt/AcceptanceReceiptSigner.ts) is
   signed (ES256 JWS) and returned in the deposit report.
7. **Evidence** — the exchange is recorded in the append-only
   [evidence ledger](../../src/databox/evidence/Evidence.ts).

If any step fails, the deposit fails **closed** — nothing is committed and no receipt is issued.

## Immutability: append-only, supersede, tombstone

Accepted records are never silently overwritten. Changes create **linked, auditable events**
(see [ADR-0018](../decisions/ADR-0018-append-only-supersession-tombstone.md)):

- **supersede** — a new version links back to the prior record;
- **tombstone** — a record is retired with an auditable marker;
- **crypto-erase** — retained-then-unrecoverable deletion.

Which mode applies is set per record class in the profile's `retention[]`.

## Receipts

Every accepted submission produces a **signed receipt the person can retain independently** of the
organisation. Receipts carry the governing policy id and version, so a party can later prove which
permissions, prohibitions and duties applied. Format is set by the profile
(`notifications.receiptFormat`, e.g. `vc-jose-cose/es256`). See
[ADR-0019](../decisions/ADR-0019-receipts-states-and-evidence-ledger.md).

## Assurance-gated access

Record sensitivity is enforced against the **assurance of the current authentication**, not merely
account ownership. A record class declares `minimumAssurance` across dimensions (identity proofing,
authenticator strength, freshness, …). A profile may require **step-up** before payload access, and may
even **suppress the existence** of a record where an exception requires it (`existenceVisibility`).

## Retrieval: notify-then-pull

1. The program deposits a record in the Databox.
2. The Databox sends a **minimal notification** to the consumer agent.
3. The agent authenticates (WAC + DPoP) and retrieves the record over ordinary Solid HTTP.
4. The agent stores an independent copy wherever the person chooses.

Knowing a resource URL never grants access, and direct push into personal storage is optional and
requires a separate, narrowly scoped grant — never inferred from the connection credential.

## Record awareness, access & correction

An authenticated, program-local **record and disclosure projection** lets the person discover relevant
records, request payload access, see current/superseded/disputed state, and invoke correction or
complaint routes. Existence and payload access are separate authorization decisions. See
[exchange and evidence](../exchange-and-evidence.md) and
[ADR-0023](../decisions/ADR-0023-record-awareness-access-correction.md).
