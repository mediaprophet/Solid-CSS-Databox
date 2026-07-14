# Rights and Obligations with ODRL

## Purpose

The Open Digital Rights Language (ODRL) expresses machine-readable policies about identifiable assets. A policy can
state permissions, prohibitions and duties; identify assigner and assignee parties; constrain actions; and describe
consequences or remedies.

Databox uses ODRL to make the rights and obligations associated with records and submissions portable, inspectable
and auditable. Examples include:

- a consumer is permitted to read and retain their digital receipt;
- a program is prohibited from disclosing it to another loyalty program;
- the provider must issue a receipt after accepting a submission;
- the program must stage a correction for review and respond within a defined period;
- a warranty record must remain available for its applicable retention period;
- a notification must reveal no more than the minimum event metadata.

## Division of responsibility

ODRL is a policy expression language, not an access-control enforcement mechanism by itself.

| Layer | Question answered |
|---|---|
| Solid-OIDC | Who is making this request and how were they authenticated? |
| WAC or ACP | May this agent/WebID, and any supported client/issuer constraint, perform this HTTP operation on this resource? |
| Databox authorization | Is the relationship active and is assurance, delegation and record grade sufficient? |
| ODRL evaluator | Is the intended action permitted, prohibited or conditional, and which duties apply? |
| Obligation engine | Were activated duties fulfilled, failed, retried or remedied? |
| Evidence ledger | What policy and decision applied, and what actually happened? |

All applicable layers must allow an action. An ODRL permission cannot override a WAC/ACP denial, tenant boundary or
Databox invariant. A malformed or unsupported policy fails closed.

## Databox ODRL Profile

Use the ODRL Core and Common Vocabulary wherever terms already exist. Publish a versioned Databox ODRL Profile only
for domain concepts that need additional semantics, potentially including:

- `dbx:deposit`;
- `dbx:submit`;
- `dbx:issueReceipt`;
- `dbx:notifyHolder`;
- `dbx:stageForReview`;
- `dbx:recordDisposition`;
- `dbx:makeRecordKnown`;
- `dbx:provideAccessRoute`;
- `dbx:acknowledgeCorrection`;
- `dbx:assessCorrection`;
- `dbx:correctOrAssociateStatement`;
- `dbx:notifyPriorRecipient`;
- `dbx:provideReasons`;
- `dbx:provideComplaintRoute`;
- `dbx:retainEvidence`;
- `dbx:tombstone`;
- `dbx:minimumAssurance`;
- `dbx:declaredPurpose`;
- `dbx:otherProgram`.

Every custom term needs a stable IRI, definition, expected operands, processing behavior and conformance test. Policy
expressions identify the profile they conform to. Unsupported actions or constraints must not be ignored.

## Illustrative agreement

The following is illustrative JSON-LD. The `dbx:` actions and operands require the published Databox ODRL Profile.

```json
{
  "@context": [
    "http://www.w3.org/ns/odrl.jsonld",
    { "dbx": "https://w3id.org/solid-databox/ns#" }
  ],
  "@type": "Agreement",
  "uid": "https://databox.example/policies/retail-receipt-v1",
  "profile": "https://w3id.org/solid-databox/odrl-profile/v1",
  "permission": [{
    "target": "https://databox.example/boxes/bx_.../records/receipts/rcpt_...",
    "assigner": "https://retailer.example/id#organisation",
    "assignee": "https://wallet.example/id/program/8vK...#me",
    "action": ["read", "use"],
    "constraint": [{
      "leftOperand": "dbx:declaredPurpose",
      "operator": "eq",
      "rightOperand": "personal-recordkeeping"
    }]
  }],
  "prohibition": [{
    "target": "https://databox.example/boxes/bx_.../records/receipts/rcpt_...",
    "assigner": "https://wallet.example/id/program/8vK...#me",
    "assignee": "https://retailer.example/id#organisation",
    "action": "distribute",
    "constraint": [{
      "leftOperand": "recipient",
      "operator": "isA",
      "rightOperand": "dbx:otherProgram"
    }]
  }],
  "obligation": [{
    "assigner": "https://wallet.example/id/program/8vK...#me",
    "assignee": "https://databox.example/id#provider",
    "action": "dbx:retainEvidence"
  }]
}
```

Production policies should normally target stable asset classes or immutable policy-controlled resources rather than
requiring a bespoke policy document for every receipt. A record can link to a policy template plus a frozen version
and any record-specific constraints.

## Policy lifecycle

1. The program publishes a signed, immutable policy version and its profile.
2. The institutional profile binds each record or submission class to a policy version.
3. The gateway resolves and validates that policy when accepting an asset.
4. The accepted record, receipt and audit event identify the exact policy version.
5. The evaluator determines permissions, prohibitions, constraints and precondition duties for each relevant action.
6. The obligation engine creates durable duty instances for post-action requirements.
7. Workers fulfill duties and append evidence, or record failure, consequence and remedy.
8. A new policy version governs new assets or an explicitly authorized transition; history is never rewritten.

## Duties and evidence

Each activated duty has a durable state machine:

```text
pending --> in-progress --> fulfilled
   |             |
   |             `--> retrying --> fulfilled
   `---------------------------> failed --> consequence/remedy
```

Evidence records:

- policy and rule identifier;
- target asset;
- assigner, assignee and responsible processor;
- activation event and time;
- constraints evaluated;
- due time, if any;
- fulfillment event and digest;
- failure reason and retry history;
- applicable consequence or remedy;
- signature and audit-chain reference.

A queued task is not proof of fulfillment. For example, `notifyHolder` is fulfilled only according to the delivery
condition defined by the profile, and the policy must distinguish queued, sent, accepted and retrieved states.

Correction duties likewise remain separate: accepting a request is not assessing it; assessing it is not correcting
the source; signalling a prior recipient is not proof that corrected data was received or applied. Each duty has its
own target, due time, completion evidence, consequence and complaint or remedy route.

## Conflict and precedence

The Databox profile defines one deterministic conflict strategy. Safety boundaries remain external invariants:

- explicit tenant isolation cannot be relaxed by policy;
- a prohibition cannot be bypassed by a broad permission;
- insufficient authentication assurance results in denial;
- a program-specific policy cannot authorize access to another program;
- statutory or court-ordered handling is represented as a new authoritative policy event, not a silent override;
- unsupported or ambiguous rule composition fails closed and is audit-visible.

Legal basis and ODRL policy are related but distinct. A policy should cite the legislation, agreement or program term
that grounds it, while the legal instrument remains the authority.

## Consumer presentation

Consumer agents should translate applicable policies into understandable statements without discarding the original
machine-readable expression. At minimum, show:

- what the consumer and program may do;
- what each party is prohibited from doing;
- what information is required and for which purpose;
- which duties were activated;
- relevant expiry or retention periods;
- complaint, correction and remedy routes;
- links to the exact policy and evidence records.

Human-readable summaries are explanatory. The signed policy expression and evidence remain available for independent
verification.
