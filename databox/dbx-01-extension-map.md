# DBX-01 — Repository and Extension Inventory

**Prompt:** DBX-01 (Wave A). **Agent level:** Medium. **Depends on:** none.
**Status:** complete. **Baseline:** Community Solid Server 7.1.9 (`package.json` `"version": "7.1.9"`).
**Production code changed:** none (read-only inventory, as required by the prompt).

## How to read this document

This is the extension map required by DBX-01: it names the existing CSS interfaces and
configuration points the Databox should **reuse**, **wrap** or **replace**, identifies where verified
claim/actor context is lost, and records the LWS (Linked Web Storage) gap analysis against the pinned
baseline. Every claimed seam cites a source file and line so a second Medium agent can trace deposit,
retrieval and denial through CSS from this document alone (the acceptance gate).

All paths are relative to the repository root. Line numbers are against the 7.1.9 tree as inspected on
2026-07-14. Three of the most load-bearing seams (`Credentials`, `ReadOnlyStore`,
`PermissionBasedAuthorizer.requireModePermission`) were opened and confirmed verbatim during synthesis;
the rest are backed by subsystem research with file/line evidence.

---

## 1. Request lifecycle (the spine every Databox seam attaches to)

A single authenticated LDP request flows through these stages. This is the trace a dependent agent
follows for **deposit** (POST), **retrieval** (GET) and **denial**.

```text
HTTP request
  └─ ParsingHttpHandler.handle              src/server/ParsingHttpHandler.ts:39-93
       ├─ requestParser.handleSafe(request)   → Operation           (:74)
       ├─ operationHandler.handleSafe(...)     → ResponseDescription (:75)
       │    └─ AuthorizingHttpHandler.handle   src/server/AuthorizingHttpHandler.ts:50-98
       │         ├─ credentialsExtractor.handleSafe(request) → Credentials   (:70)  ← AUTH
       │         ├─ modesExtractor.handleSafe(operation)     → AccessMap     (:73)
       │         ├─ permissionReader.handleSafe({credentials,requestedModes}) → PermissionMap (:79)
       │         ├─ authorizer.handleSafe({credentials, requestedModes, availablePermissions,...}) (:86) ← AUTHZ
       │         └─ operationHandler.handleSafe({operation,request,response})  (:97)
       │              └─ Get/Post/Put/Delete/Patch/HeadOperationHandler  src/http/ldp/*OperationHandler.ts
       │                   └─ ResourceStore.<method>()      src/storage/ResourceStore.ts:28-103  ← STORAGE
       └─ errorHandler + responseWriter        (:65, :84-92)
```

Wiring is **config-declared, not hard-coded**: `config/ldp/handler/default.json:15-34` composes
`ParsingHttpHandler → AuthorizingHttpHandler → WacAllowHttpHandler → OperationHandler` (a
`WaterfallHandler` over the six method handlers, `config/ldp/handler/components/operation-handler.json:6-39`).
The `Operation` object is `{ method, target, preferences, conditions?, body }`
(`src/http/Operation.ts:9-30`).

**Consequence for Databox:** the Databox composed authorizer (DBX-14 / HAK-04–05) inserts at the
`AuthorizingHttpHandler` layer or as additional `PermissionReader`s; the append-only and LWS-operation
behavior (DBX-15/17, HAK-01/07) inserts in the `ResourceStore` decorator chain; a new media type
(`application/lws+json`) inserts in the converter chain. Each is a documented Components.js swap, not a
core patch.

---

## 2. Authentication — where verified claims are born and where they die

### What exists

- `CredentialsExtractor` (`src/authentication/CredentialsExtractor.ts:8`) is
  `AsyncHandler<HttpRequest, Credentials>`. The production default (`config/ldp/authentication/dpop-bearer.json:6-38`)
  is a cached `UnionCredentialsExtractor` over `WaterfallHandler(DPoPWebIdExtractor, BearerWebIdExtractor)`
  plus `PublicCredentialsExtractor`.
- Cryptographic Solid-OIDC/DPoP verification is **delegated to the external
  `@solid/access-token-verifier` package** (`package.json` `^2.1.1`), called at
  `src/authentication/BearerWebIdExtractor.ts:17` and `src/authentication/DPoPWebIdExtractor.ts:17`. CSS
  does not implement token/DPoP validation itself. DPoP sender-constraint binding is validated inside
  that verifier (`DPoPWebIdExtractor.ts:41-55`).
- The OIDC **provider** side (token issuance) is `oidc-provider`, wrapped by
  `src/identity/configuration/IdentityProviderFactory.ts` and `src/identity/IdentityProviderHttpHandler.ts`.

### The critical loss: `Credentials` is a three-field object with no assurance, audience or delegation

`src/authentication/Credentials.ts` **in full** (verified verbatim):

```ts
export type Credentials = {
  agent?: { webId: string };
  client?: { clientId: string };
  issuer?: { url: string };
  [key: string]: unknown;
};
```

There is **no** assurance/ACR/AMR level, **no** authentication-time, **no** audience, and **no**
delegation / represented-entity / on-behalf-of concept anywhere in CSS (grep across `src/` for
`assurance|acr_values|amr|loa` → zero matches). The `[key: string]: unknown` index exists but nothing
in the codebase populates any key beyond the three above.

**This is the single biggest gap named by the prompt** ("identify where verified claims and
authenticated actor context are lost"). Two distinct losses:

1. **Never captured.** Assurance grade, authentication time, audience and delegation/represented-entity
   are never extracted from the verified token in the first place. DBX-12 ("authenticated request
   context") is therefore genuinely new construction, not a refactor.
2. **Narrowed inside WAC.** Even the claims that *are* captured (`client`, `issuer`) are dropped once
   authorization runs under the default WAC mode: `src/authorization/access/AgentAccessChecker.ts:10-13`
   and `src/authorization/OwnerPermissionReader.ts:43-47` read only `credentials.agent?.webId`. By
   contrast **ACP mode preserves all three** — `src/authorization/AcpUtil.ts:109-111` builds context
   from `agent.webId`, `client.clientId` **and** `issuer.url`, exposed as `acp#agent/client/issuer`
   (`config/ldp/authorization/acp.json:29-33`).

   > This directly bears on hackathon decision **HD-03 (WAC for the hackathon)**: WAC is the pinned
   > surface, but WAC *as CSS ships it* cannot see client or issuer, let alone assurance. The Databox
   > composed authorizer must carry client/issuer/assurance **outside** the WAC `AccessChecker`, because
   > the WAC path structurally discards them. Flagged for DBX-02/DBX-14; not an implementation decision
   > to make here.

### No issuer trust list today

Any issuer whose token verifies cryptographically is accepted; there is **no** CSS-side issuer
allowlist/trust configuration (grep `issuer|trustedIssuer|allowlist|whitelist` in `src/identity` → only
unrelated matches). Solid-OIDC Client-ID-Document verification exists but only on the **IdP** side for
client registration (`src/identity/storage/ClientIdAdapterFactory.ts:22-121`; HTTPS-required except
localhost, checks `json.client_id === id`), not as a resource-server authorization input. DBX-06's
"trusted issuer/claim contracts" and DBX-12's "external issuer/claim contract" have no existing
mechanism to extend — they are new.

### Reusable precedent: client-credentials ("API-key-like") issuance already exists

CSS ships a long-lived, non-interactive credential distinct from interactive Solid-OIDC login:
`src/identity/interaction/client-credentials/`. `BaseClientCredentialsStore.create`
(`.../util/BaseClientCredentialsStore.ts:70-77`) mints `secret = randomBytes(64).toString('hex')` stored
as `{accountId, label, webId, secret}`; `ClientCredentialsAdapterFactory` synthesizes an OIDC client
with `grant_types: ['client_credentials']` (`ClientCredentialsAdapterFactory.ts:55`); toggled by
`config/identity/handler/enable/client-credentials.json`.

> **Reuse note, with a boundary.** This is the closest existing thing to the Databox Connection
> Credential (DBX-13 / HAK-06), and its lifecycle-store shape is worth studying. **But** it is a
> reusable *bearer secret* — exactly what invariant 4 and DBX-13 forbid ("its document is not accepted
> as a bearer access token"; "copied credential bytes without the holder key fail"). Databox needs a
> holder-key-bound VC exchanged for short-lived tokens, so this is a *pattern to learn from and
> deliberately diverge from*, not a component to reuse directly.

---

## 3. Authorization — the composition chokepoint and the 404/403 leak rule

### Interface chain (all `AsyncHandler` subclasses)

| Interface | File | Role |
|---|---|---|
| `ModesExtractor` | `src/authorization/permissions/ModesExtractor.ts:8` | `Operation → AccessMap` (which modes the request needs) |
| `PermissionReader` | `src/authorization/PermissionReader.ts:22` | discovers what the credentials are granted; composed via `UnionPermissionReader` |
| `Authorizer` | `src/authorization/Authorizer.ts:24` | permit/deny; only impl `PermissionBasedAuthorizer` |
| `AccessChecker` | `src/authorization/access/AccessChecker.ts:8` | WAC-only agent/class/group checks |

WAC vs ACP is a **startup config choice, mutually exclusive**: `config/default.json:19` imports
`webacl.json` (→ `WebAclReader`); `config/file-acp.json:19` imports `acp.json` (→ `AcpReader`). Both plug
the same `urn:solid-server:default:PermissionReader` slot
(`config/ldp/authorization/readers/default.json`), composed with `PathBasedReader`,
`OwnerPermissionReader`, `ParentContainerReader`. HD-03 fixes **WAC** for the hackathon.

### Permission shape has no room for tenant/assurance/ODRL

`src/authorization/permissions/Permissions.ts:6-27`:

```ts
export enum AccessMode { read, append, write, create, delete }
export type PermissionSet = Partial<Record<AccessMode, boolean>>;
export type PermissionMap = IdentifierMap<PermissionSet>;
```

WAC/ACP add `control` (`AclPermissionSet.ts:3-8`). That is the entire vocabulary — a flat boolean map.
No tenant, assurance, purpose, time or ODRL-precondition dimension exists. The Databox authorizer cannot
express its decision in this type; it must compose *around* it (invariant 12 wants the standard surface
preserved, so the Databox layer **narrows** the WAC result rather than replacing `PermissionSet`).

### The single composition chokepoint (where the Databox "AND" goes)

`src/authorization/PermissionBasedAuthorizer.ts:35-54` loops per `(identifier, modes)` and calls
`requireModePermission` (`:86-99`, verified verbatim), which throws `ForbiddenHttpError`/
`UnauthorizedHttpError` when `!permissionSet[mode]`. Three viable insertion strategies for the composed
Databox authorizer (DBX-14 / HAK-04):

1. a new `PermissionReader` unioned into `readers/default.json` that can force a mode to `false`
   (tenant/relationship/assurance/ODRL precondition failing → deny) — **most idiomatic, preserves the
   standard surface**;
2. a wrapping `Authorizer` around `PermissionBasedAuthorizer`;
3. an additional check inside `requireModePermission` (most invasive — avoid).

The call site is `src/server/AuthorizingHttpHandler.ts:86`.

### Denial behavior and the deliberate existence-hiding rule

No structured reason codes — only `HttpError` subclasses carrying `statusCode`, `errorCode` (`H<status>`)
and RDF metadata (`src/util/errors/HttpError.ts:24-59`). DBX-14's "structured reason codes / safe
step-up responses" are new.

CSS **already implements** invariant-3-style existence hiding:
`PermissionBasedAuthorizer.reportAccessError` (`:63-75`, verified) returns **404** instead of 403/401
when the agent lacks Read and the resource isn't being created — *"as it makes any other agent
permissions irrelevant."* Databox denial paths must preserve this (do not regress to a 403 that reveals
existence). This is a **reuse**, not a build.

### No append-only concept in the authorization layer

`ImmutableMetadataPatcher` (`src/storage/patch/ImmutableMetadataPatcher.ts:20-84`) protects specific
**metadata triples** from PATCH (throws `ConflictHttpError`), but there is no resource-level append-only
mode anywhere in `src/authorization/` or `src/storage/` (grep `append-only` → none). See §4.

---

## 4. Operation handling & storage — the append-only and LWS-operation seams

### ResourceStore decorator chain (the wrap target)

`ResourceStore` (`src/storage/ResourceStore.ts:28-103`): `getRepresentation`, `setRepresentation`,
`addResource`, `deleteResource`, `modifyResource`. `PassthroughStore` (`src/storage/PassthroughStore.ts:13-59`)
is the decorator base — forward everything, override selectively. Default composition
(`config/storage/middleware/default.json:8-49`):

```text
CachedResourceSet → MonitoringStore → BinarySliceResourceStore → IndexRepresentationStore
  → LockingResourceStore → PatchingStore → RepresentationConvertingStore → DataAccessorBasedStore
```

### Append-only seam (DBX-17 / HAK-07) — exact existing pattern

`ReadOnlyStore` (`src/storage/ReadOnlyStore.ts:13-45`, verified in full) is a `PassthroughStore`
subclass that throws `ForbiddenHttpError` on `addResource`/`deleteResource`/`modifyResource`/
`setRepresentation` while passing reads through. An **append-only** Databox store is the same pattern
with a narrower override set: allow `addResource` (POST create), reject `modifyResource`/`deleteResource`
and reject `setRepresentation` **on an existing resource**.

> **Sharp edge for DBX-17/HAK-07:** `setRepresentation` is used by CSS for *both* create and replace
> (`ResourceStore.ts:44-58` doc). An append-only decorator must therefore call `hasResource` first and
> only reject the replace case — a plain `ReadOnlyStore`-style blanket throw would also block legitimate
> creation. Note this is exactly where invariant 7 (no silent overwrite) and invariant 17's
> "administrative/owner permissions cannot bypass" get enforced: the decorator sits below authorization,
> so it binds every actor class.

### LWS storage-description + `application/lws+json` seam (HAK-01)

Media types are constants in `src/util/ContentTypes.ts:2-21` (`DEFAULT_CUSTOM_TYPES` maps
`.acl/.acr/.meta`). Conversion is a Components.js-wired `ChainedConverter`
(`config/util/representation-conversion/default.json:3-35`) of `TypedRepresentationConverter`s
(base `src/storage/conversion/TypedRepresentationConverter.ts`; `RdfToQuadConverter.ts:24-36` is the
model). Adding `application/lws+json` = new constant + new `TypedRepresentationConverter` + register in
the chain config. **No core change.**

Storage description discovery already exists and is the natural host for the LWS storage description:
`StorageDescriptionAdvertiser` (`src/server/description/StorageDescriptionAdvertiser.ts:28-45`) emits a
`Link rel="…solid#storageDescription"` header; `StorageDescriptionHandler`
(`.../StorageDescriptionHandler.ts:20-52`) serves the description; `NotificationDescriber` already
injects `notify:subscription` triples into it. HAK-01's "advertise a pinned LWS storage description"
extends this exact mechanism.

### Conditional requests (reuse for receipts/idempotency)

`BasicConditionsParser` (`src/http/input/conditions/BasicConditionsParser.ts:29-51`) →
`BasicConditions.matchesMetadata` (`src/storage/conditions/BasicConditions.ts:33-71`) via `ETagHandler`;
enforced in `DataAccessorBasedStore.validateConditions` (`:358-362`, throws `PreconditionFailedHttpError`).
Reusable for DBX-15/18 idempotency and receipt digests.

---

## 5. Pods, identity & opaque identifiers

- **Provisioning:** `PodManager.createPod` (`src/pods/PodManager.ts`), impls `GeneratedPodManager`
  (`src/pods/GeneratedPodManager.ts:13-36`, static) and `ConfigPodManager` (dynamic, store-per-pod).
  Resources are Handlebars templates walked by `BaseResourcesGenerator`
  (`src/pods/generate/BaseResourcesGenerator.ts:74-247`); WebID profile is
  `templates/pod/base/profile/card$.ttl.hbs`.
- **Pod identifiers are slug/name-derived, NOT random.** `IdentifierGenerator` takes a `name`
  (`src/pods/generate/IdentifierGenerator.ts:6-18`); `SubdomainIdentifierGenerator`/
  `SuffixIdentifierGenerator` just `sanitizeUrlPart(name).toLowerCase()`
  (`src/util/StringUtil.ts:19-21`). **DBX-10/HAK-06's opaque, PII-free, cryptographically random box
  identifiers require a new `IdentifierGenerator` implementation** — but the primitive is already in the
  tree: `randomUUID()` (`src/storage/keyvalue/WrappedIndexedStorage.ts:161`) and
  `randomBytes(64)` (`BaseClientCredentialsStore.ts:71`) are used for internal IDs. Reuse the primitive,
  replace the generator.
- **`pim:storage` context (recent work):** commit `d4fcf766e` made the profile's `pim:storage` triple
  conditional on a `linkStorage?: boolean` `PodSettings` field (`src/pods/settings/PodSettings.ts:32-36`)
  with a create-pod checkbox — confirms the WebID template is the live extension point for profile
  content and that `PodSettings` is the place to thread Databox provisioning inputs.
- **No tenant/multi-realm concept exists** (grep `tenant`/`multi-realm` in `src/pods|identity|server`
  → none). Dynamic mode isolates the storage *backend* per pod, but the OIDC provider, signing JWK and
  account storage are **server-wide**. DBX-11's per-tenant "origins, token audiences, service
  identities, storage, queues, logs, signing keys" is therefore substantially new; only path-level
  storage isolation (`PodStorageLocationStrategy`) pre-exists.

---

## 6. Notifications — usable as a hint, unusable as durable recovery

- **Channels implemented:** `WebSocketChannel2023`, `WebhookChannel2023`, and CSS's non-standard
  `StreamingHTTPChannel2023` (`src/server/notifications/*`). Discovery via the storage-description
  `notify:subscription` triples (`NotificationDescriber.ts:32-50`).
- **Trigger:** `MonitoringStore` (`src/storage/MonitoringStore.ts:39-85`) emits `changed` on every
  write; `ListeningActivityHandler` fans out to subscribed channels.
- **Delivery is best-effort / in-memory.** `WebhookEmitter.handle`
  (`src/server/notifications/WebhookChannel2023/WebhookEmitter.ts:90-103`) does a single `fetch`, logs on
  failure, **no retry**; `WebSocket2023Emitter` discards if no live socket; `ListeningActivityHandler`
  fires-and-forgets. Grep for retry/dedup/outbox/durable → **none**.
- **No cursor / "since" replay.** `NotificationChannel` (`.../NotificationChannel.ts:21-58`) has only a
  one-shot `state` (ETag) diff at subscribe time — not an event log. No historical-event listing API.
- **No SSRF protection.** `WebhookEmitter` POSTs the client-supplied `sendTo` URL with no
  allowlist/private-IP/scheme/redirect controls.

> **Consequence:** the hackathon's own framing is correct — a Solid notification channel is a *hint*
> only. **DBX-21 / HAK-08's durable cursor feed, transactional outbox and SSRF protection are all
> net-new**; nothing in CSS notifications can be reused for guaranteed missed-event recovery. This is the
> largest build-from-scratch subsystem in the exchange layer.

---

## 7. Extension mechanics — how Databox ships, and one real friction point

- **No plugin registry beyond Components.js.** An external package (e.g.
  `@solid/community-server-databox`) ships `componentsjs-generator` output and declares
  `lsd:module`/`lsd:components`/`lsd:contexts`/`lsd:importPaths` in `package.json` (CSS does this,
  `package.json:31-41`); a server config adds an `import` entry or registers instances in `@graph`.
  `AppRunner.create({ mainModulePath, config })` (documented in
  `documentation/markdown/usage/dev-configuration.md:16-25`) is the loader hook, and `config` accepts an
  **array** of paths — the documented way to merge a Databox config over CSS's.
- **Tests:** Jest + ts-jest (`jest.config.js`); `test/unit/` mirrors `src/`; `test/integration/` spins a
  real `App` from a test config and hits real HTTP (model: `test/integration/FileBackend.test.ts`, using
  `instantiateFromConfig` + `getTestConfigPath` from `test/integration/Config.ts`). This is the pattern
  for every DBX/HAK acceptance test.
- **Friction — no feature-flag / experimental-module pattern exists** (grep `experimental`,
  `feature-flag` in `config/` and `src/` → none). The only "optional" mechanism is whole-config swaps
  (`file-acp.json` vs `default.json`).

  > **Flagged for DBX-02/DBX-09.** The hackathon profile requires every LWS draft dependency to be
  > *"pinned, advertised as experimental and isolated behind an adapter."* CSS has no runtime feature
  > flag to express "experimental" — so "isolated behind an adapter" must mean a **separate Databox
  > config preset** (its own top-level config importing the LWS adapter components), not a toggle inside
  > the default config. This is a decision DBX-02 should record; DBX-09's scaffold should assume the
  > separate-preset shape.

---

## 8. Reuse / wrap / replace summary

| Databox need | CSS seam | Verdict | Prompt |
|---|---|---|---|
| Deposit/retrieval HTTP spine | `ParsingHttpHandler`→`AuthorizingHttpHandler`→`OperationHandler` | **reuse** | HAK-01 |
| New media type `application/lws+json` | `ContentTypes.ts` + `TypedRepresentationConverter` chain | **extend** | HAK-01 |
| LWS storage description advertise/serve | `StorageDescriptionAdvertiser`/`Handler` | **wrap** | HAK-01 |
| Authenticated request context (assurance/audience/actor/delegation) | `Credentials` type + extractors | **replace/extend** (new fields never captured) | DBX-12 |
| Issuer/claim trust contract | *(none — no issuer allowlist)* | **build** | DBX-06, DBX-12 |
| Connection credential lifecycle | `client-credentials/*` store shape | **learn-from, diverge** (must not be bearer) | DBX-13, HAK-06 |
| Composed authorizer (tenant∧assurance∧ODRL∧WAC) | new `PermissionReader` in `readers/default.json` | **wrap** at `PermissionBasedAuthorizer.ts:86` | DBX-14, HAK-04/05 |
| Existence-hiding denial (404-not-403) | `PermissionBasedAuthorizer.reportAccessError` | **reuse** | invariant 3 |
| Append-only records | `ReadOnlyStore` / `PassthroughStore` pattern | **adapt** (allow create, reject replace via `hasResource`) | DBX-17, HAK-07 |
| Opaque random box identifiers | `IdentifierGenerator` + `randomUUID`/`randomBytes` primitives | **replace** generator, reuse primitive | DBX-10, HAK-06 |
| Per-program tenant isolation | *(none — server-wide OIDC/JWK)* | **build** (path isolation only pre-exists) | DBX-11 |
| Durable notification / cursor recovery / SSRF guard | *(none — best-effort push only)* | **build** | DBX-21, HAK-08 |
| Ship as extension | Components.js module + `AppRunner` config array | **reuse** | DBX-09 |
| Experimental isolation | *(none — no feature flag)* | **build as separate config preset** | DBX-02, DBX-09 |

---

## 9. LWS gap analysis (against pinned baseline)

The hackathon pins **W3C LWS Protocol 1.0, June 2026 Working Draft** with **RFC 8693 token exchange** and
authorization-server discovery (`databox/hackathon-profile.md:18-37`). Grep across `src/` for
`token-exchange`, `8693`, `TokenExchange`, `as_uri`, `authorization_server`, `LWS`, `Linked Web Storage`
→ **zero matches**. Explicitly **absent from CSS 7.1.9**, all net-new adapters:

| LWS capability | In CSS 7.1.9? | Notes |
|---|---|---|
| Authorization-server discovery / metadata | **No** | only `oidc-provider`'s internal OIDC discovery exists |
| RFC 8693 OAuth Token Exchange | **No** | HAK-04 builds it |
| LWS authentication suites (self-signed Controlled Identifier) | **No** | HAK-03 fixture |
| LWS storage descriptions | **Partial substrate** | Solid storage-description mechanism exists to extend (§4) |
| `application/lws+json` media type | **No** | converter-chain extension (§4) |
| LWS Access Requests / Access Grants (ODRL) | **No** | HAK-05 builds it |
| LWS operation semantics | **No** | maps onto existing LDP operations via adapter (HAK-01) |

CSS **does** already provide the standards substrate the LWS track needs: Solid-OIDC verification
(external verifier), DPoP sender-constraint, storage-description discovery, LDP/HTTP methods, RDF content
negotiation, conditional requests, WAC, and Solid Notifications channels. The LWS work is a set of
**versioned adapters over these**, consistent with the hackathon's "thin adapters over CSS extension
points" directive — no evidence contradicts that the evolutionary approach is feasible.

---

## 10. Initial dependency list (for DBX-09 scaffold)

Already in `package.json` and reusable: `@solid/access-token-verifier` (Solid-OIDC/DPoP verify),
`oidc-provider` (IdP), `componentsjs` + `componentsjs-generator` (DI/extension), `jest`/`ts-jest`
(tests), `cross-fetch` (outbound), Handlebars (templates). **Likely new** for the LWS/Databox track (to
be confirmed and pinned by DBX-02/DBX-09, not adopted here): a VC 2.0 / VC-JOSE-COSE (ES256) library for
the `DataboxConnectionCredential`, an RFC 8693 token-exchange implementation (or hand-rolled over
`oidc-provider`), and an ODRL/SHACL validation toolchain for DBX-07.

---

## 11. Candidate upstream seams (clean extension points, no core fork needed)

1. `CredentialsExtractor` / `Credentials` — add a Databox extractor and a richer context type behind it
   (DBX-12).
2. `PermissionReader` union in `readers/default.json` — the idiomatic place to add the composed Databox
   authorizer (DBX-14).
3. `PassthroughStore` decorator chain — append-only, quarantine and LWS-operation adapters (DBX-15/17).
4. `TypedRepresentationConverter` chain — `application/lws+json` (HAK-01).
5. `StorageDescriptionAdvertiser`/`Handler` — LWS storage + authorization-server discovery advertisement.
6. `IdentifierGenerator` — opaque random box identifiers (DBX-10).
7. `PodSettings` + WebID template — Databox provisioning inputs (DBX-10).
8. `AppRunner` config-array loading + a dedicated Databox config preset — experimental isolation
   (DBX-09).

Each is an interface implementation or a Components.js config addition. **No seam requires forking core
CSS classes**, which satisfies invariant 12 (preserve the standard Solid surface) and the hackathon's
"do not refactor unrelated CSS internals" constraint.

---

## 12. Acceptance-gate self-check

- **"Another Medium agent can trace deposit, retrieval and denial through CSS using only the map":**
  §1 gives the full request spine with file/line for every stage; deposit = POST →
  `PostOperationHandler` → `ResourceStore.addResource`; retrieval = GET → `GetOperationHandler` →
  `getRepresentation`; denial = `PermissionBasedAuthorizer.requireModePermission` (§3) with the 404/403
  existence rule. ✔
- **"Every claimed seam is backed by source evidence":** every seam in §8/§11 cites a file and line;
  the three most load-bearing (`Credentials`, `ReadOnlyStore`, `reportAccessError`/`requireModePermission`)
  were opened and confirmed verbatim. ✔
- **"Make no production-code changes":** none made. ✔

## 13. Decisions escalated to DBX-02 (not made here)

Per the plan's rule that an inventory agent must not make Hard decisions, these surfaced but are left to
DBX-02:

1. **WAC cannot see client/issuer/assurance (HD-03 tension).** Where the composed authorizer carries
   those claims given the WAC path discards them (§2).
2. **Experimental isolation shape.** CSS has no feature flag; "isolated behind an adapter" must resolve
   to a separate config preset (§7).
3. **Connection credential vs client-credentials.** Confirm the deliberate divergence from CSS's bearer
   client-credentials toward a holder-key-bound, non-bearer VC (§2, DBX-13).
4. **New dependency pinning.** VC-JOSE-COSE, RFC 8693, ODRL/SHACL libraries (§10).
