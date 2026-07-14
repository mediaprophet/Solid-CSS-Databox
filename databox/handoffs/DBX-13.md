# Handoff — DBX-13

**Prompt:** DBX-13 — Databox Connection Credential lifecycle (issuance, proof ceremony, status, revocation, renewal, rotation, migration, export/import)
**Status:** complete, **round-2 security fixes applied** (tsc clean, eslint clean, **100% coverage**, 76 tests). See §9.
**Agent level:** Hard. **Baseline:** Community Solid Server 7.1.9.
**Depends on:** DBX-10 (opaque box + `RelationshipRecord.{pairwiseWebId,relationshipId,boxId}` — the opaque subjects a
credential binds), DBX-12 (pairwise/holder + provisional-seam discipline), DBX-07 (ODRL grant/policy digest concepts).
**Decisions honoured:** ADR-0007 (VC 2.0 / VC-JOSE-COSE / ES256 / `application/vc+jwt`, BitstringStatusList, not-a-bearer-token,
no global customer key, many-per-vault isolation), ADR-0008 (fresh holder-key proof at connection + every unattended
request + migration/recovery), ADR-0009 (no default refresh, per-request status re-check, prompt revocation), ADR-0005/0006
(RFC 8693 exchange **BLOCKED** → provisional seam only), consumer-vault-interoperability.md (credential shape + per-program isolation).

> **RESIDUAL HUMAN CRYPTOGRAPHIC + PRIVACY REVIEW GATE (open — this handoff does NOT clear it).**
> An independent crypto/security review (round 2) confirmed the ES256 core sound (raw `r||s` vs DER correct and
> fail-closed, no header-key trust, alg-confusion structurally defeated) and its findings are fixed (§9): **alg-pinning
> now tested** (`alg:none`/alg-swap rejected before signature), **revocation is fail-closed** (no status source → deny),
> **token audience bound to the credential's databox**, status-index desync closed, registry lifecycle drives the
> published status bit, nonce store bounded. Before production, a human cryptographer + privacy reviewer MUST still:
> (a) re-audit `Es256.ts` on the **production** Node/OpenSSL build (the `crypto.verify` try/catch is now present but
> platform-`istanbul ignore`d because current OpenSSL returns `false` rather than throwing — confirm behavior there);
> (b) confirm the holder-proof single-use nonce store and 5-min token TTL are backed by a **shared, durable** store in a
> multi-node deployment (here process-local, now TTL-evicted); (c) review BitstringStatusList **herd privacy** (T-56) —
> min-herd publish floor + hosting/latency SLO; (d) confirm the account-linking challenge design (ADR-0008 open) does not
> leak customer data (with DBX-16); (e) decide LOW-3 (prefer a credential-subject key **allowlist** over the current
> forbidden-key denylist — deferred as out-of-scope here); (f) re-run the T-08/17/18/19/33/48/52 negatives against real
> key management. The RFC 8693 wire binding remains BLOCKED — the exchange is a provisional seam.

## 1. Files (all new, within `src/databox/credential/**` + `test/unit/databox/credential/**`)

| File | Purpose |
|---|---|
| `credential/ConnectionCredentialTypes.ts` | Pinned constants (`VC_V2_CONTEXT`, media type, `CONNECTION_CREDENTIAL_ALG`, **`FORBIDDEN_CREDENTIAL_KEYS`**) + pure types (`DataboxConnectionCredential`, `HolderBinding`, `ConnectionBinding`, `CredentialStatusReference`, `ProofChallenge`, `KeyHistoryEntry`, `ProvisionalShortLivedToken`, `ConnectionLifecycleState`). |
| `credential/Es256.ts` | The one raw-crypto surface (node:crypto): base64url, `sha256Hex`, `publicJwkFromKeyObject`/`keyObjectFromPublicJwk`, RFC 7638 `jwkThumbprint`, `signCompactJws`/`decodeCompactJws`/`verifyCompactJws` (ES256 raw `r||s`). |
| `credential/BitstringStatusList.ts` | `BitstringStatusList` (GZIP+base64url bitstring, set/get/encode/decode) + `StatusListManager` (per-program index assignment, revoke, `isRevoked`, herd-floor `publish` — T-56). |
| `credential/HolderKeyProof.ts` | `HolderKeyProofVerifier` (server-issued single-use nonce+audience+expiry challenge, verify-against-bound-key, consume) + `signHolderProof` (vault side). ADR-0008 ceremony. |
| `credential/ConnectionCredentialIssuer.ts` | `ConnectionCredentialIssuer.issue` (holder-bound VC 2.0, all bindings, ES256 JWS) + `computeAccessGrantDigest` (`urn:sha256:` — T-08) + `IssuanceRequest`. |
| `credential/ConnectionCredentialValidator.ts` | `ConnectionCredentialValidator.validate` (trusted-issuer sig, shape, holder-thumbprint integrity, validity window, realm binding) + `assertNoForbiddenKeys` (T-18). |
| `credential/ConnectionCredentialRegistry.ts` | Per-program registry: `install`/`importConnection`/`exportConnection`, `acknowledgeInstallation` (append-only), `suspend`/`reactivate`/`revoke`, `renew`/`rotateHolderKey`/`migrate` (key history + supersession). Isolation invariant 5. |
| `credential/ProvisionalTokenExchange.ts` | The seam where all gates converge: validate → fresh holder proof → status re-check → active-state → **`ProvisionalShortLivedToken` (`notWireFormat:true`)**. RFC 8693 BLOCKED. |
| `test/.../*.test.ts` (7 suites) + `TestKeys.ts` | 68 tests; test-only ES256 keys generated at runtime with node:crypto. |

`src/databox/index.ts` **NOT edited** (constraint 1). Barrel symbols to add are in §5.

## 2. Credential + proof + status + lifecycle design

**Credential (ADR-0007).** VC 2.0 `["VerifiableCredential","DataboxConnectionCredential"]`, secured as an ES256 compact
JWS (`typ:"vc+jwt"`, `cty:"vc"`) — the `application/vc+jwt` envelope. Binds: issuer, program, opaque databox, storage
description + optional authorization-discovery, immutable `accessGrant` **+ `accessGrantDigest`**, `accessProfile`,
`conformsTo[]`, `syncProfile`, opaque `relationship`, pairwise subject WebID, and the **holder public JWK + RFC 7638
thumbprint** (computed by the issuer, not trusted from input). `credentialStatus` is a `BitstringStatusListEntry`.
Lifetime months/years (default 1 year). **No** access/refresh token, **no** global customer key/id — enforced both
structurally (no field carries them) and dynamically by `assertNoForbiddenKeys`.

**Proof ceremony (ADR-0008).** The verifier *issues* the challenge (nonce+audience+expiry) so it is always
server-chosen. The vault signs it with the bound holder private key; `verify` (a) checks the signature against the
credential's bound holder JWK, (b) matches `kid`↔thumbprint, (c) requires an outstanding, unconsumed nonce, (d) requires
signed-audience == challenge-audience == caller-expected-audience, (e) requires not-expired, then **consumes** the nonce.
Required at connection **and every unattended token request** (per ADR-0009) **and** migration/recovery.

**Status/revocation (ADR-0009).** `StatusListManager` assigns a stable index per connection and drives the bitstring;
`publish` refuses below a herd floor (T-56). The exchange re-checks status **per request** (a published
`BitstringStatusList` takes precedence over the in-process manager), so revocation takes effect within one exchange.

**Lifecycle (registry).** `install`/`importConnection` (DBX-24), `acknowledgeInstallation` (append-only, step 9),
`suspend`/`reactivate`/`revoke`, and supersession: `renew` (same key, predecessor→`superseded`), `rotateHolderKey`
(new key, old key retired into `keyHistory`, predecessor→`superseded`; T-33), `migrate` (new key, old key retired into
history **and predecessor→`revoked`** so obsolete access is dropped while provenance is preserved; T-48). `keyHistory`
carries forward across successive supersessions.

## 3. Provisional RFC 8693 seam (BLOCKED — ADR-0005/0006)

`ProvisionalTokenExchange.exchange` runs the full fail-closed ceremony and, only on success, returns a
`ProvisionalShortLivedToken` carrying `notWireFormat: true` and an explanatory `note`. It **models the outcome**
(audience-bound, 5-min, holder-thumbprint-keyed) and stops exactly where the RFC 8693 request/response bytes would be
produced. It embeds **no** reusable secret. This is the single seam DBX-14 / the LWS binding replaces once ADR-0005/0006
unblock.

## 4. Acceptance-gate bullets → tests → threats

| Gate bullet | Test | Threat |
|---|---|---|
| Credential bytes **without** a valid holder key fail | `ProvisionalTokenExchange` "denies credential bytes … without a valid holder proof"; `HolderKeyProof` "rejects a proof signed by a different key" | **T-17** |
| Replay against **another program** fails | `ProvisionalTokenExchange` "denies replay against a different program"; `Validator` "realm mismatch (…, T-08)" | **T-08** |
| **No** bearer/refresh token embedded | `Validator` `assertNoForbiddenKeys` "rejects a forbidden key anywhere"; issuer emits none | **T-18** |
| Revoked **and** expired fail | `ProvisionalTokenExchange` "denies a revoked credential", "published status list"; `Validator` "…out-of-window validity (expired)" | **T-19 / ADR-0009** |
| Migration preserves history, **not** obsolete access | `Registry` "migrates: predecessor revoked, history preserved"; "carries history forward" | **T-48** |
| Onboarding proof is nonce/audience-bound (replay fails) | `HolderKeyProof` "rejects replay of a consumed nonce", "audience mismatch", "expired", "nonce never issued" | **T-52 / T-19** |
| Key rotation retains key history | `Registry` "rotates the holder key, retiring the old key into history" | **T-33** |
| Status-list herd privacy | `BitstringStatusList` "publishes only above the herd-privacy floor" | **T-56** |

## 5. Barrel symbols to add to `src/databox/index.ts` (central owner — keep grouped/alphabetical)

```ts
// Connection credential lifecycle (C7/C9/C16, DBX-13)
export * from './credential/BitstringStatusList';
export * from './credential/ConnectionCredentialIssuer';
export * from './credential/ConnectionCredentialRegistry';
export * from './credential/ConnectionCredentialTypes';
export * from './credential/ConnectionCredentialValidator';
export * from './credential/Es256';
export * from './credential/HolderKeyProof';
export * from './credential/ProvisionalTokenExchange';
```

Key public symbols: `ConnectionCredentialIssuer`, `computeAccessGrantDigest`, `IssuanceRequest`, `IssuedConnectionCredential`,
`ConnectionCredentialValidator`, `assertNoForbiddenKeys`, `CredentialExpectations`, `ValidatedConnectionCredential`,
`HolderKeyProofVerifier`, `signHolderProof`, `BitstringStatusList`, `StatusListManager`, `ConnectionCredentialRegistry`,
`StoredConnection`, `ConnectionBundle`, `ProvisionalTokenExchange`, `ProvisionalShortLivedToken`, `DataboxConnectionCredential`,
`HolderBinding`, `ConnectionBinding`, `FORBIDDEN_CREDENTIAL_KEYS`, and the `Es256` primitives.

## 6. Commands + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx eslint src/databox/credential test/unit/databox/credential --max-warnings 0` | **PASS** (exit 0; only shared `@stylistic` deprecation notice) |
| `npx jest test/unit/databox/credential --coverage --collectCoverageFrom='src/databox/credential/**/*.ts' --coverageReporters=text` | **PASS** — 7 suites, **76 tests** (round 2); **All files 100%** stmts/branch/funcs/lines |

## 7. What DBX-14 and DBX-24 consume

- **DBX-14 (authorizer checks credential/relationship status):** consume `ConnectionCredentialValidator.validate`
  (per-request, with realm `CredentialExpectations`), `HolderKeyProofVerifier` for the fresh-proof gate, and
  `StatusListManager.isRevoked` / a published `BitstringStatusList` + `ConnectionCredentialRegistry.get(program,id).state`
  for the per-request relationship/status re-check (ADR-0009 prompt revocation). `ProvisionalTokenExchange` is the
  composed reference; DBX-14 replaces its `notWireFormat` result with the real RFC 8693 binding once ADR-0005/0006 unblock.
- **DBX-24 (vault imports):** consume `ConnectionBundle` + `ConnectionCredentialRegistry.exportConnection`/`importConnection`
  — a single-connection bundle that discloses **no** sibling connection (invariant 5), plus `install` +
  `acknowledgeInstallation` for the install ceremony steps 7–9.

## 8. Notes / limitations (honest)

- Nonce store, status manager and registry are **process-local/in-memory** reference impls; production needs a durable,
  shared, short-TTL nonce store + durable status/registry + KMS-held issuer key (see review gate). Interfaces are shaped
  for that swap.
- `Es256.verifyCompactJws` now wraps `crypto.verify` in try/catch (LOW-2): current Node/OpenSSL returns `false` for a
  malformed/wrong-length signature (the catch is `istanbul ignore`d as platform-dependent), older OpenSSL throws — both map
  to the same fail-closed rejection. The human crypto review should re-confirm on the production build.
- The JSON-LD `@context`/schema are **pinned identifiers**; this prompt does not ship the resolvable context/JSON-Schema
  documents (DBX-07/HAK-02 own the pinned RDF artifacts).
- RFC 8693 wire format is deliberately **not** invented (ADR-0005 Blocked).
- LOW-3 (credential-subject key **allowlist** instead of the current forbidden-key denylist) was **deferred** to keep the
  round-2 scope bounded; the denylist (`assertNoForbiddenKeys`, T-18) stands and is flagged for the human review gate.

## 9. Round-2 independent security-review fixes (all applied, each with a test)

| # | Sev | Fix (in `src/databox/credential/`) | New/updated test |
|---|---|---|---|
| **MED-1** | MED | `ProvisionalTokenExchange.assertNotRevoked` now **fails closed** when neither a `statusList` nor a `statusManager` resolves (was a silent pass). Revocation can no longer fail open. | `ProvisionalTokenExchange` "fails closed when NO status source is configured" |
| **MED-2** | MED | `ConnectionCredentialRegistry` takes an optional `StatusListManager`; `revoke` **and** every supersession (`renew`/`rotateHolderKey`/`migrate`) now flip the predecessor's **published** status bit (`setRevokedByIndex`), so a verifier reading only the published list also rejects it. | `Registry` "flips the published status bit on revoke", "…on migrate, preserving history" |
| **MED-3** | MED | Status index is now single-source-of-truth: `StatusListManager.register` returns the index issued into the credential; added `setRevokedByIndex`/`isRevokedByIndex`/`indexForConnection`; the exchange re-checks by the credential's **own** embedded `statusListIndex`, not a re-derived sequence. | `BitstringStatusList` "single source of truth for the index"; `ProvisionalTokenExchange` "denies a revoked credential … by the credential's own index" |
| **MED-4** | MED | The exchange now asserts `request.audience` equals the credential's bound `databox` (or `storageDescription`) before minting; a holder bound to box X cannot mint a token for box Y. | `ProvisionalTokenExchange` "denies a token whose audience is not the credential's bound databox" |
| **MED/LOW-5** | MED | `HolderKeyProofVerifier` now TTL-evicts `outstanding` on each issuance and bounds `consumed` (nonce → forget-after instant), so neither map grows without bound (DoS). | `HolderKeyProof` "evicts expired outstanding challenges…", "evicts consumed nonces once their window passes" |
| **LOW-1** | LOW | `verifyCompactJws` asserts `header.alg === ES256` before touching the signature (rejects `alg:none` and alg-swap). Applies to both the validator and the proof verifier (both route through it). | `Es256` "pins the algorithm…"; `Validator` "rejects an alg-swapped credential…" |
| **LOW-2** | LOW | `verifyCompactJws` wraps `crypto.verify` in try/catch → false (fail closed) for OpenSSL builds that throw; the misleading test comment claiming "caught and reported" is corrected to match runtime reality. | existing `Es256` "rejects a tampered/badly-encoded signature" (comment fixed) |
| **LOW-4** | LOW | `BitstringStatusList.encode` emits the multibase `u` prefix and `decode` requires/strips it (W3C Bitstring Status List v1.0); MSB-first bit order kept. | `BitstringStatusList` "encodes with the multibase 'u' prefix…", "rejects an encoded list missing the 'u' prefix or with bad gzip" |
| **LOW-3** | LOW | **Deferred** (see §8) — denylist retained, flagged for human review. | n/a |
