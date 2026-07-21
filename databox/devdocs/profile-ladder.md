# Databox Profile Ladder

The Databox platform is built as a progressive ladder of profiles. Each layer
builds on the previous one, adding capabilities without removing any.

## Layer 1 — Basic Solid Server

The foundation is a standards-compliant Solid server:

- **Pod storage** with WebID-TLS authentication
- **LDP** container and resource CRUD
- **WAC/ACP** access control
- **LDN** notification inbox
- **OIDC** identity provider

This layer is useful for individuals who want a personal data pod with no
business features.

## Layer 2 — +Databox

Adds the Databox orchestration layer:

- **Binary evidence quarantine** with malware scanning (ClamAV, VirusTotal)
- **Device identity** (mTLS) for POS terminals and IoT
- **Native edge** POS device support (cash drawer, printer, customer display)
- **Org app container** (WASM/PWA) with per-install licence VCs
- **Connector sidecar** framework for enterprise data integration

This layer is useful for organisations that need device management and evidence
quarantine but don't yet need the full CMS.

## Layer 3 — +CMS

Adds the Content Management System:

- **Module registry** with 30+ built-in modules (bookings, payments, catalogue,
  governance, credentials, events, ticketing, tax, discounts, donations, etc.)
- **Vertical profiles** that bundle modules for specific industries
- **Module configuration** via ui# shapes and UiFormRenderer
- **RDF feeds** and website SEO publishing
- **MCP server** for AI agent integration
- **Enterprise connectors** (ODBC, LDAP) with R2RML/RML mapping engine

This layer is useful for organisations that need structured content and
business workflows on top of their pod storage.

## Layer 4 — +Modules (Vertical Profiles)

Vertical profiles compose horizontal modules into industry-specific bundles:

| Profile | Modules | Use Case |
|---------|---------|----------|
| `food.restaurant` | POS, menu, bookings, delivery, allergy-safety, tax, discounts, barcode, eftpos, backups, accounting | Restaurants |
| `food.take-away` | POS, catalogue, delivery, driver-mgmt, allergy, tax, discounts, barcode, eftpos, backups, accounting | Quick-service, food trucks |
| `food.allergy-safety` | Allergy-profile, ingredient-declaration, allergen-matching | Allergen compliance |
| `auto.portable-records` | Catalogue, bookings, records, jobs, website-seo | Automotive repair |
| `health.privacy-consent` | Consent, access, correction, governance, delegation, break-glass, backups | Healthcare |
| `member.governance` | Governance, events, ticketing, social, payments | Clubs, co-ops |
| `print.shop` | Print services, jobs, B2B inter-org, tax | Print businesses |
| `hr.workforce` | HR, governance, credentials, payments, driver-mgmt, backups, accounting | HR management |
| `sports.venue` | Events, ticketing, access, donations, governance, tax, barcode, eftpos, backups, accounting | Sports venues |
| `trades.service` | Jobs, bookings, quotations, catalogue, inventory, tax, barcode, eftpos, backups, accounting | Trades services |
| `charity.nonprofit` | Donations, governance, credentials, concessions, tax, backups, accounting | Charities |
| `sport.club-base` | Governance, events, ticketing, social | Sporting clubs |
| `sport.league-team` | Events, ticketing, credentials, governance | League sports |
| `sport.facility-court` | Bookings, events, ticketing | Courts and courses |
| `sport.compliance-safety` | Credentials, licensing, governance | Safety compliance |
| `glam.base` | Catalogue, records, governance, profile | GLAM base |
| `glam.gallery-museum` | Catalogue, events, ticketing, website-seo | Galleries, museums |
| `glam.library` | Catalogue, records, profile | Libraries |
| `glam.archive` | Records, provenance, governance | Archives |
| `glam.historical-society` | Governance, events, social, donations | Historical societies |
| `home-services.base` | Bookings, catalogue, payments, profile | Home services |
| `home-services.maintenance` | Jobs, inventory, bookings, tax | Pool & garden care |
| `home-services.domestic` | Bookings, catalogue, payments | House-keeping |
| `wellness.practitioner` | Bookings, catalogue, credentials, payments | Solo practitioners |
| `wellness.venue` | Bookings, events, ticketing, catalogue | Studios, venues |
| `wellness.clinic` | Governance, credentials, consent, bookings | Multi-disciplinary clinics |

## Choosing a Profile

1. **Start basic** — set up a Solid server with pod storage.
2. **Add Databox** if you need device management, evidence quarantine, or
   native edge POS support.
3. **Add CMS** if you need structured content, business workflows, or
   enterprise connectors.
4. **Select a vertical profile** that matches your industry to get a
   pre-configured bundle of modules with sensible defaults.

Each layer is additive — you can always upgrade from basic to +Databox to
+CMS without losing data or configuration.
