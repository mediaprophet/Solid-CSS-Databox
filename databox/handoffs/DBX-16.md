# Handoff — DBX-16

**Prompt:** DBX-16 — Verifiable record proof validation (component C7/C16 record proof, DBX-04 §7.1 deposit
trace validates signature/status BEFORE accept; ADR-0020, ADR-0007, ADR-0014, ADR-0025).
**Status:** complete, **round 2 (independent security review) applied** (see §10). BOTH tsc clean, eslint
clean, **100% coverage** on every `src/databox/proof/**/*.ts`, **71 tests**.
**Agent level:** Hard — REAL cryptographic security code. Independent security review CONFIRMED the two
headline properties (verifying key never from attacker data; exact-payload digest collision/mutation-safe),
no High findings; MED/LOW findings fixed in round 2. **Residual human cryptographic review gate is OPEN**
(see §7).
**Baseline:** Community Solid Server 7.1.9.
**Depends on / REUSES (consumed via imports, not modified):** DBX-13 `credential/Es256` (the reviewed,
hardened ES256 verify — alg pinned to ES256, raw `r||s`, no header-key trust — **reused, not
reimplemented**), DBX-13 `credential/BitstringStatusList` (status bit read), DBX-13
`credential/ConnectionCredentialTypes` (shared VC 2.0 / `PublicJwk` / alg constants), DBX-15 gateway
(`GatewayAcceptance.payloadDigest` is the exact accepted-payload digest a record binds; the gateway invokes
this validator during the deposit trace), DBX-06 profile (trusted issuers are a per-program profile choice).
**Decisions honoured:** ADR-0020 (same suite as the connection credential: VC 2.0 / VC-JOSE-COSE / ES256;
BitstringStatusList status; pinned+versioned canonicalization with exact accepted-payload-digest
preservation; offline bundle with pinned-by-hash contexts; trusted-issuer + key-history enforcement;
valid≠true first-class fields), ADR-0014/0015 (record binds compiled-policy/profile/corpus digests, not a
version string — review #18), ADR-0025/S-14 (offline verification, pinned contexts fail closed).

## 1. Files created (within permitted DBX-16 paths only)

| File | Purpose |
|---|---|
| `src/databox/proof/RecordProofTypes.ts` | Types + pinned constants: `RECORD_PROOF_ALG`(=ES256)/`RECORD_PROOF_JWS_TYP`/`RECORD_PROOF_MEDIA_TYPE`, `DBX_RECORD_CONTEXT`, `DATABOX_RECORD_CREDENTIAL_TYPE`, `DATABOX_RECEIPT_CREDENTIAL_TYPE`, `PINNED_CANONICALIZATION_ALG`, valid≠true vocabularies `RECORD_METHODS`/`VERIFICATION_STATUSES`, `RecordClaimBinding`/`DataboxRecordCredential`/`RecordStatusReference`, `IssuerKeyDescriptor`, `RecordVerification`, `VALIDITY_NOT_TRUTH_CAVEAT`, and `mayPresentAsAttested`. |
| `src/databox/proof/Canonicalization.ts` | `canonicalize` (RFC 8785-style JCS, never mutates input), `canonicalDigest`, `digestOfBytes` (EXACT bytes, no canonicalization), `normalizeSha256`, `PINNED_CANONICALIZATION_ALG` (`dbx-jcs/1.0.0`). |
| `src/databox/proof/OfflineVerification.ts` | `PinnedContextSet` (`assertAllowed`/`verifyCarried`) + `PINNED_RECORD_CONTEXT_URLS` + `CarriedContext` — pinned-by-hash context enforcement, unpinned/remote/mutated contexts fail closed (T-21). |
| `src/databox/proof/IssuerTrustStore.ts` | `IssuerTrustStore` — per-program trusted-issuer + key-history resolver (`resolve(issuer, kid, issuanceTime)`); key comes from the store, never the token (T-20). |
| `src/databox/proof/RecordProofValidator.ts` | `RecordProofValidator` orchestrator + `RecordProofContext` + `StatusListResolver`. Also the **barrel entry** (`export *` of the four siblings). |
| `test/unit/databox/proof/*.test.ts` (5 suites) + `RecordTestSupport.ts` | Positive + negative fixtures per threat; keys generated at test time with `node:crypto` (never hardcoded); 63 tests. |

`src/databox/index.ts` was **NOT** edited (forbidden). No credential/gateway/profile dir was modified — all
consumed via imports.

## 2. Design — proof suite, canonicalization, key history, status

**Validation order (fail closed at each step; §7.1 validates signature/status BEFORE accept):**
decode header/payload (UNVERIFIED, only to read `issuer` + `kid` + `validFrom`) → typ==`vc+jwt` → **pinned
contexts** (every `@context` URL pinned; carried contexts hash-match, T-21) → **resolve trusted key** from
the program `IssuerTrustStore` by `(issuer, kid, issuanceTime)` — never the header/payload key (T-20) →
**authenticity** via the reused `Es256.verifyCompactJws` (alg-swap structurally denied) → **shape** (VC 2.0
+ record/receipt type, pinned canonicalization id, `urn:sha256` payloadDigest, valid≠true fields) →
**validity window** (`now ∈ [validFrom, validUntil)`; validUntil optional) → optional addressed-class bind →
**integrity** (exact accepted-payload digest preserved and matches; altered bytes fail) → **status**
(BitstringStatusList resolves and is not revoked/suspended; unreachable = fail closed).

**Proof suite (ADR-0020 §1/§2).** Deliberately the **same** as the connection credential: VC 2.0 /
VC-JOSE-COSE / **ES256** (`application/vc+jwt`), status by **BitstringStatusList**. The ES256 core is the
DBX-13 `Es256` module reused verbatim — this validator adds no new raw crypto, keeping the human-review
surface a single small module.

**Canonicalization + exact digest (ADR-0020 §3).** `canonicalize` is a pinned, versioned JCS
(`dbx-jcs/1.0.0`): members sorted by code unit, minimal separators, ECMAScript number formatting, non-finite
and non-serialisable values fail closed; **it never mutates the input** (tested against a frozen object). Two
distinct digests: `digestOfBytes` is the sha256 of the EXACT accepted bytes (preserved, never re-serialised —
this is the digest DBX-15 produced and DBX-18 receipts bind), and `canonicalDigest` is the reproducible
digest of the whole record credential (`recordDigest`). A record declaring any other canonicalization id is
rejected as unreproducible.

**Trusted issuer + key history (ADR-0020 §6, T-20).** The store is per-program (trusted issuers are a
profile choice). `resolve` fails closed on an unknown issuer/kid (substituted key), a `revoked`/compromised
key (rejected even for historical records — the stolen-key case), or a key used outside its
`[validFrom, validUntil)` window. A `rotated` key still verifies records issued **within** its window (a
since-rotated key keeps historical records verifiable) but cannot mint new ones (issuance ≥ validUntil is
refused). Reading `validFrom` from the unverified payload to select the window is safe: verification still
requires the real private key, which a clean-rotated key no longer has.

**Status (ADR-0020 §2).** The record's `BitstringStatusListEntry` is resolved via an injected
`StatusListResolver`; an unreachable list fails closed (never assumed "not revoked"), a set bit rejects.

## 3. Validity ≠ truth (review #13, ADR-0020 §4)

The proof attests **issuer, integrity and issuance time — not the truth or human-attestation of the claim.**
Every record carries first-class `author` / `method` / `verificationStatus` / (optional) issuer-proposed
`attester`. `RecordProofValidator.validate` returns a `RecordVerification` only when **cryptographically
valid** (any crypto/integrity/status failure throws), and that result surfaces the distinction:
`cryptographicallyValid: true` always, plus `humanAttested` and `requiresHumanAttestation`, and a verbatim
`VALIDITY_NOT_TRUTH_CAVEAT`.

**M1 hardening (round 2, see §10).** Human attestation is INDEPENDENT of the issuer's signature: an
`attester` inside the issuer's own JWS is *issuer-proposed*, not independent human attestation (a T-20 actor
could stamp any attester and flip a machine claim to "attested"). Independent attestation requires a separate
proof over the record digest by a key in a distinct attester trust set — **not built yet (residual, DBX-20)**
— so `humanAttested` is currently **always `false`** and `mayPresentAsAttested()` returns **false for every
verified record**. The issuer's proposed attester is surfaced only as `claim.issuerProposedAttester`,
explicitly non-authoritative. Asserted in the `validity is not truth` suite (including the M1 test that an
issuer self-asserted attester on a machine record is NOT attested).

## 4. Threats mitigated (DBX-03)

- **T-20 (stolen bridge signing key forges records):** the key is resolved from the program trust store, not
  the JWS header/payload; a `revoked`/compromised key never verifies (even historical records); an unknown
  issuer/kid is refused; a retired key cannot mint records dated after its retirement.
- **T-21 (malicious / substituted JSON-LD context):** `PinnedContextSet` refuses any `@context` URL not in
  the pinned allowlist and rejects a carried context whose content does not hash to its pin — the verifier
  never fetches or expands a remote context (offline, S-14).
- **T-25 (policy substitution):** the record binds compiled-policy/profile/corpus **digests** (review #18),
  and the exact accepted-payload digest is preserved and re-checked — a substituted payload or policy fails
  the integrity/digest comparison.

## 5. Barrel symbols (NO edit to `src/databox/index.ts`)

`src/databox/index.ts` is forbidden to edit and has no `proof/` line. Following the DBX-11/14/15
sibling-re-export pattern, `RecordProofValidator.ts` `export *`s the four siblings, so **one line** added
later by whoever wires C7/C16 propagates every DBX-16 symbol:

```ts
// add to src/databox/index.ts (Record/receipt proof validation C7/C16, DBX-16):
export * from './proof/RecordProofValidator';
```

Public symbols reachable through it: `RecordProofValidator`, `RecordProofContext`, `StatusListResolver`;
`RecordProofTypes` (`RECORD_PROOF_ALG`, `RECORD_PROOF_JWS_TYP`, `RECORD_PROOF_MEDIA_TYPE`,
`DBX_RECORD_CONTEXT`, `DATABOX_RECORD_CREDENTIAL_TYPE`, `DATABOX_RECEIPT_CREDENTIAL_TYPE`,
`BITSTRING_STATUS_LIST_ENTRY_TYPE`, `VC_V2_CONTEXT`, `VERIFIABLE_CREDENTIAL_TYPE`, `RECORD_METHODS`,
`RecordMethod`, `VERIFICATION_STATUSES`, `RecordVerificationStatus`, `RecordClaimBinding`,
`DataboxRecordCredentialSubject`, `RecordStatusReference`, `DataboxRecordCredential`, `IssuerKeyDescriptor`,
`RecordVerification`, `VALIDITY_NOT_TRUTH_CAVEAT`, `mayPresentAsAttested`); `Canonicalization`
(`PINNED_CANONICALIZATION_ALG`, `canonicalize`, `normalizeSha256`, `digestOfBytes`, `canonicalDigest`);
`OfflineVerification` (`PINNED_RECORD_CONTEXT_URLS`, `CarriedContext`, `PinnedContextSet`); `IssuerTrustStore`.

## 6. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) — the second invocation catching test-project type errors the hook misses |
| `npx jest test/unit/databox/proof --coverage --collectCoverageFrom='src/databox/proof/**/*.ts' --coverageReporters=text` | **PASS** — 5 suites, **71 tests** (round 2); **All files 100%** stmts/branch/funcs/lines. |
| `npx eslint src/databox/proof test/unit/databox/proof --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice) |

Per constraint 4: did NOT run `git add`/`commit`, `npm run build`, or `npm ci`. Only the two tsc invocations,
scoped jest, scoped eslint.

## 7. Residual HUMAN cryptographic review gate (OPEN)

ADR-0020 records a residual cryptographer sign-off; DBX-16 does **not** clear it. The named cryptographer
must sign off, before production, on: (a) the pinned proof suite as implemented (ES256 via the reused
`Es256` core — confirm the reuse is complete and no raw crypto was added here); (b) the frozen
canonicalization algorithm+version (`dbx-jcs/1.0.0`), that the exact accepted-payload-digest preservation is
correct, AND the **round-2 M2 domain restriction** — `recordDigest` is only reproducible over a portable
domain (finite decimals `<1e21`, `-0` normalised to `0`, NFC strings); values outside it fail closed. Confirm
that restriction is acceptable for all record shapes; (c) the **concrete pinned context content hashes** and
the trusted-issuer/key-history set values (this code takes them as injected config — `PinnedContextSet` and
`IssuerTrustStore` — precisely so the cryptographer/compatibility-manifest pins the real values, per ADR-0020
§Open sub-questions); (d) the key-history window semantics (rotated-still-verifies vs revoked-always-fails);
(e) **round-2 M1** — attestation is currently **issuer-proposed, NOT human-attested** (`humanAttested` always
`false`); the **separate independent-attestation-proof mechanism** (a distinct attester trust set signing the
record digest) is a residual owned by the **legal-policy / DBX-20 workstream** and must be designed and
reviewed there before any record is presented as human-attested; (f) **round-2 L2 (unchanged residual)** —
the key-history window uses the record's self-asserted issuance time to pick the key; this is safe against
forgery (verification still needs the real private key, which a cleanly-rotated key no longer holds) but
relies on prompt revocation of a compromised key via `status:'revoked'`. This code is the mechanism; the
pinned values and the sign-off are the gate.

## 8. What DBX-18 (receipts bind the digest) consumes

- `RecordVerification.payloadDigest` — the **exact accepted-payload digest**, preserved verbatim (the same
  `GatewayAcceptance.payloadDigest` from DBX-15). A DBX-18 acceptance receipt binds this as the immutable
  record identity (ADR-0019/0018).
- `RecordVerification.recordDigest` — `canonicalDigest` of the record credential, reproducible by any
  verifier under the pinned canonicalization; available for the receipt's evidence chain.
- The valid≠true fields (`humanAttested`, `requiresHumanAttestation`, `claim`, `caveat`) — so a receipt
  never over-claims a machine-proposed interpretation as attested.
- `digestOfBytes` / `canonicalDigest` / `PINNED_CANONICALIZATION_ALG` — the same digest primitives DBX-18
  uses so the receipt's bound digest is byte-identical to the record's.

## 9. Notes / limitations (honest)

- **This is the C7/C16 record-proof mechanism only.** It verifies a record/receipt proof and returns a
  `RecordVerification`; it does not issue records, wire into the HTTP pipeline, or run the §7.0 commit. The
  gateway (DBX-15) invokes it during the deposit trace; DBX-18 issues receipts.
- **Pinned context hashes and the trusted-issuer/key set are injected, not hardcoded** (ADR-0020 §Open
  sub-questions) — see §7. The allowlisted context URLs are fixed here; their content hashes are a
  deployment/cryptographer value.
- **Offline JSON-LD safety is by pinned-hash + no-fetch, not full JSON-LD processing.** The validator never
  expands or dereferences a context (T-21); a production JSON-LD processor, if ever added, must run with
  remote fetch disabled behind the same `PinnedContextSet` contract.

## 10. Round-2 fixes (independent security review)

The review CONFIRMED the two headline properties hold (the verifying key is never taken from attacker data;
the exact-payload digest is collision/mutation-safe) with **no High findings**. The MED/LOW findings were
fixed in `src/databox/proof/`, each with an added test, keeping 100% coverage and both tsc + eslint clean.

- **M1 (MED) — self-asserted human attestation.** `humanAttested`/`mayPresentAsAttested` were derived from
  `record.attester` being a non-empty string in the ISSUER's OWN JWS, so a compromised/automated bridge (the
  T-20 actor) could stamp any attester and flip a machine record to "attested", collapsing validity≠truth.
  **Fix (`RecordProofValidator.buildResult`, `RecordProofTypes.RecordVerification`):** the issuer's attester
  is now modelled as `claim.issuerProposedAttester` (issuer-PROPOSED, not attested). `humanAttested` is
  hard-`false` and `mayPresentAsAttested()` never returns `true` until a SEPARATE independently-verified
  attestation proof over the record digest (a distinct attester trust set) exists — that mechanism is a
  residual owned by legal-policy / **DBX-20**. Test updated: machine-generated + issuer attester → NOT
  attested.
- **M2 (MED) — non-deterministic canonicalization.** `canonicalize` delegated numbers to `JSON.stringify`
  (exponential forms for `|value|>=1e21`, `-0`) and did no Unicode normalization, so `recordDigest` could
  differ across implementations. **Fix (`Canonicalization.serialize`):** reject non-finite numbers and any
  number whose ECMAScript rendering is exponential (`|value|>=1e21` / subnormal), normalise `-0`→`0`, and
  require strings to be Unicode **NFC** (reject non-NFC) — fail closed outside the portable decimal/NFC
  domain. `digestOfBytes` (exact accepted-payload digest) is unchanged. Tests added: `>=1e21` rejected, in
  -domain `1e20` deterministic, `-0` handled, non-NFC string rejected.
- **L1 (LOW) — revoked-duplicate shadowing.** `IssuerTrustStore.resolve` used `.find` (first match), so a
  later `revoked` duplicate of `(issuer, kid)` was never consulted behind an earlier active entry. **Fix:**
  `resolve` now rejects if **ANY** matching descriptor is `revoked`. Test added (active-then-revoked → reject),
  both at the store unit level and end-to-end through `validate`.
- **L3 (tests) — added:** end-to-end-through-`validate()` for a rotated key issued WITHIN its window (passes)
  and AFTER retirement (fails); and an explicit test that a header-embedded `jwk`/`kid` cannot influence key
  selection (attacker signs with their own key + embeds their `jwk` and the trusted `kid` → still rejected,
  because the key comes from the store).
- **L2 — documented residual (unchanged).** The key-history window uses the record's self-asserted issuance
  time; safe against forgery (verification needs the real private key), relies on prompt revocation. Recorded
  for the human crypto gate in §7(f).
