# Legal Design Review: Data Awareness, Access and Correction

## Status and scope

This note reviews the design implications of the **Competition and Consumer (Consumer Data Right) Rules 2020,
Compilation 10**, authorised version F2025C00572 registered on 18 June 2025, together with the access, data-quality
and correction structure of the Australian Privacy Principles (APPs).

It is an architecture input, not legal advice or a complete compliance mapping. The CDR Rules and the Privacy Act
must be mapped separately by sector, entity type, data class, jurisdiction, effective date and applicable exception.
The broader legislative corpus and accountable human legal review remain release gates under R-12.

## Finding

The consumer needs a practical way to know that a relevant record exists before access and correction rights can be
meaningfully exercised. That is a strong design implication, but it should not be overstated as a universal legal
rule that every record must always be proactively exposed.

The attached CDR Rules make portions of this visibility express rather than merely inferred:

- rule 7.9 requires the relevant consumer dashboard to be updated with what CDR data was disclosed, when it was
  disclosed and to whom;
- rule 7.10 requires notice when previously disclosed CDR data was incorrect, identifies the data and original
  recipient, and explains that the consumer may request disclosure of corrected data;
- rule 7.14 prohibits a fee for responding to or actioning a correction request; and
- rule 7.15 requires prompt acknowledgement, action within 10 business days, correction or a statement linked to the
  data where appropriate, and an electronic response describing the action, reasons where no action was appropriate,
  and complaint mechanisms. The Rules expressly contemplate giving that notice through a consumer dashboard.

The Privacy Act framework is complementary:

- APP 10 requires reasonable steps concerning the accuracy, currency and completeness of information collected, and
  its accuracy, currency, completeness and relevance when used or disclosed;
- APP 12 provides request-based access to personal information held about the individual, subject to its exceptions
  and procedural rules; and
- APP 13 provides request-based correction, third-party notification in specified circumstances, written reasons and
  complaint mechanisms following refusal, association of a statement in specified circumstances, response timing
  and no charging for correction.

Accordingly, DBX should implement a coherent chain of capabilities:

```text
record awareness -> authenticated access -> correction request -> acknowledgement
       -> assessment -> correction or linked statement/refusal
       -> downstream notification where applicable -> complaint/review -> durable evidence
```

## Consumer-visible record and disclosure index

Each Databox should expose an authenticated, program-local index or dashboard projection. It is not a search engine
over the institution and does not reveal other programs. For each item it should contain only the metadata the
consumer is authorized to see, potentially including:

- opaque record identifier, record class, title or safe description;
- accountable organisation and source system category;
- creation, effective and last-reviewed times;
- whether the item is an assertion, opinion, derived result or source record;
- provenance and current version/supersession status;
- current status such as current, superseded, disputed, correction requested, corrected, statement attached,
  access restricted, retained under a legal obligation or tombstoned;
- purposes for which the record is held or used where the program profile makes these available;
- disclosure entries containing what category was disclosed, when and to whom, where required and lawful;
- applicable policy, retention information and assurance needed for payload access; and
- access, correction, statement, complaint and review actions.

The index and payload have separate authorization decisions. A consumer may be allowed to know that an item exists
but need step-up authentication to read it. Conversely, where law or a valid safety/security exception prevents even
confirming existence, the system must not leak it through counts, URIs, events, error differences or notifications.
Program profiles therefore need an explicit `existenceVisibility` rule and a safe refusal model.

This index complements standard Solid containment and resource discovery; it does not replace them. A conforming
Solid client must still be able to use granted standard HTTP/LDP access. The dashboard is a Databox application view
over those resources and the external evidence ledger.

## Correction as a governed exchange

A correction request is an append-only consumer submission linked to the target record and, where known, the
specific field or assertion. It may propose replacement information, challenge an opinion, supply evidence or ask
that a statement be associated with the record.

On durable acceptance, the Databox issues a signed acknowledgement receipt containing the target, request digest,
accepted time, applicable response profile, calculated due time and complaint route. Acceptance does not imply that
the proposed correction is true or has been applied.

The review workflow records one or more dispositions:

- `corrected` — a new version supersedes the incorrect version;
- `statement-associated` — a consumer statement is durably and conspicuously linked to the data;
- `partially-corrected` — selected assertions are superseded and the remainder is explained;
- `no-change` — reasons and complaint mechanisms are supplied;
- `more-information-required` — the requested information and effect on the applicable deadline are explicit; or
- `redirected` — the responsible data holder or correction procedure is identified where the Databox operator
  cannot determine the correction itself.

The institutional source of truth must participate. A Databox-only annotation is insufficient if the institution
continues to use or disclose an uncorrected source record. The integration plane therefore needs a correction
connector that can correlate the opaque Databox target to the protected source identifier, create a governed source
case, receive its disposition, publish the corrected/superseding record and reconcile both systems.

## Versioning, statements and downstream propagation

DBX must not silently rewrite accepted history. Correction normally creates a new record version with `supersedes`
and provenance links. The earlier version is marked non-current and access is governed by retention and evidence
rules. If the source information must legally be altered or destroyed, the evidence model records the permitted
action without retaining prohibited content.

A statement associated with contested data must be apparent to an authorized user of that data. Implement this as a
machine-resolvable link included in the record representation and dashboard projection, not as an unrelated note in
a support system.

The disclosure ledger enables propagation. When a correction or quality event activates a requirement to notify or
redisclose to a prior recipient, the obligation engine creates one duty per eligible disclosure. It records queued,
attempted, accepted, failed and completed states separately and applies lawful exceptions. It does not infer that a
generic notification signal corrected the recipient's copy.

## ODRL operational vocabulary

The technical ODRL profile should be able to express deterministic duties such as:

- `dbx:makeRecordKnown` — add an authorized record entry to the consumer-visible index;
- `dbx:provideAccessRoute` — expose a usable access action or an applicable refusal route;
- `dbx:acknowledgeCorrection` — durably issue the correction acknowledgement;
- `dbx:assessCorrection` — reach and record a disposition by the applicable due time;
- `dbx:correctOrAssociateStatement` — publish a superseding record or conspicuously linked statement;
- `dbx:notifyPriorRecipient` — notify an identified prior recipient of the applicable correction;
- `dbx:provideReasons` — make the governed reasons available to the requester; and
- `dbx:provideComplaintRoute` — expose the applicable complaint or review mechanism.

These terms describe system behavior. They do not, by themselves, assert that an Act requires the behavior in every
case. A later signed compiled-policy bundle binds a duty to the authoritative provision, applicability result,
effective interval and human attestation.

## Required implementation changes

The DBX plan should treat the following as required rather than optional dashboard polish:

1. Add record-index, disclosure-ledger and correction-route settings to each institution/program profile.
2. Add an authenticated consumer projection joining Solid resources with minimised evidence-ledger events.
3. Add correction request, acknowledgement and disposition schemas with target and supersession links.
4. Add configurable response clocks; the CDR profile can encode the 10-business-day rule while an APP profile can
   encode its independently reviewed timing and exceptions.
5. Add source-system correction case APIs and reconciliation to the institutional integration plane.
6. Add statement association that remains apparent to downstream authorized users.
7. Add per-recipient correction/notification duties derived from the disclosure ledger.
8. Test existence confidentiality, step-up access, refusals, overdue cases, partial correction, versioning,
   downstream failures and consumer complaint routes.

## Legal mapping questions retained for the corpus workstream

- Which participant is the relevant APP entity, CDR data holder, accredited data recipient, representative or
  outsourced service provider for each deployment?
- Which records are personal information, CDR data, Commonwealth records, or subject to sector-specific access and
  correction schemes?
- When do the Privacy Act APPs apply, when do CDR privacy safeguards apply instead, and where do both or neither apply?
- Which access/refusal, secrecy, safety, identity-verification, archives, retention and deletion exceptions apply?
- Which prior recipients must be notified, at whose request, within what time, and when is notification impracticable
  or unlawful?
- Does a displayed item need to expose the payload, only its existence, a category-level description, or nothing?
- What constitutes a response, correction, linked statement, completed redisclosure and complaint route for each
  applicable regime?

Until these questions are resolved, fixtures must be labelled synthetic and no build should claim legal compliance.

## Authoritative sources reviewed

- Federal Register of Legislation, [*Competition and Consumer (Consumer Data Right) Rules 2020*](https://www.legislation.gov.au/Details/F2020L00094),
  Compilation 10, F2025C00572.
- Office of the Australian Information Commissioner, [Australian Privacy Principles 10, 12 and 13](https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles).
- Office of the Australian Information Commissioner, APP Guidelines: [Chapter 10](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-10-app-10-quality-of-personal-information),
  [Chapter 12](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-12-app-12-access-to-personal-information)
  and [Chapter 13](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-13-app-13-correction-of-personal-information).
- Office of the Australian Information Commissioner, [Consumer Data Right Privacy Safeguard Guidelines](https://www.oaic.gov.au/consumer-data-right/consumer-data-right-guidance-for-business/consumer-data-right-privacy-safeguard-guidelines).
