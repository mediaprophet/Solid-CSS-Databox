<!--
ADR — Databox decision register (DBX-02). Cluster: exchange & evidence.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0021 — Encryption boundary (in transit, at rest, application-level)

- **Status:** Profile choice (with a Blocked sub-question for the provider-blind variant)
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security and legal-policy — key-custody and "provider must not read payloads" are joint security/legal decisions; the provider-blind variant needs a named security reviewer and a custodianship/legal determination before it can be finalised.
- **Sources adjudicated:** isolation-and-privacy.md Tenant controls + "provider must not read payloads" note; implementation-decisions.md governing boundary; S-24 (LWS storage controller). **This is a GAP not covered by R-01..R-14 — stated explicitly below.**
- **Consumed by / blocks prompts:** informs DBX-11 (tenant isolation), the deployment/ops profile, and any high-assurance program profile.
- **Relates to:** ADR-0002 (storage controller / custodian model — S-24), ADR-0016 (tenant isolation / per-tenant keys).

## Context

**This decision is a gap:** the recommended-decisions register R-01 through R-14 does not adjudicate the encryption boundary. isolation-and-privacy.md states two things that must be reconciled: (a) Tenant controls require "independent encryption and signing keys" per program and tenant-aware backup/restore; and (b) "Where the provider itself must not read payloads, use application-level encryption with keys controlled by the program principal and/or consumer." S-24 fixes the custodian reality: for an organisation-hosted Databox the **accountable organisation normally controls the storage** and is the custodian of the records it authored — the consumer is the protected assignee/rights-holder, not the storage controller. This tension — provider-as-custodian vs provider-blind — is the crux of the decision.

CSS 7.1.9 provides neither at-rest encryption nor application-level payload encryption (nothing in DBX-01 indicates otherwise); TLS termination is a deployment concern. Production key management, HSMs and encrypted backups are explicitly **deferred** for the hackathon (hackathon-profile.md). So this ADR sets the *boundary policy* and the profile knobs; the production key-management build is deferred.

## Decision

Three layers, decided separately:

1. **In transit — mandatory (Adopted).** All Databox traffic (deposit, retrieval, submission, receipt, notification, cursor feed, authorization/token exchange) MUST use TLS/HTTPS. No cleartext transport for any Databox operation. Real-time hints and outbound delivery are equally TLS-only, with the SSRF/endpoint controls of ADR-0011. This is not a profile choice; it is baseline.

2. **At rest — deployment/profile requirement with independent per-tenant keys (Profile choice, required to declare).** At-rest encryption of Databox storage, the evidence ledger (ADR-0019) and backups is a **deployment requirement each program profile MUST declare and validate**. Where enabled, keys MUST be **independent per program/tenant** (isolation-and-privacy.md Tenant controls; no platform-wide data-plane key — invariant, ties to ADR-0016), and backup/restore/deletion MUST be tenant-aware. A profile MAY set a minimum (e.g. at-rest encryption always on in production); the hackathon defers production encrypted backups (hackathon-profile.md) and MUST label that deferral in its README.

3. **Application-level payload encryption — PROFILE CHOICE, not the hackathon default (Adopted-with-scope).** Whether record payloads are encrypted at the application layer with **program-principal- and/or consumer-controlled keys** (such that infrastructure-level storage access does not yield plaintext) is a **per-program profile choice**. The **recommended default is: not required**, because under S-24 / ADR-0002 the organisation is normally the storage **controller and custodian** and must be able to read the payloads it authored (to review submissions, correct records, respond to correction requests, and meet its own accountability). Mandating provider-blind encryption by default would break the custodian model. Therefore:
   - **Default profiles:** application-level payload encryption is OPTIONAL; the organisation-as-custodian reads payloads it authored. At-rest encryption (§2) plus tenant isolation (ADR-0016) plus infrastructure controls (invariant 10) protect against the *infrastructure* threat.
   - **A high-assurance "provider-blind" profile MAY require** application-level payload encryption with keys held by the program principal and/or consumer, so the hosting provider cannot read payloads even with infrastructure access — for programs whose legal/risk posture demands it. This explicitly interacts with, and partially inverts, the custodian model (§Blocked sub-question).

4. **No field-level end-to-end consumer-only encryption in the hackathon (Adopted).** The hackathon MUST NOT implement per-field consumer-only end-to-end encryption; it would prevent the organisation custodian and the review/correction workflows the demo exercises, and production key management is deferred (hackathon-profile.md). This is out of scope for HAK-*.

## Alternatives considered

- **Mandate provider-blind application-level encryption for all programs by default.** Rejected as default: it contradicts S-24 / ADR-0002 (organisation is custodian and authored the records, and must read them for review, correction and accountability), breaks the correction/disposition workflows (exchange-and-evidence.md), and complicates lawful retention. Retained only as an opt-in high-assurance profile.
- **No at-rest encryption; rely on transport + access control.** Rejected: isolation-and-privacy.md and invariant 10 treat infrastructure access (DB, backups, support tooling) as a threat that RDF ACLs do not constrain; at-rest encryption with per-tenant keys is a required declarable control, not optional silence.
- **Per-field consumer-only E2E encryption in the hackathon.** Rejected (§4): incompatible with custodian review and with the deferred key-management scope.
- **One shared platform key for at-rest encryption.** Rejected: violates "independent encryption and signing keys" and "explicit denial of platform-wide data-plane credentials" (isolation-and-privacy.md Tenant controls); a shared key is a cross-tenant break waiting to happen.

## Consequences

- **Positive:** Clear, layered boundary: TLS always; at-rest with per-tenant keys as a declared requirement; application-level encryption available where risk demands it without forcing it on the custodian model. Preserves the organisation's ability to fulfil correction/accountability duties by default.
- **Negative / cost:** The provider-blind profile is genuinely at odds with custodian duties (correction, lawful retention, review) and needs a distinct governance/key-custody design — it is not a flag flip. Per-tenant key management, rotation and tenant-aware backup/restore are net-new operational build (deferred for hackathon).
- **Privacy & threat notes:** At-rest + per-tenant keys close the "use support or backup tooling to bypass tenant restrictions" threat (isolation-and-privacy.md threat cases) for stored data. Default (non-provider-blind) profiles leave the provider *able* to read payloads by design — acceptable under the custodian model but MUST be disclosed in the provider/subcontractor accountability record (isolation-and-privacy.md). Keys, key-history (ADR-0019) and status lists (ADR-0020) must themselves be program-local — never a cross-program correlator.

## Failure behavior

Fail closed:
- Any Databox operation attempted over non-TLS transport is refused.
- If a profile declares at-rest encryption but the storage backend cannot confirm it (or a per-tenant key is unavailable), the tenant does not serve — it does not silently fall back to unencrypted storage.
- In a provider-blind profile, if the program-principal/consumer key required to encrypt a deposit is unavailable, the deposit is rejected (never stored as plaintext under a provider key).
- Key rotation that cannot preserve access to prior-key-encrypted data fails the rotation rather than orphaning or re-exposing data.

## Open sub-questions / residual gates

- **Blocked (decision required) — the provider-blind variant.** Whether, and under what key-custody and governance model, a high-assurance provider-blind profile is offered cannot be finalised here. **Unblocking input:** a custodianship/legal determination (does provider-blind encryption remove the organisation's ability to meet its correction, retention and accountability duties, and if so how are those duties reassigned?) plus a security key-custody design. **Owner:** ADR-0002 (custodian model) supplies the custodianship determination; DBX-06/legal-policy workstream (R-12) supplies the legal side; a named security reviewer supplies the key-custody design. Until then the provider-blind profile is specified in principle but NOT adopted.
- The concrete **at-rest key management, rotation and tenant-aware backup** design is deferred for the hackathon (hackathon-profile.md) and owned by DBX-11 / the deployment-ops profile.
