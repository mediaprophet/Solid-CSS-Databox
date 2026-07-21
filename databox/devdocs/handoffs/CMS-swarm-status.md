# CMS Swarm Status

Branch: `databox/cms-plan`

## Current checkpoint

The Claude swarm work produced a broad horizontal CMS/domain library: entity, governance, VC, consent,
consumer-rights, commerce, receipts, refund/tax/discount, bookings, events, ticketing, delivery, records,
provenance, profiles, delegation, break-glass, SEO, i18n, accessibility, household, org hierarchy, stock,
loyalty, opening hours, and related units.

The integration work now underway should be judged against the actual CMS plan, not only against unit-test
coverage. The remaining high-value work is the composition/integration layer:

- durable module state/config as Solid RDF resources;
- CSS-enhanced control-plane contracts with standard-Solid degradation;
- portable RDF "works" export/import;
- Oxigraph/SPARQL storage profile and migration proof;
- vertical bundles composed from the horizontal modules;
- website renderer, connector/broker, hosting/deployment, and native-edge work.

## Portability correction

The data-layer model is: internal Solid pods are canonical; storage engines are swappable underneath. File
storage is the simple default. Oxigraph is the reference Rust/SPARQL target, with CSS still writing through
LDP/WAC and Oxigraph used as a hydrated, rebuildable query environment. The CMS must not depend on CSS-private
state for user-owned operating logic.

Implemented in this checkpoint:

- `SparqlDataAccessor` supports an optional split SPARQL Update endpoint.
- New opt-in SPARQL presets support single-endpoint and Oxigraph-style split query/update backends.
- `CmsHttpHandler` can use `ModuleConfigStore` so module enabled/config state is persisted as RDF through
  `ResourceStore`.
- `GET /.databox/cms/works` exports installed module manifests plus RDF state as a portable CMS works bundle.
- `POST /.databox/cms/works/import` imports a works bundle into a fresh registry/config store and round-trips
  module manifests, enabled state, and Turtle state.
- `ModuleManifestRdf` serializes/parses module manifests as portable Turtle for standard-Solid discovery.
- The built-in receipt module exposes `POST /.databox/cms/receipt/build`, wrapping the pure receipt document/QR
  builder as a real CMS module route.
- `forge-admin` has a `VITE_PROVIDER_MODE=standard-solid` portable-core provider path that reads module manifests
  from ordinary Solid resources and explicitly disables CSS-enhanced operations.
- `VerticalProfile` defines portable declarative vertical bundle manifests composed from horizontal module ids,
  validates referenced modules, applies enabled/config RDF defaults through `ModuleConfigStore`, and ships the
  `food.restaurant` and `health.privacy-consent` lighthouse bundles.
- Portable CMS works export/import can carry vertical profiles and publish/discover them as standard Solid RDF
  resources via the CMS Type Index.
- `test/integration/DataboxCmsOxigraph.test.ts` provides a skipped-by-default live SPARQL/Oxigraph smoke harness
  for unified `/sparql` and split query/update endpoint shapes.
- `scripts/run-cms-oxigraph-smoke.mjs` and `databox/cms-oxigraph-smoke.md` make that live smoke runnable by a
  developer in both endpoint modes without adding Oxigraph to normal gates.
- `OxigraphCmsHydration` turns canonical Solid Turtle resources into deterministic SPARQL named-graph replacement
  updates and replays them through an executor abstraction. Unit coverage rebuilds an in-memory query environment
  from Solid resources and syncs a later Solid write without making Oxigraph canonical.
- `OxigraphCmsSync` adds a disabled-by-default live-sync hook for canonical Solid pod writes. It consumes
  `ResourceStore` write results or CSS activity notifications, reads the allowlisted Solid RDF resources after
  write, and replays bounded named-graph replacement updates through the hydration executor.
- `OxigraphCmsSyncComposition` wires that helper into an opt-in Components.js lifecycle owner with an explicit
  canonical RDF allowlist, startup hydration, notification subscription/finalizer ownership, and a SPARQL Update
  executor. The CMS Oxigraph presets no longer layer memory and SPARQL backends together.
- `CmsMigrationProof` demonstrates the no-lock-in loop: export from a file-backed CMS registry/config store,
  publish the works as ordinary Solid RDF resources, derive an Oxigraph hydration profile from those resources,
  and import the same Type Index-discovered resources back into vanilla Solid degradation mode.
- `scripts/run-cms-migration-proof.mjs` provides the optional live harness for file-backed CSS -> Oxigraph/SPARQL
  CSS -> vanilla Solid-readable migration proof, with dry-run plans and honest skip behavior when live endpoints
  are unavailable.
- `ConnectorContract` defines the enterprise ODBC/LDAP connector manifest and job contract as portable
  RDF/config: mappings are R2RML/RML Turtle works, jobs explicitly choose import snapshot, one-way
  source-to-pod sync, or virtual/federated query, and runtime sidecars stay replaceable.
- `ConnectorRuntimePlan` now describes sidecar runtime/import execution: secret references, one-time import
  commands, live-sync provenance/conflict placeholders, virtual query mode, and an explicit separation between
  LDAP directory import and auth federation.
- Portable CMS works export/import can now carry connector manifest/job descriptor resources through the same
  standard-Solid Type Index projection. Connector sidecar engines, hardware hints, and secret references remain
  non-portable runtime work and are excluded from portable manifests.
- `Menu` and `PublicFeedRenderer` now have built-in CMS module manifests. `CmsHttpHandler` exposes protected
  `POST /.databox/cms/menu/build` and `POST /.databox/cms/website/preview` routes; the website preview renders
  public HTML/JSON-LD from ordinary schema.org Turtle so public website/SEO output degrades without CSS-private
  routes.
- `scripts/run-cms-oxigraph-smoke.mjs` now supports dry-run planning and an optional
  `test:cms:oxigraph:optional` gate that skips cleanly until a real endpoint or launcher is configured.
- `CashRegister` models portable register open/close sessions, expected/counted cash, drawer/printer device
  bindings, digest-only offline queue descriptors, WebID-bound native jobs, and audit receipts without depending
  on real hardware.
- `CustomerOrdering` models waiter-created and customer self-order bundles using canonical cart/order/ticket
  resources, plus shop Wi-Fi QR onboarding and optional customer Solid vault connection descriptors.
- `CustomerDisplayRenderer` now emits a timed presentation playlist suitable for Slidy/Reveal-style displays with
  transaction, app-install, Solid-vault-connect, loyalty, receipt/QR, self-order, and advertising slides driven
  by portable Solid/RDF state.
- `PosOrderStore` persists a built POS ordering flow's canonical cart/order/ticket/onboarding records as ordinary
  Solid resources through `ResourceStore` (rejecting out-of-pod IRIs; fragment nodes travel inside their parent).
  `CmsHttpHandler` exposes protected `POST /.databox/cms/pos/orders` (build waiter/customer-self-order flow and
  persist) and `GET /.databox/cms/pos/orders?iri=` (read-back). The `DataboxCms` integration test creates a
  waiter order and then reads the canonical order resource back both through the control plane and — proving the
  standard-Solid degradation — through a plain unauthenticated LDP `GET` as Turtle. The `pos.ordering` module
  manifest now declares these CSS-enhanced routes alongside its portable-core contracts.

Still required before claiming the Oxigraph path complete:

- run the live Oxigraph-backed CSS profile smoke harness against an actual Oxigraph endpoint;
- run a real network hydration through `OxigraphCmsSyncComposition` against that endpoint;
- run the migration proof against a live file-backed CSS pod and a live Oxigraph-backed profile, not only the
  deterministic in-memory proof or optional skipped harness.

Still required before claiming the POS/public-shop path complete:

- package the Rust/native POS edge app or WASM surface and bind it to the new cash-register/device/order/display
  contracts;
- implement actual mTLS/WebID-TLS listener verification, thermal printer/cash drawer I/O, QR bitmap rendering,
  and durable offline replay;
- extend the POS `ResourceStore` write routes beyond cart/order/ticket/onboarding to register/close-session and
  customer-display state, and add shop Wi-Fi/table-session native-edge handling (the waiter/customer ordering
  cart/order/ticket write path now lands through `PosOrderStore` and round-trips as canonical RDF);
- exercise customer-display playlist updates through live Solid notifications and real/native display hardware.

## Verification expectation

Run the CMS unit suite, SPARQL accessor unit tests, root build, CMS integration tests, and forge-admin build/lint
after each integration batch. A live Oxigraph verification should be added once the Rust native-edge or local
Oxigraph server is available in the development environment.
