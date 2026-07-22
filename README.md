# Solid Databox

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-43853d.svg)](package.json)
[![Solid](https://img.shields.io/badge/Built_on-Solid-7C4DFF.svg)](https://solidproject.org/)

**Live demo:** [Landing](https://mediaprophet.github.io/Solid-CSS-Databox/) ·
[Admin console](https://mediaprophet.github.io/Solid-CSS-Databox/admin/) ·
[Forge control panel](https://mediaprophet.github.io/Solid-CSS-Databox/forge/) ·
[Developer guide](databox/guide/README.md)

Solid Databox is an organisation-focused Linked Data exchange platform built by refactoring and extending
[Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) (CSS) 7.1.9.

It gives an organisation a governed, relationship-specific Solid data space for providing information to a person
and receiving deliberate, purpose-bound information from that person. The person connects through an independent
Solid Pod, vault, wallet or compatible personal knowledge environment of their choice.

Solid Databox is not an official upstream Community Solid Server distribution. It retains the modular CSS runtime,
Solid HTTP surface and Components.js composition while adding the Databox identity, policy, evidence, exchange and
organisation-tailoring layers in this repository.

It is the **organisation-side reference implementation** of the
[Solid-Databox specification](https://github.com/mediaprophet/solid-databox) — the vocabulary, protocol and
deployment kit, together with the person-side consumer agent (Seraphim), live in that project.

## The model

A Databox is technically a Solid Pod, but it represents the organisation's governed view of one relationship. It is
not presented as the consumer's general-purpose Pod and does not give the organisation access to the consumer's
independent storage.

```mermaid
flowchart LR
    SOR["Organisation systems of record"] --> BRIDGE["Institutional bridge"]
    BRIDGE --> BOX["Organisation-hosted relationship Databox"]
    BOX <--> APP["Consumer-selected application"]
    APP <--> POD["Independent consumer Pod or vault"]
    BOX --> REVIEW["Human review and correction workflow"]
    BOX --> PROVIDER["Purpose-bound recipient or service provider"]
```

The organisation can provide records, credentials, notices, receipts, menus, vouchers and service information. The
consumer can explicitly return corrections, claims, preferences, evidence, orders or selected personal facts. Each
accepted exchange produces auditable state and, where applicable, a signed receipt that can be retained outside the
organisation's system.

## What it does

### Relationship-specific Solid data spaces

- Provisions opaque, program-scoped Databox URLs without customer identifiers in paths.
- Creates separate security boundaries for each organisation program and consumer relationship.
- Uses the normal CSS Solid HTTP, LDP, Solid-OIDC and WAC processing path.
- Supports connection credentials that are holder-bound, program-specific, revocable and rotatable.
- Prevents a Databox connection from becoming authority to browse the consumer's independent Pod.

### Two-way governed data exchange

- Transforms organisation source events into signed institutional records.
- Commits exact accepted bytes before issuing an acceptance receipt.
- Accepts deliberate consumer submissions without granting the organisation general Pod-reading rights.
- Preserves append-only evidence, supersession links, correction history and disposition state.
- Supports notifications, recovery feeds, idempotency and reconciliation boundaries.

### Policy, assurance and evidence

- Applies record-class, purpose, legal-basis and authentication-assurance checks.
- Carries versioned ODRL permissions, prohibitions and duties with exchanged records.
- Records signed receipts, evidence-chain events and visible duty outcomes.
- Provides governed review and signed disposition workflows for corrections and contested records.
- Fails closed when required identity, tenant, policy, proof or evidence inputs cannot be verified.

### Mapping Forge and organisation tailoring

- Registers and validates versioned institution profiles.
- Maps protected source-system customer references to opaque Databox relationships.
- Defines a backplane for industry packs, organisation manifests, program blueprints and immutable releases.
- Separates private Databox data from optional public-presence tooling such as website Schema.org/JSON-LD and
  business-listing reconciliation.
- Provides planning and synthetic fixtures for welfare coordination, restaurants, loyalty programs, donations,
  budgeting, resource pools and inter-organisational claims.

### CMS module system

The Databox CMS (`src/databox/cms/`) is a dynamic module system with **50+ built-in industry modules**, each with
capability declarations, route management, and enable/disable toggles. Modules are organised into industry verticals
(restaurant, welfare, retail, loyalty, print, trade) and can be tailored per organisation profile. The CMS HTTP
handler serves module APIs, an admin panel, and Oxigraph-backed synchronisation.

| Group | Modules |
|---|---|
| Commerce & retail | POS (cart, cash register, customer ordering, table sessions, promotions, tickets, native device contract), menu, catalogue, pricing, discounts, loyalty, barcode, EFTPOS, payments (refunds, splits, subscriptions) |
| Food & health safety | Allergy profile (allergen matching, ingredient declarations), concessions, emergency break-glass, consent, delegation, device auth |
| Operations & logistics | Delivery (driver dispatch, driver management), inventory, bookings, jobs, events, feeds, print shop, quotations |
| Governance & identity | Governance (role bindings, ODRL policy management, resolution), credentials (W3C VC issuance/verification/revocation), access, consumer rights, provenance, reputation, licensing, org network |
| Infrastructure & integration | Hosting (Cloudflare DNS/tunnel), integration (ODBC/LDAP connectors, R2RML), backups, accounting bridge, tax engine, notifications, i18n, a11y, theming |
| Web & social | Website (customer display renderer, public feed renderer, SEO, sitemap/robots), social, business, HR, household, records, receipt, ticketing, MCP |

### Compliance decision support

The compliance workstream maps pinned legislation and human-rights sources to technical controls, evidence and
consumer-facing information obligations. It is decision support: it does not self-certify that an organisation or
deployment is legally compliant. Applicability, exceptions and publication claims remain subject to qualified human
review.

### Native and Rust components

The Databox ecosystem includes native components for hardware integration, system management, and connector bridging:

- **POS Edge** (`native/pos-edge/`) — Rust native POS edge with ESC/POS thermal printer support, cash drawer control,
  QR code generation, local HTTP server, IPC, and hardware abstraction.
- **Installer** (`native/installer/`) — Cross-platform installer with macOS launchd service registration,
  platform-aware Node.js binary provisioning, pre-flight checks, and deployment handoff.
- **POS Edge Proxy** (`rust/pos-edge-proxy/`) — Proxy layer for POS edge communication.
- **Tray Supervisor** (`rust/tray-supervisor/`) — System tray supervisor for desktop lifecycle management.
- **Connector Sidecar** (`rust/connector-sidecar/`) — Connector sidecar for CMS integration with ODBC/LDAP bridging
  and RDF mapping.

### Org mobile apps

A unified WASM/PWA container (`org-mobile-apps/`) fetches its identity, features, and permissions from the CMS at
runtime based on the org's vertical profile and the app's purpose. Instead of building separate apps per purpose, one
container dynamically loads UI component bundles from the CMS. Six app profiles are defined: waiter, driver, tradie,
print, scorekeeper, and referee. Each app install receives a Verifiable Credential licence binding app, organisation,
device, scope, and permissions. Network scope (local-only vs remote-capable) is enforced via service worker.

A full survey of produced functionality versus documented coverage is in the
[functionality audit](databox/functionality-audit.md).

## Demonstrator journeys

### Seraphim and Charles James

The welfare demonstrator models Seraphim, a synthetic homelessness registration and coordination service, and
Charles James, a synthetic participant using an independent Flutter-based Solid application. The planned journey
includes:

- correction of a false and potentially defamatory organisational assertion with file or URI evidence;
- residency, concession, disability-support, health-needs and voucher credentials;
- goals, stages, dependencies, diary entries, events and completed or outstanding tasks;
- consent-scoped referrals and coordinated communications with service providers;
- privacy-shielded donations and aggregate donor reporting;
- consumer budgeting, receipt evidence and organisation/service economic reporting; and
- pairwise voucher redemption and claims between participating Databox organisations.

All people, credentials, organisations, entitlements, keys and transactions used by the demonstrator are synthetic.
Imported provider-directory rows remain unverified until reviewed.

### Restaurant menu and ordering

The restaurant journey demonstrates an organisation publishing a menu into a consumer's selected Solid environment.
The consumer creates an order locally and shares only the selected order and relevant dietary information back to
the organisation. The acknowledgement, status events and receipt can then be retained by the consumer.

## Live CSS integration

The experimental live preset mounts the Mapping Forge inside the CSS Components.js composition. Provisioned Databox
resources are stored in CSS and retrieved through the ordinary Solid authorization route.

Build the project:

```shell
npm install
npm run build
```

Start the memory-backed live demonstration with a control token containing at least 32 bytes:

```powershell
$token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
npm.cmd run start:databox-live -- --databoxControlToken $token --baseUrl http://localhost:3000/ --port 3000
```

The protected demonstration control plane is mounted at `/.databox/forge`:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/.databox/forge/programs` | List registered program summaries |
| `POST` | `/.databox/forge/programs` | Register a validated institution profile |
| `POST` | `/.databox/forge/mappings` | Provision a relationship and issue its connection credential |
| `POST` | `/.databox/forge/source-events` | Transform and commit an institutional event and issue its receipt |

See the [live CSS integration guide](databox/live-css-integration.md) for operation, verification and current
limitations.

### Operator consoles

Two operator front-ends drive this control plane:

- **Forge Admin console** — a Refine / React single-page app under [`forge-admin/`](forge-admin/README.md) for
  onboarding programs, provisioning relationship mappings, dispatching events, declaring an organisation's
  information-provision obligations against an ANZSIC-tailored, AU / multi-jurisdiction / standards (DPV · GDPR ·
  ODRL) taxonomy, running a data-portability registry, and handling inbound access and correction requests. It runs
  against the live Forge API, or fully in-memory (`VITE_DEMO=true`) as a backendless demo — the latter is published
  at [`/admin/`](https://mediaprophet.github.io/Solid-CSS-Databox/admin/).
- **Embedded `/forge` UI** — a minimal, dependency-free Programs / Mappings / Events console the running server
  serves at `/forge` (generated by [`scripts/build-forge-ui.js`](scripts/build-forge-ui.js)); also published at
  [`/forge/`](https://mediaprophet.github.io/Solid-CSS-Databox/forge/).

## Repository guide

| Location | Contents |
|---|---|
| [`src/databox/`](src/databox/) | Databox identity, provisioning, policy, bridge, evidence, review and Forge code |
| [`src/databox/cms/`](src/databox/cms/) | CMS HTTP handler, 50+ industry modules, vertical profiles, Oxigraph sync |
| [`config/databox/`](config/databox/) | Experimental live Components.js configuration |
| [`databox/`](databox/) | Architecture, decisions, threat model, vocabulary, fixtures and implementation plans |
| [`databox/forge-plan/`](databox/forge-plan/) | Product backplane, application and demonstrator plans |
| [`databox/functionality-audit.md`](databox/functionality-audit.md) | Functionality audit: produced features vs documented coverage |
| [`forge-admin/`](forge-admin/README.md) | Refine/React Forge Admin console — the operator control plane |
| [`org-mobile-apps/`](org-mobile-apps/README.md) | WASM/PWA mobile app container with 6 app profiles |
| [`native/`](native/) | Rust native POS edge and cross-platform installer |
| [`rust/`](rust/) | Rust connector sidecar, POS edge proxy, and tray supervisor |
| [`databox/deployment/cms/`](databox/deployment/cms/) | Docker Compose, Kubernetes, and secret templates for CMS deployment |
| [`test/unit/databox/`](test/unit/databox/) | 188 Databox unit and security-invariant tests across 24 subsystems |
| [`test/integration/`](test/integration/) | 6 Databox integration tests including live CSS/OIDC/WAC |

Start with the [Databox documentation index](databox/README.md), then read the
[reference architecture](databox/dbx-04-reference-architecture.md),
[decision register](databox/decisions/README.md), [threat model](databox/dbx-03-threat-model.md) and
[Forge productization plan](databox/forge-plan/README.md).

## Security and privacy principles

1. A Databox belongs to one declared organisation program and one represented relationship.
2. URLs, logs and storage paths must not contain directly identifying customer information.
3. Knowing a resource URL never grants access.
4. Organisation credentials cannot authorize browsing of a consumer's independent Pod.
5. Consumer submissions are explicit disclosures, not background reads from personal storage.
6. Accepted institutional records are not silently overwritten; changes remain linked and auditable.
7. Record sensitivity is evaluated against current verified assurance, purpose and policy.
8. Hosting-provider administration is treated as a security boundary, not implicitly trusted access.
9. Public-presence tools must remain isolated from customer mappings and private Databox records.
10. Legal or interoperability claims require named review and executable evidence; the software does not
    self-certify them.

## Implementation status

DBX-01 through DBX-24 of the reference implementation plan are complete. The instrumental DBX-25 live CSS slice is
also implemented: it provisions private WAC-protected resources, commits accepted bytes into CSS before receipt
issuance, denies anonymous retrieval and permits authenticated holder retrieval with a DPoP-bound CSS identity.

The broader DBX-25 two-program lifecycle suite remains active. DBX-26 adversarial assurance, DBX-27 independent
Solid interoperability assessment and DBX-28 release readiness are not yet complete.

This remains a reference and demonstrator implementation. Current production gaps include durable Forge registries,
KMS-managed keys, durable outbox/feed/idempotency storage, a WORM or equivalently protected evidence substrate,
production organisation IAM, independent security review, legal-policy review and external interoperability evidence.

## Testing and deployment

### Test coverage

The Databox extension is fail-closed and unit-tested across all 24 subsystems:

- **188 unit test files** under `test/unit/databox/` covering agent, authorization, bridge, CMS (99 tests), compliance,
  context, credential, evidence, feed, gateway, identifiers, notification, ODRL, policy, profile, proof, provisioning,
  receipt, review, storage, and tenant.
- **6 integration tests** including live CSS/OIDC/WAC (`DataboxLive.test.ts`), CMS handler, CMS accessibility, Oxigraph
  sync, vanilla mode, and vertical profiles.
- **Fail-closed stubs** verified by a dedicated test — no stub silently permits access or claims conformance.

### Deployment

- **Docker Compose** — CMS deployment via `databox/deployment/cms/docker-compose.cms.yml` with environment configuration.
- **Kubernetes** — manifests under `databox/deployment/cms/kubernetes/` for production CMS deployment.
- **Secret management** — templates under `databox/deployment/cms/secrets/`.
- **Live CSS preset** — experimental Components.js preset under `config/databox/` for mounting the Forge inside a
  running CSS instance.
- **Native installer** — cross-platform installer for macOS with launchd service registration.

See the [CMS deployment guide](databox/deployment/cms/README.md) for details.

## Relationship to Community Solid Server

The repository began with Community Solid Server and continues to use substantial upstream CSS code and architecture.
Keeping that lineage visible matters technically and legally: CSS provides the modular HTTP server, Solid protocol
handling, identity integration, storage layers and Components.js runtime on which the Databox implementation builds.

Upstream CSS documentation remains useful for its underlying server and configuration model:

- [Community Solid Server repository](https://github.com/CommunitySolidServer/CommunitySolidServer)
- [Community Solid Server documentation](https://communitysolidserver.github.io/CommunitySolidServer/)
- [Solid specifications](https://solidproject.org/TR/)

The existing package name and Components.js identifiers are retained for CSS compatibility while the derivative is
being refactored. They should not be interpreted as an assertion that this Databox branch is an official upstream CSS
release.

## Copyright, attribution and license

The original Community Solid Server code retains its copyright attribution to Inrupt Inc. and imec.

The Databox-specific design, implementation, documentation, vocabularies, fixtures and refactoring are attributed to:

### Timothy Charles Holborn

[LinkedIn](https://www.linkedin.com/in/ubiquitous/) · [timothy.holborn@gmail.com](mailto:timothy.holborn@gmail.com)

The repository is distributed under the [MIT License](LICENSE.md). The license file preserves the original CSS
copyright notice and separately records the Databox copyright holder. Third-party dependencies, standards,
legislation and imported datasets retain their own copyright, licensing and legal status.

## Contact

For Databox design and implementation enquiries, contact Timothy Charles Holborn through
[LinkedIn](https://www.linkedin.com/in/ubiquitous/) or
[timothy.holborn@gmail.com](mailto:timothy.holborn@gmail.com).
