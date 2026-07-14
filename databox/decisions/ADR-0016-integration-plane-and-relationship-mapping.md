# ADR-0016 — Institutional integration plane and relationship mapping

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** security — the protected mapping registry and the control/data-plane split are the core PII-isolation and tenant-isolation boundary; security sign-off required before a production deployment. privacy — the customerID→opaque mapping is the pseudonymisation boundary.
- **Sources adjudicated:** R-09 (integration plane); HD-08, HD-09, HD-10, HD-11 (mapping side), HD-12, HD-13, HD-16; architecture.md (Control plane and data plane; Institutional integration plane).
- **Consumed by / blocks prompts:** DBX-10 (opaque box identifiers / provisioning inputs), DBX-22 (integration/connector build), DBX-23 (submission intake + correction connector), HAK-06 (mapping + credential issuance), HAK-07 (bridge deposit).
- **Relates to:** ADR-0017 (exchange/sharing — the data-plane side of the same bridge), ADR-0018 (control-plane service identity), ADR-0011 (institutional record signing/evidence), ADR-0023 (correction connector into source systems).

## Context

An organisation's systems of record are keyed by a raw internal `customerID`. The Databox is keyed by an opaque box identifier that, by invariant 2, "URLs, logs and storage paths contain no directly identifying customer information," and by invariant 5, a Databox connection is not permission to browse personal storage. Something must translate between the institutional key-space and the opaque Databox key-space **without letting the raw key leak into the Solid surface**, and it must do so under a control-plane discipline that never rides an ordinary consumer token.

R-09 defines a separately deployable integration plane that owns exactly this. The HD set fixes the hackathon-binding specifics: the typed institutional key (HD-09), the authoritative mapping registry (HD-10), the customer-linking proof (HD-11), the source outbox + namespaced idempotency key (HD-12), and the per-bridge service authority (HD-13).

CSS 7.1.9 reality (DBX-01 §5): CSS has **no tenant/multi-realm concept** — the OIDC provider, signing JWK and account storage are server-wide; only path-level storage isolation pre-exists. Pod identifiers are name/slug-derived, not random (DBX-01 §5). So the mapping registry, the opaque-identifier generation, the transactional outbox, and the per-tenant boundary are all net-new and MUST live in a service *outside* the public CSS resource path — which is exactly the control/data-plane split architecture.md mandates ("the control plane … never acts through an ordinary consumer token").

## Decision

**A separately deployable control-plane integration service owns the protected mapping.** It MAY be co-deployed beside CSS (e.g. in the hackathon `docker-compose`, HD-08) but MUST remain independently deployable as an enterprise gateway, and its mapping database and business workflows MUST NOT run inside the public Solid request path.

**The authoritative mapping is a protected, typed chain (HD-09/HD-10):**

```text
organisation / program / source-system / customerID-namespace / customerID
        ──▶ opaque relationship ID ──▶ opaque Databox ID ──▶ pairwise WebID
```

- The typed institutional key is the input; the raw `customerID` is the stable internal primary key of the source system.
- **The raw customerID MUST NEVER enter** a Databox URI, connection credential, notification, vault record, or cross-tenant log (HD-09, invariant 2). It stays inside the integration plane.
- The mapping registry is **authoritative**. An identity credential (Entra Verified ID or similar) MAY supply supporting linking *evidence* but MUST NOT replace the registry (HD-10).
- Opaque relationship/Databox identifiers are cryptographically random (≥128 bits, architecture.md; DBX-01 §5 requires a new `IdentifierGenerator`), never a name/number or unkeyed hash of one.

**Customer linking is proven, not assumed (HD-11).** Assurance level alone never selects a customer record. Activation of a mapping combines: (1) a validated external authentication event + its assurance; (2) program-specific claims or an explicit account-linking challenge sufficient to resolve **exactly one** source customer record; (3) vault proof of the pairwise holder key; and (4) an audited confirmation before the mapping becomes active. Ambiguous, duplicate or already-bound matches **fail closed** into a governed review path.

**Source consumption is transactional (HD-12).** Source systems commit the business event and a **source outbox** entry in the same transaction. The bridge drains the outbox and deposits into the resolved Databox.

- The idempotency key is the **namespaced source-event tuple** `organisation/program/source-system/event-type/source-event-id`. It is stable across retries — a retry reuses the same key and MUST NOT mint a per-attempt key. The external representation MAY be a tenant-keyed HMAC of the tuple where exposing it would reveal internal system information; the acceptance receipt echoes the key and the assigned record (HD-12).

**Institutional records are signed (R-09).** The bridge produces a canonical payload with issuer/subject/provenance/legal-basis/record-class, attaches the applicable versioned ODRL policy (ADR-0013/0014), and signs it (or wraps it as a VC) before deposit; the deposit produces a signed acceptance receipt and source-to-Databox evidence (ADR-0011).

**Per-bridge service authority is least-privilege (HD-13).** Each bridge authenticates as **its own program-specific service agent** (a distinct stable HTTPS service identity, ADR-0018). WAC permits it to **append only** to the record containers assigned to that service. Databox validation additionally requires matching program, relationship, record class, source-event identity and issuer signature. A bridge has **no consumer-vault access** and **no cross-program role**.

**Control plane never rides a consumer token (architecture.md).** Provisioning, customer matching, key rotation, relationship suspension and lawful deletion are control-plane operations; they MUST NOT be performed through an ordinary consumer access token, and the control plane and data plane MUST NOT share an unrestricted public API.

## Alternatives considered

- **Map customerID→box with a keyed/unkeyed hash and skip the registry** — rejected. A hash is not authoritative (collisions, no lifecycle, no review/ambiguity handling, no rebind), and an unkeyed hash of a customer number is itself identifying (invariant 2 forbids it). HD-10 requires an authoritative registry; a credential/hash is at most supporting evidence.
- **Let the bridge use a shared platform service identity across programs** — rejected (HD-13, invariant program isolation). A cross-program identity is exactly the "global consumer identifier / platform-wide credential that bypasses program isolation" the README forbids. Each bridge is its own scoped service agent.
- **Per-retry idempotency keys** — rejected (HD-12). A fresh key per attempt defeats deduplication and can create duplicate logical records on retry. The key is per source event, stable across attempts.
- **Run the mapping/business logic inside the CSS resource path** — rejected (HD-08, architecture.md). That would place PII-bearing institutional logic on the public Solid surface and couple control-plane concerns to the data plane. The plane is separately deployable and outside the public request path.
- **Push deposits directly from the source system without an outbox** — rejected. Without a transactional outbox, a crash between the business commit and the deposit loses or duplicates records; the outbox gives exactly-once-effect with the stable idempotency key.

## Consequences

- **Positive:** raw customer identity is confined to one protected plane; the Solid surface stays PII-free and per-program isolated; deposits are exactly-once by idempotency key; each bridge is least-privileged and cannot cross programs or read vaults; control-plane power never travels on a consumer token.
- **Negative / cost:** a whole separately-deployable service with a mapping registry, outbox drain, signing, reconciliation and review workflow is net-new (nothing in CSS to reuse — DBX-01 §5/§6); per-program service identities and container-scoped WAC must be provisioned; the account-linking ceremony adds onboarding friction (deliberately, to avoid mis-linking).
- **Privacy & threat notes:** the mapping registry is the crown-jewel PII store — compromise re-links opaque boxes to customers, so it is control-plane-only, access-audited, and never reachable via the data plane. Fail-closed linking prevents cross-customer contamination. HMAC-wrapping the external idempotency key prevents leaking internal event/volume structure. Tenant isolation (ADR-0013 stage-1 invariant) is enforced here at the identity/authority layer, not just in policy.

## Failure behavior

Fail closed. Ambiguous/duplicate/already-bound customer match → mapping does not activate; enters governed review (HD-11). A deposit whose bridge identity, program, relationship, record class, source-event identity or issuer signature does not validate → rejected, no record created, audit-visible (HD-13). A source event without a resolvable mapping → not deposited into any box; quarantined for review, never guessed. A retry with a known idempotency key → returns the original outcome, never a second record (HD-12; exchange-and-evidence.md Atomicity). Any attempt to use a bridge identity across programs or to reach a consumer vault → denied. If the raw customerID would appear in a URI/credential/notification/log, the operation MUST fail rather than emit it.

## Open sub-questions / residual gates

- The mapping-registry storage engine is a **deployment choice** (HD-10 permits a durable JSON/SQLite-style store behind a repository interface for the hackathon; production may differ); this ADR fixes the *interface and invariants*, not the vendor.
- The opaque `IdentifierGenerator` implementation and its wiring are owned by **DBX-10** (DBX-01 §5: replace the generator, reuse `randomUUID`/`randomBytes`).
- The control-plane service-identity and key-rotation specifics are owned by **ADR-0018**; the correction connector into source systems is owned by **ADR-0023**/DBX-23.
- The account-linking challenge design (what program-specific claim resolves exactly one record) is a **profile choice** per program (architecture.md Program profile).
- No item here is Blocked: the integration plane and mapping are fully specified for their scope.
