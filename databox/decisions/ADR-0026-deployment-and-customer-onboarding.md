# ADR-0026 — Single-organisation deployment and consumer-pod access model

- **Status:** Adopted (customers access their databox through their own Solid-compatible pod; an
  org-hosted portal as an access path and org-minted identity are both rejected)
- **Date:** 2026-07-15
- **Decision owner:** DBX-02 lead (Hard), adopting the product owner's directive
- **Residual human review required:** identity, privacy — the consumer-controlled access model and the
  "no org-held consumer key" rule must pass human identity/privacy review before production.
- **Sources adjudicated:** product-owner directives — (1) one organisation installs one instance for its
  many customers (the multi-pod environment); (2) **end-users (customers) must have their own
  Solid-compatible pod to access their databoxes.** Reconciles ADR-0002 (topology/tenancy), ADR-0004
  (pairwise consumer-controlled identity), ADR-0013 (connection credential), ADR-0016 (mapping), ADR-0024
  (consumer agent); DBX-01 §5 (CSS multi-pod).
- **Consumed by / blocks prompts:** DBX-13 (credential issued to the consumer pod), DBX-24 (consumer
  agent = the required access path). No code change to committed DBX-10/11/14.
- **Relates to:** ADR-0002, ADR-0004, ADR-0013, ADR-0016, ADR-0024.

## Context

The design illustrates isolation mainly from the **consumer's** side (one wallet aggregating many orgs).
The product owner has fixed two things about the **organisation's** deployment and the **consumer's**
access:

1. **Deployment:** one organisation installs **one** instance of the Databox platform and serves **many of
   its own customers** from it — one Databox box per customer relationship. This requires the CSS multi-pod
   environment (many boxes in one instance), not an instance per customer.
2. **Access:** **each end-user (customer) must have their own Solid-compatible pod/agent to access their
   databox.** A consumer-controlled pod is a **requirement**, not an optional upgrade.

An earlier revision of this ADR proposed a two-tier model with an org-hosted portal for customers without a
vault. **That is rejected** (see Alternatives): an org-hosted portal as the access path re-centralises
control in the organisation and defeats the consumer-sovereignty principle the Databox exists to serve.

## Decision

### Deployment (unchanged from the committed code)

The primary deployment unit is **one organisation, one installed instance, many customer boxes.** The
tenant is `(organisation, program)`; each customer relationship is an **opaque box** within it; CSS's
`ConfigPodManager`/`GeneratedPodManager` provide the multi-pod backend. Multi-program and shared-provider
multi-organisation tenancy remain the supported outer ring (ADR-0002/DBX-11), not required for the
single-organisation case. The organisation is the storage controller/custodian of its customers' boxes
(S-24); the isolation that matters within the instance is customer↔customer (boundary B2) plus
operator-audited access (invariant 10). **The committed DBX-10/11/14 code already implements this — no
change required.**

### Access — consumer pod required (Adopted)

- Every customer accesses their org-hosted databox through **their own Solid-compatible pod/agent** (the
  consumer agent of ADR-0024/DBX-24). This is the **only** standard access path.
- Access is **Solid-native**: the consumer pod authenticates via Solid-OIDC with the customer's **pairwise
  WebID** (ADR-0004) and proves control of its **holder key**; the DBX-13 connection credential is bound to
  **that** key. The customer retrieves records (notify-then-pull), retains independent copies in their own
  pod, and makes explicit submissions — all consumer-controlled.
- **The organisation MUST NOT mint or hold a consumer key or identity**, and MUST NOT interpose an
  org-hosted portal as the access path. The credential is bound to a key the **customer** controls; there
  is no org-held key that could impersonate the customer. This keeps invariant 4 and the anti-impersonation
  property intact.

### Onboarding consequence (a deliberate tenet, not a bug)

Because access requires a consumer pod, onboarding an organisation's customer base means **each customer
must have (or obtain) a Solid-compatible pod.** This is an accepted **consumer-data-sovereignty tenet**
(consistent with the broader consumer-controlled-data vision), not a friction to engineer around by
weakening consumer control. The organisation's onboarding flow **helps the customer establish or connect a
consumer-controlled pod** (from a pod provider or the surrounding ecosystem) and then issues the DBX-13
connection credential to it — it does **not** substitute an org-controlled account for the pod.

## Alternatives considered

- **Org-hosted portal / no-vault access (the earlier draft of this ADR).** Rejected: an org-operated
  portal as the access path re-centralises control and evidence-holding in the organisation, contradicting
  the consumer-controlled-pod requirement and the Databox's reason for existing. A portal MAY exist only as
  a convenience *over* the standard Solid surface, never as the sole or primary access path, and never
  holding a consumer key.
- **Organisation-minted identity (org generates and holds a WebID + key per customer).** Rejected: the org
  would hold the customer's key and could impersonate them, with correlation and lock-in — violating
  ADR-0004/S-06 and invariant 4. Not adopted.

## Consequences

- **Positive:** genuine consumer control and portability for every customer; strong alignment with the
  existing consumer-agent design (DBX-24), the holder-key credential (DBX-13) and notify-then-pull; **no
  change to committed DBX-10/11/14 code**; and it **removes** the org-portal component I had earlier flagged
  as new scope.
- **Negative / cost:** every customer needs a Solid-compatible pod, so the organisation's onboarding must
  include helping customers obtain/connect one — a real ecosystem dependency (pod availability), accepted as
  the cost of consumer sovereignty. Customers who cannot or will not run a pod cannot use the Databox as
  designed (by intent).
- **Privacy & threat notes:** the consumer-pod-only path closes the impersonation vector that an org portal
  or org-minted identity would open. Because one instance holds all of one org's customer boxes, provider-
  as-adversary threats (invariant 10, B4; T-30/T-34) are the org's own operators — customer↔customer
  isolation (B2), no-PII-in-URLs (invariant 2) and audited operator access remain mandatory.

## Failure behavior

An access attempt that is not through a consumer-controlled pod with a valid holder-key-bound credential is
denied through the full composed authorizer (fail closed). A configuration that persists an
org-controlled consumer key is a configuration error and MUST be refused.

## Open sub-questions / residual gates

- **Databox vs accessing pod — confirm the intended relationship.** This ADR assumes the design's
  separation: the **databox** is org-hosted (custodian, S-24) and the **consumer pod** is the separate,
  consumer-controlled agent that accesses it and retains copies (README: "The Databox is not the person's
  general-purpose wallet"). If instead the intent is that each customer's databox **is** a
  consumer-controlled Solid pod on the org instance (accessed directly as a pod), that is a variant to
  confirm — it changes who owns the box's WAC. Flagged for the product owner.
- **Pod provisioning/onboarding UX** (how a customer without a pod obtains one during onboarding) is a
  product/ecosystem design owned outside the core server prompts; DBX-24 (consumer agent) is the reference
  access client.
- **ADR-0004:** the pairwise consumer WebID is controlled by the customer's own pod from the start (there
  is no "unclaimed" portal phase). The earlier note added to ADR-0004 about an unclaimed→claimed lifecycle
  should be read in light of this correction.
- Human identity/privacy review of the consumer-pod access model remains open.
