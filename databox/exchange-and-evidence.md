# Exchange and Evidence

## Loyalty-program example

An organisation-to-consumer record may combine:

- a digital receipt and line items;
- payment-method metadata that is suitably minimised;
- product identifiers and descriptions;
- warranty terms and proof of purchase;
- product manuals;
- ingredient, allergen and dietary metadata;
- recall and safety notices;
- rewards earned or redeemed;
- corrections and superseding records.

The record should distinguish retailer assertions, manufacturer assertions, consumer preferences and externally
verified facts. A dietary warning derived from product data is not equivalent to clinical advice.

## Deposit flow

1. The institutional bridge receives a committed source event from the system of record.
2. It resolves the program-local relationship to an opaque Databox.
3. It creates a canonical payload with issuer, subject, provenance, legal basis and record class.
4. It resolves and attaches the applicable versioned ODRL policy.
5. It signs the record or wraps it in a verifiable credential.
6. It deposits the record using authenticated `POST` or `PUT`.
7. The gateway validates authorization, policy, shape, signature, status, subject, class and idempotency key.
8. Storage appends the record and evidence event atomically, or through a transactional outbox.
9. The Databox returns a signed acceptance receipt.
10. A durable worker sends a minimal notification to the consumer agent.
11. The consumer authenticates, retrieves and independently retains the record.

Acceptance, notification, retrieval and acknowledgement are different states. A deposit receipt proves server
acceptance; it does not prove that the consumer retrieved or read the record.

## Consumer submission flow

1. The consumer chooses information to provide to this program.
2. The agent creates a purpose-specific submission and signs it where appropriate.
3. The agent posts it to an append-only submission container.
4. The gateway validates the relationship, client, assurance, payload and declared purpose.
5. The Databox appends the submission and immediately returns a signed receipt.
6. The issuer bridge places the submission in a review queue.
7. An authorized human or governed process records a disposition.
8. The disposition is appended, linked to the original submission and notified to the consumer.

A submission is not applied directly to the system of record. The bridge stages it for review, validation and
appropriate business processing.

## Record envelope

An illustrative record envelope is:

```json
{
  "type": "DigitalReceipt",
  "id": "https://databox.example/boxes/bx_.../records/receipts/rcpt_...",
  "issuer": "https://retailer.example/id#organisation",
  "addressedHolder": "https://wallet.example/id/program/8vK...#me",
  "issuedAt": "2026-07-14T03:15:00Z",
  "sourceEvent": "urn:uuid:...",
  "recordClass": "retail-receipt",
  "minimumAssurance": "basic",
  "policy": "https://databox.example/policies/retail-receipt-v1",
  "payloadDigest": "urn:sha256:...",
  "supersedes": null,
  "items": []
}
```

Record schemas should use established product, receipt, provenance and credential vocabularies where suitable.
Program extensions must be versioned and machine discoverable.

## Signed receipt

Every accepted deposit or submission returns evidence containing:

- transaction identifier;
- assigned resource URI;
- canonical payload digest;
- sender and addressed program relationship;
- server acceptance time;
- operation type;
- relevant profile and policy version;
- ODRL policy identifier and any duties activated by acceptance;
- idempotency key;
- signature and verification method.

An illustrative response is:

```json
{
  "type": "DataboxAcceptanceReceipt",
  "transaction": "urn:uuid:...",
  "acceptedResource": "https://databox.example/boxes/bx_.../submissions/sub_...",
  "payloadDigest": "urn:sha256:...",
  "acceptedAt": "2026-07-14T03:16:02Z",
  "status": "accepted",
  "policyVersion": "member-v1",
  "odrlPolicy": "https://databox.example/policies/submission-v1",
  "activatedDuties": ["issueReceipt", "stageForReview"],
  "proof": {}
}
```

The person can retain this outside the Databox. Later deletion or alteration by the provider must not invalidate an
already issued receipt.

## Immutability and correction

Accepted resources are append-only:

- an incorrect record is superseded by a new record linked to the previous version;
- a consumer correction is a separate submission;
- a review outcome is a separate disposition;
- lawful deletion creates a tombstone and evidence event;
- ordinary clients cannot overwrite audit resources.

If source material such as a recording is represented by a transcript or summary, the derivative records its method,
agent and verification status. The source remains authoritative where policy requires its retention.

A correction request targets an identifiable record or assertion and produces a signed acknowledgement with its
accepted time, applicable response profile and due time. Review may produce a superseding record, a conspicuously
linked consumer statement, a partial correction, a reasoned no-change disposition or a governed redirect. Reasons
and complaint routes are part of the consumer-visible disposition.

The institutional bridge must open and reconcile a corresponding case in the responsible source system. Where an
applicable policy requires a prior recipient to be informed or receive corrected data, the disclosure ledger creates
one independently tracked obligation per eligible recipient. A notification hint is not evidence that the recipient's
copy has been corrected. See [Legal design review](legal-review-cdr-data-awareness-and-correction.md).

## Notifications

Notifications contain only what is needed to locate and classify an event. They should not include receipt line
items, medical facts, dietary preferences or other sensitive content.

Outbound delivery requires:

- durable queueing;
- retries with bounded backoff;
- idempotency and duplicate tolerance;
- endpoint validation and SSRF protection;
- success and permanent-failure evidence;
- consumer-controlled endpoint replacement;
- no redirects into prohibited network ranges.

Solid change-notification subscriptions and Linked Data Notifications are distinct mechanisms. A profile must state
which is required for interoperability; a server-side LDN delivery requirement needs an explicit outbound sender.

## Audit

The audit record includes successful and denied access:

- authenticated agent, client and issuer;
- represented person and delegation, if any;
- current assurance and record grade;
- operation, target and decision;
- pre- and post-operation digest;
- institutional actor and principal;
- receipt, notification and disposition outcomes;
- record-index visibility, disclosure history and correction clock transitions;
- policy version and reason code.
- ODRL permission, prohibition or duty evaluated and its resulting state.

Do not treat ordinary application logs as evidence. Use an append-only external store, signed hash chain, WORM
storage or an equivalently controlled mechanism. Expose a minimised consumer-visible audit projection through the
Databox while protecting staff identifiers and operational security according to law and policy.

## Atomicity and failure handling

Evidence must survive partial failure. A production design should use either:

- a transactional data and outbox store; or
- an append-only event log as the source of truth, projecting resources into Solid storage.

The system must not return an acceptance receipt before durable acceptance. Notification failure must not roll back
an accepted deposit, but it must remain visible and retryable. Duplicate delivery of the same idempotency key must
return the original outcome rather than create another logical record.
