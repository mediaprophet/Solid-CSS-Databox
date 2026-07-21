# Org Mobile Apps

A unified WASM/PWA container that fetches its identity, features, and permissions
from the CMS at runtime based on the org's vertical profile and the app's purpose.

## Architecture

Instead of building separate apps for each purpose (waiter, driver, scorekeeper, etc),
we build **one WASM container** that:

1. Boots with a minimal PWA shell (service worker + Solid-OIDC auth)
2. Calls `POST /.databox/cms/org-apps/boot` with its install licence
3. Receives a `ContainerBootConfig` containing:
   - App profile (name, network scope, UI modules)
   - Available UI modules (filtered by org's enabled CMS modules + licence permissions)
   - Server URL for runtime data fetching
4. Dynamically loads UI component bundles from the CMS
5. Enforces network scope (local-only vs remote-capable) via service worker

## App Profiles

App profiles are defined as RDF manifests in the CMS. Each profile declares:

- `appId`: Unique identifier (e.g. `waiter-app`, `driver-app`)
- `networkScope`: `local-only` or `remote-capable`
- `requiredModules`: CMS modules the app needs
- `verticalProfiles`: Which vertical profiles this app is relevant to
- `uiModules`: UI components to render, each mapped to a CMS module + route
- `defaultPermissions`: What permissions to request by default

## Per-Install Licensing

Each app install receives a Verifiable Credential (VC) licence binding:

- `appId` → which app
- `organisation` → which org
- `deviceId` → which device
- `scope`: `full` | `read-only` | `trial` | `restricted`
- `permissions`: granular permission list
- `expiresAt`: optional expiry

The CMS validates this licence on every container boot.

## Directory Structure

```
org-mobile-apps/
  container/          # The WASM/PWA container shell
    src/
      index.ts        # Boot sequence: auth → fetch config → load modules
      auth.ts         # Solid-OIDC authentication
      loader.ts       # Dynamic UI module loader
      sw.ts           # Service worker (caching + network scope enforcement)
    public/
      manifest.webmanifest
    vite.config.ts
    package.json
  profiles/           # App profile definitions (Turtle/RDF)
    waiter-app.ttl
    driver-app.ttl
    tradie-app.ttl
    print-app.ttl
    scorekeeper-app.ttl
    referee-app.ttl
```

## Network Scope Enforcement

- `local-only`: Service worker checks origin IP against org's local network ranges.
  If off-network, the app refuses to load and shows an error.
- `remote-capable`: No restriction. App works from any network.

## Profile-Driven Availability

The CMS module registry exposes an `orgApps` field. The admin panel shows
available apps based on the org's enabled modules and vertical profile.
Apps are served at `https://databox.<apex>/apps/<app-id>/`.
