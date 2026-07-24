# Swarm Progress Tracker

## Phase 0 — Foundations (ALL DONE)

| Task | Status | Notes |
|------|--------|-------|
| P0-01 CSPRNG fix | ✅ | `config.rs` uses `rand::rng().fill_bytes()`, `rand 0.9` |
| P0-02 Node.js provisioning | ✅ | `node.rs` — download, SHA-256, tar.xz/zip extraction |
| P0-03 App extraction | ✅ | `deploy.rs` — source + Rust binaries with checksum verify |
| P0-04 Crypto bootstrap | ✅ | `config.rs` — RSA keypair via Node, dir permissions |
| P0-05 Windows privilege check | ✅ | `preflight.rs` uses `net session` |
| P0-06 Installer timestamp | ✅ | `handoff.rs` uses `chrono::Utc::now()` |
| P0-07 ConnectorSidecar ESM | ✅ | `import.meta.url` check |
| P0-08 i18n infrastructure | ✅ | `i18n.ts` + `en.json` (238 keys) + `main.tsx` wired |
| P0-09 Accessibility baseline | ✅ | `eslint.config.js` jsx-a11y, `:focus-visible`, `.skip-to-content`, `aria-live` |

## Phase 1 — Cloudflare Hosting (ALL DONE)

All 7 tasks done: CloudflareApi, HostingApi (apply/persist/bind/artifacts), docker-compose.yml.

## Phase 2 — Entity & People (ALL DONE)

All 8 tasks done: governance, credentials, member pods, LDN inbox, member interaction, lifecycle, dynamic sidebar, @ts-nocheck removal.

## Phase 3 — Food Allergy / Ingredient System (ALL 7 DONE)

All 7 tasks complete: AllergyProfile, IngredientDeclaration, AllergenMatcher (with selective disclosure),
food.allergy-safety vertical profile, POS integration with FSANZ allergen categories.
5 API routes, 23 tests. 3 vertical profiles added.

## Phase 4 — Enterprise Connectors (ALL 5 DONE)

All 5 tasks complete: Real ODBC connector (dynamic import, pooling, streaming, schema browse),
real LDAP connector (bind/search/unbind, attribute mapping, schema browse), R2RML/RML mapping
engine (subject templates, class mapping, field mappings with lang tags/datatypes/URI refs,
Turtle + JSON-LD output, parse + serialize), interactive MappingBuilder UI (source config,
schema browsing, field mapping, preview, save), ConnectorSidecar wired with mapping application.
17 tests.

## Phase 5 — Org Mobile Apps (ALL 10 DONE)

Unified WASM/PWA container architecture: single container fetches app profiles,
UI modules, and per-install licences from IPMS. 6 app profiles defined as RDF
manifests (waiter, driver, tradie, print, scorekeeper, referee).
OrgAppManifest module: 5 API routes, 26 tests. Network scope enforcement with
CIDR matching. Per-install licence VCs with scope/permission/expiry.

## Phase 6 — HR, Print & B2B (ALL 8 DONE)

All 8 tasks complete: HR module (onboarding, shifts, compliance, payslips, expenses),
Driver Management (registration, job offers, status tracking, dispatch matching),
Print Shop (service catalogue, job intake, status pipeline, inter-org B2B with ODRL),
print.shop and hr.workforce vertical profiles.
13 routes, 34 tests.

## Phase 7 — Operational Horizontals (P7-01..06,10 DONE)

| Task | Status | Notes |
|------|--------|-------|
| P7-01 Payments | ✅ | PaymentsApi: receipt, refund, split, subscription, tax |
| P7-02 Device mTLS | ✅ | DeviceAuth: enrol, verify, revoke. 13 tests. |
| P7-03 Website maker | ✅ | WebsiteApi: preview, publish, seo, sitemap |
| P7-04 Notifications | ✅ | NotificationsApi: create, subscribe, read, query. 20 tests. |
| P7-05 ui# shapes to manifests | ✅ | All 30+ modules have configShape IRIs. 10 ui# shape templates. GET /modules/:id/config-shape route. |
| P7-06 UiFormRenderer config | ✅ | Modules page shows Configure button, opens modal with UiFormRenderer, submits config Turtle via PUT. |
| P7-07 Direct cash drawer | ❓ | Rust pos-edge |
| P7-08 Rust warnings | ❓ | |
| P7-09 Fullscreen display | ❓ | |
| P7-10 Malware scanner | ✅ | ClamAvScanner (INSTREAM), VirusTotalScanner (v3 API), CompositeScanner. 14 tests. |

## Phase 8 — IPMS Modules (ALL 23 DONE)

All 23 modules have implemented API routes + business logic + tests:
access, consent, credentials, delegation, delivery, emergency, governance,
household, licensing, loyalty, mcp, pricing, profile, theming, a11y,
tax, concessions, discounts, donations, barcode, eftpos, backups, accounting.

## Phase 10 — Vertical Profiles Assembly (ALL 10 DONE)

All 10 vertical profiles complete:
- P10-01 `food.restaurant` (existing, verified)
- P10-02 `food.take-away` (NEW: POS + delivery + driver-mgmt + allergy + tax + discounts)
- P10-03 `auto.portable-records` (existing, verified)
- P10-04 `health.privacy-consent` (existing, verified)
- P10-05 `member.governance` (existing, verified)
- P10-06 `print.shop` (existing, verified with tax)
- P10-07 `hr.workforce` (existing, verified with tax)
- P10-08 `sports.venue` (NEW: events + ticketing + access + donations + governance)
- P10-09 `trades.service` (NEW: jobs + bookings + quotations + inventory + tax)
- P10-10 `charity.nonprofit` (NEW: donations + governance + credentials + concessions + tax)
26 total vertical profiles in LIGHTHOUSE_VERTICAL_PROFILES array.

New modules integrated into vertical profiles:
- barcode: food.restaurant, food.take-away, sports.venue, trades.service
- eftpos: food.restaurant, food.take-away, sports.venue, trades.service
- backups: food.restaurant, food.take-away, sports.venue, trades.service, charity.nonprofit, health.privacy-consent, hr.workforce
- accounting: food.restaurant, food.take-away, sports.venue, trades.service, charity.nonprofit, hr.workforce

## Phase 9 — Tests & Documentation (PARTIALLY DONE)

| Task | Status | Notes |
|------|--------|-------|
| P9-01 Vocabulary tests | ✅ | 15 tests: IPMS + UI namespace/term resolution |
| P9-02 UiFormRenderer tests | ✅ | 13 vitest tests: shape parsing + field rendering + serialization. Fixed rdf:List bugs. |
| P9-03 Rust installer tests | ❓ | Rust |
| P9-04 Rust POS edge tests | ❓ | Rust |
| P9-05 POS edge IPC integration | ❓ | Rust |
| P9-06 Profile ladder doc | ✅ | `profile-ladder.md` with 4 layers + 26 profiles |
