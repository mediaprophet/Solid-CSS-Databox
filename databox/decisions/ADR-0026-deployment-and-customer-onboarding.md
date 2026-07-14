# ADR-0026 — Single-organisation deployment and customer onboarding model

- **Status:** Adopted (two-tier deferred-vault onboarding; vault-required is a per-program Profile choice)
- **Date:** 2026-07-15
- **Decision owner:** DBX-02 lead (Hard), on a clarification from the product owner
- **Residual human review required:** identity, privacy — the Tier-1 access model and the "never persist an org-controlled consumer key" rule must pass human identity/privacy review before production.
- **Sources adjudicated:** product-owner clarification (one organisation installs one instance for its many customers); reconciles ADR-0002 (topology/tenancy), ADR-0004 (pairwise consumer-controlled identity), ADR-0013 (connection credential), ADR-0016 (relationship mapping); DBX-01 §5 (CSS multi-pod).
- **Consumed by / blocks prompts:** DBX-13 (credential issuance timing), DBX-24 (consumer agent = the vault tier), and a NEW consumer-portal prompt (see §residual). Informs DBX-10/DBX-11 (already consistent — no change required).
- **Relates to:** ADR-0002, ADR-0004, ADR-0013, ADR-0016, ADR-0021.

## Context

The design documents illustrate isolation mainly from the **consumer's** perspective — one person's
wallet aggregating Woolworths, Coles, ANU and Agency Databoxes (README "Security boundary") — which
emphasises the **multi-organisation** boundary. The primary intended **deployment**, however, is the
**organisation's** perspective: **one organisation installs one instance of the Databox platform and
serves many of its own customers from it** — one Databox box per customer relationship. This requires the
CSS multi-pod environment (many boxes in one instance), not a separate instance per customer.

Two facts make this straightforward rather than a redesign:

1. The committed code already implements per-customer multiplicity. **DBX-10** provisions one opaque
   `/boxes/{opaque-id}/` **per customer** via the mapping `customerID → opaque relationship → opaque box →
   pairwise WebID`; **DBX-11** treats the **tenant as `(organisation, program)`** with **customers as
   boxes within it** (not one-tenant-per-customer); **DBX-14**'s relationship conjunct isolates customer A
   from customer B; per-box WAC + opaque identifiers close enumeration (T-06) and cross-customer read
   (boundary B2). CSS's `ConfigPodManager`/`GeneratedPodManager` provide the storage multiplicity.
2. The multi-organisation / shared-provider tenancy (ADR-0002) is the **outer ring**, exercised only when
   one instance hosts several programs or several organisations. For a single-organisation, single-program
   install it collapses to one tenant — no waste, and the isolation doing the heavy lifting is the
   per-customer relationship + WAC + opaque-identifier layer, not program-tenancy.

The genuine open question the clarification surfaces is **onboarding**: an organisation onboarding its
**entire existing customer base** cannot require every customer to run a Solid vault on day one, yet the
identity model (ADR-0004/0013) assumes a **consumer-controlled** vault holding the pairwise WebID + holder
key. This ADR resolves that bootstrapping gap.

## Decision

### Deployment

The **primary deployment unit is one organisation, one installed instance, many customer boxes.** The
tenant is `(organisation, program)`; each customer relationship is an opaque box within it; the CSS
multi-pod backend hosts them. Multi-program and shared-provider multi-organisation tenancy remain the
supported outer ring (ADR-0002/DBX-11) and are **not required** for the single-organisation case. Because
the organisation is the storage controller/custodian of **all** its customers' boxes (S-24/ADR-0002), the
isolation that matters within one instance is **customer↔customer** (boundary B2) plus **operator-audited
access** (invariant 10) — not program-tenancy.

### Onboarding — two-tier deferred-vault (Adopted)

- **Tier 1 — portal (no vault):** the box is provisioned immediately (DBX-10; no vault needed). The
  customer accesses it through an **organisation-hosted portal**, authenticated by their **existing
  organisation account/IdP**. The composed authorizer resolves "this authenticated customer → this box"
  through the relationship mapping (DBX-16/DBX-14 relationship conjunct — which does **not** require a
  holder key). Records, submissions and signed receipts exist and are independently verifiable. The box's
  pairwise WebID is **unclaimed**.
- **Tier 2 — vault (claimed):** whenever the customer chooses, they connect a Solid vault, prove a **fresh
  holder key they control**, and the DBX-13 connection credential binds to **their** key. From that point
  they have portable, holder-key-bound, independently-retained control ("claim your box").

**Load-bearing rule:** the organisation **MUST NOT persist an organisation-controlled consumer key**.
Tier-1 access is a session over the organisation's own authentication of its customer; there is **no
org-held key that can impersonate the customer**. Holder-key control only ever derives from a key the
customer brings (Tier 2). This keeps invariant 4 honest: the connection credential **does not exist until
there is a real holder key to bind** — so the DBX-13 credential is issued at **vault-connect time, not at
provisioning time.**

**Per-program Profile choice:** a program MAY set **vault-required** (skip Tier 1) for a high-assurance
relationship where custodial portal access is unacceptable; the default is two-tier.

## Alternatives considered

- **Organisation-minted identity (org generates and holds a WebID + key per customer).** Rejected as the
  default: the organisation would hold the customer's key and could impersonate them, with correlation and
  lock-in — collapsing the Databox into "a customer database with RDF" and violating ADR-0004/S-06 ("do
  not silently mint an organisation-controlled identity") and invariant 4. Admissible only as an
  explicitly labelled downgrade with named safeguards; not adopted.
- **Vault-required for everyone.** Rejected as the **sole** path: it strands the organisation's existing
  customer base (most customers have no vault) and makes mass onboarding impractical. Retained as an
  opt-in per-program Profile choice for high-assurance programs.

## Consequences

- **Positive:** zero-friction mass onboarding; consumer cryptographic control is available (opt-in) without
  being mandatory; matches the org-as-custodian model; **no change required to the committed DBX-10/11/14
  code** (it already supports both tiers because the relationship path does not mandate a holder key).
- **Negative / cost:** a **consumer portal** (organisation-facing UI) is **new scope** not in the current
  DBX-01…28 plan (§residual). Tier-1 customers get custodial access and verifiable evidence but **not** the
  cryptographic independence the vault gives — this two-tier reality **MUST** be disclosed in UI and docs
  and never misrepresented as full consumer control.
- **Privacy & threat notes:** because one instance holds **all** of one organisation's customers, the
  provider-as-adversary threats (invariant 10, B4; T-30/T-34) are the organisation's **own** operators —
  the custodian model (S-24) makes org access to authored payloads legitimate, but customer↔customer
  isolation (B2), no-PII-in-URLs (invariant 2) and audited operator access remain mandatory. The
  no-org-held-key rule closes the impersonation vector the org-minted-identity alternative would open.

## Failure behavior

Portal (Tier-1) access still fails closed through the full composed authorizer (tenant ∧ relationship ∧
assurance ∧ …) — the portal is a client, not a bypass. An organisation-held persistent consumer key is a
configuration error and MUST be refused. A vault-required program that receives a portal-only access
attempt denies it.

## Open sub-questions / residual gates

- **New scope:** the consumer portal is not a numbered DBX prompt. Recommend adding one (e.g. "DBX-29 —
  organisation-hosted consumer portal (Tier-1 access)") with its own security/privacy review, or folding a
  minimal portal into the demonstration track.
- **ADR-0004 note:** the pairwise consumer WebID is **unclaimed** in Tier 1 and **claimed** (holder-key
  bound) in Tier 2 — ADR-0004 should reference this ADR for the lifecycle of an as-yet-unclaimed pairwise
  identifier.
- **ADR-0013 note:** connection-credential issuance is **at vault-connect**, not at provisioning — ADR-0013
  should reference this timing.
- The **vault-required threshold** per program (which assurance grade forces Tier 2) is a Profile choice
  owned by DBX-06's schema (add a `onboardingModel: two-tier | vault-required` field).
- Human identity/privacy review of the Tier-1 model remains open.
