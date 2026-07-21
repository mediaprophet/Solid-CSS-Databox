# Handoff — DBX-18

**Prompt:** DBX-18 — Signed acceptance receipts + canonical payload digests (component C13/C19, IF-06;
ADR-0019, ADR-0014, ADR-0020, ADR-0007; DBX-04 §7.0 commit protocol).
**Status:** complete. BOTH tsc clean, eslint clean, **100% coverage** on every `src/databox/receipt/**/*.ts`,
**78 tests** across 5 suites.
**Agent level:** Hard — REAL cryptographic security code. **Residual HUMAN cryptographic review gate is
OPEN** (see §7).
**Baseline:** Community Solid Server 7.1.9.
**Depends on / REUSES (consumed via imports, not modified):** DBX-13 `credential/Es256` (the reviewed,
hardened ES256 `signCompactJws`/`verifyCompactJws` — **reused, no new raw crypto**), DBX-16
`proof/Canonicalization` (`digestOfBytes` = the EXACT accepted-payload digest a receipt binds;
`canonicalDigest`; `normalizeSha256`; `PINNED_CANONICALIZATION_ALG`), DBX-16 `proof/RecordProofTypes`
(pinned suite constants + `DATABOX_RECEIPT_CREDENTIAL_TYPE`), DBX-16 `proof/IssuerTrustStore` (key-history
resolver, so a since-rotated key still verifies a receipt — T-28), DBX-15 `gateway/GatewayTypes`
(`GatewayAcceptance.payloadDigest`/idempotency key are the receipt's inputs — conceptual, not imported).
**Decisions honoured:** ADR-0019 (receipt content + binding, receipt states, never-before-commit,
idempotent replay, receipt-survives-deletion), ADR-0014/0015 (compiled-policy + corpus/attestation/evaluator
binding — a version STRING alone is insufficient, review #18; legal bundle injected, law never interpreted),
ADR-0020/0007 (same VC 2.0 / VC-JOSE-COSE / ES256 suite), DBX-04 §7.0 (receipt only after durable C13
commit, IF-05/IF-06).

## 1. Files created (within permitted DBX-18 paths only)

| File | Purpose |
|---|---|
| `src/databox/receipt/ReceiptTypes.ts` | Pure types + pinned constants. Re-exports the DBX-16 suite constants (single source of truth); `RECEIPT_STATES` vocabulary + `receiptStateOrdinal`; `RECEIPT_OPERATIONS`; `LegalPolicyBinding`; `AcceptanceReceiptBinding`/`AcceptanceReceiptSubject`/`DataboxAcceptanceReceiptCredential`; `SignedAcceptanceReceipt`. Documents **why a receipt carries NO `credentialStatus`** (must verify offline, independent of a live status list — T-28). |
| `src/databox/receipt/DurableCommit.ts` | The no-receipt-before-commit dependency: `DurableCommit` (confirmed-`true` C13 signal + committed digest), `assertDurableCommit` (fail-closed gate), `DurableCommitCoordinator` (§7.0 commit-point model; before `confirm`, `signalFor` is `undefined` → the signer cannot issue). |
| `src/databox/receipt/ReceiptStateProgression.ts` | `ReceiptStateJournal` — append-only, monotonic state progression; first state must be `accepted`, each later state strictly forward; every transition is an evidence event, never an overwrite; defensive-copy `history()`. |
| `src/databox/receipt/AcceptanceReceiptVerifier.ts` | `AcceptanceReceiptVerifier` — **offline** verify: key resolved from the program `IssuerTrustStore` by `(issuer, kid, acceptedAt)` (never the header), reused `verifyCompactJws`, shape + valid-vs-legal binding checks, exact-payload-digest integrity when record bytes supplied. Never touches a live resource/URL/status list. |
| `src/databox/receipt/AcceptanceReceiptSigner.ts` | `AcceptanceReceiptSigner` (reuses `signCompactJws`), `ReceiptRegistry` (idempotency-key → original receipt), `AcceptanceReceiptRequest`/`IssuedReceipt`. Also the **barrel entry** (`export *` of the four siblings). |
| `test/unit/databox/receipt/*.test.ts` (5 suites) + `ReceiptTestSupport.ts` | Positive + negative fixtures; keys generated at test time via `node:crypto` (never hardcoded); 78 tests. |

`src/databox/index.ts` was **NOT** edited (forbidden). No credential/proof/gateway/storage dir was modified —
all consumed via imports.

## 2. Design — receipt shape, signer/verifier, states, legal binding

**Receipt shape (ADR-0019 §Receipt content; exchange-and-evidence.md §Signed receipt).** A W3C VC 2.0
credential (`[VerifiableCredential, DataboxAcceptanceReceipt]`) whose `credentialSubject.receipt` binds every
immutable fact: transaction id, assigned resource URI, **exact accepted-payload digest** (the DBX-16
`digestOfBytes`, `urn:sha256:<hex>`), pinned canonicalization id, sender + addressed program relationship
(opaque/pairwise), server acceptance time, operation type, profile version **and** digest, compiled-policy
digest, ODRL policy id + duties **activated** by acceptance, optional idempotency key, the C13
`commitEventId`, optional legal binding, and `state:'accepted'`. Secured as an `application/vc+jwt` ES256
compact JWS via the reused `Es256.signCompactJws` — no new raw crypto.

**Signer (`AcceptanceReceiptSigner.issue`).** Order: (1) **idempotent replay first** — a seen idempotency key
returns the ORIGINAL signed receipt from `ReceiptRegistry` (`duplicate:true`), never a new one (T-24); (2)
`assertDurableCommit` — fail closed on an absent/unconfirmed signal (**no receipt before durable commit**);
(3) cross-check the receipt `payloadDigest` equals the durably-committed digest (the receipt attests the exact
committed bytes); (4) validate every field, build + sign, store under the idempotency key, return.

**Verifier (`AcceptanceReceiptVerifier.verify`) — offline & provider-independent (T-28).** Resolves the key
from the injected program `IssuerTrustStore` keyed by acceptance time (a since-**rotated** key still verifies;
a **revoked**/substituted key fails closed), verifies with the reused hardened `verifyCompactJws` (alg-swap
denied), asserts shape + binding, and — when the record bytes are supplied — recomputes `digestOfBytes` and
requires it to equal the bound `payloadDigest`. It dereferences **nothing**: not the resource, not a URL, not
a status list. An altered receipt (signature) or altered record bytes (digest) fail.

**Receipt states (`ReceiptStateJournal`).** `accepted → notified → retrieved → acknowledged → reviewed →
disposed` as an **append-only monotonic progression**: first must be `accepted`, each subsequent strictly
forward, no repeat/regression; every append is a recorded evidence event, not an overwrite; `disposed` is
terminal.

**Legal-policy binding (review #18, ADR-0014/0015).** `LegalPolicyBinding` carries compiled-policy digest,
corpus-manifest digest, attestation id and evaluator version. It is **injected** into the request from an
already-compiled legal bundle and copied verbatim (all four fields required non-empty); this code **never
interprets law** (ADR-0015 boundary). A bare policy-version string is insufficient and is never the binding.

## 3. No-receipt-before-durable-commit handling

`DurableCommit.confirmed` is the literal `true` C13 durable-confirm signal (§7.0 = a single-store C13 txn is
the commit point). `assertDurableCommit` fails closed on absent/unconfirmed/malformed input, so `issue`
cannot produce a receipt for an uncommitted deposit. `DurableCommitCoordinator` models the ordering: before
`confirm(transaction, …)`, `signalFor(transaction)` is `undefined` and issuance is impossible; after the
durable commit, the same operation issues. A repeated `confirm` returns the ORIGINAL commit (idempotent).
Asserted end to end: **no signal → throws, no receipt; after commit → receipt** (`AcceptanceReceiptSigner`
suite).

## 4. Threats mitigated (DBX-03)

- **T-24 (idempotency / duplicate delivery):** a duplicate idempotency key returns the ORIGINAL signed
  receipt (same `jws`) from `ReceiptRegistry`, never a second logical receipt.
- **T-28 (provider deletes/alters record then challenges the receipt):** the receipt verifies **offline** from
  its own bytes + a retained key (no live resource/status list), and binds the exact payload digest — a
  provider that deletes and re-creates a different record cannot make it verify; a since-rotated signing key
  still verifies via `IssuerTrustStore` key history.
- **T-46 (repudiation):** any altered byte in the receipt breaks the ES256 signature (fail closed); the receipt
  is the party's portable, independently verifiable proof of acceptance.

## 5. Barrel symbols (NO edit to `src/databox/index.ts`)

`src/databox/index.ts` is forbidden to edit and has no `receipt/` line. Following the DBX-11/14/15/16
sibling-re-export pattern, `AcceptanceReceiptSigner.ts` `export *`s the four siblings, so **one line** added
later by whoever wires C13/C19 propagates every DBX-18 symbol:

```ts
// add to src/databox/index.ts (Signed acceptance receipts C13/C19, DBX-18):
export * from './receipt/AcceptanceReceiptSigner';
```

Public symbols reachable through it: `AcceptanceReceiptSigner`, `ReceiptRegistry`, `AcceptanceReceiptRequest`,
`IssuedReceipt`; `AcceptanceReceiptVerifier`, `ReceiptVerificationContext`, `ReceiptVerification`;
`DurableCommit`, `assertDurableCommit`, `DurableCommitCoordinator`; `ReceiptStateJournal`, `ReceiptStateEvent`;
`ReceiptTypes` (`RECEIPT_STATES`, `ReceiptState`, `receiptStateOrdinal`, `RECEIPT_OPERATIONS`,
`ReceiptOperation`, `LegalPolicyBinding`, `AcceptanceReceiptBinding`, `AcceptanceReceiptSubject`,
`DataboxAcceptanceReceiptCredential`, `SignedAcceptanceReceipt`, and the re-exported suite constants
`RECORD_PROOF_ALG`/`RECORD_PROOF_JWS_TYP`/`RECORD_PROOF_MEDIA_TYPE`/`DATABOX_RECEIPT_CREDENTIAL_TYPE`/
`PINNED_CANONICALIZATION_ALG`/`VC_V2_CONTEXT`/`VERIFIABLE_CREDENTIAL_TYPE`/`DBX_RECORD_CONTEXT`).

## 6. Commands run + results

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npx tsc -p test --noEmit` | **PASS** (exit 0) — the second invocation catching test-project type errors the pre-commit hook misses |
| `npx jest test/unit/databox/receipt --coverage --collectCoverageFrom='src/databox/receipt/**/*.ts' --coverageReporters=text` | **PASS** — 5 suites, **78 tests**; **All files 100%** stmts/branch/funcs/lines. |
| `npx eslint src/databox/receipt test/unit/databox/receipt --max-warnings 0` | **PASS** (exit 0; only the shared `@stylistic` deprecation notice) |

Per constraint 4: did NOT run `git add`/`commit`, `npm run build`, or `npm ci`. Only the two tsc invocations,
scoped jest, scoped eslint. Test keys are generated at test time with `node:crypto`; no key is hardcoded.

## 7. Residual HUMAN cryptographic review gate (OPEN)

ADR-0019 (and ADR-0020) record a residual cryptographer sign-off; DBX-18 does **not** clear it. The named
cryptographer must sign off, before production, on: (a) the receipt proof suite as implemented (ES256 via the
reused `Es256` core — confirm the reuse is complete and no raw crypto was added here); (b) that **no
`credentialStatus` on the receipt** is the correct choice for offline/provider-independent verification (a
receipt must not fail because a live status list is unreachable — T-28), and the retained signing-key-history
verification path (`IssuerTrustStore`: rotated-still-verifies vs revoked-always-fails); (c) that the receipt
binds the **exact accepted-payload digest** from DBX-16 and the digest cross-check against the durable-commit
signal is sufficient; (d) the concrete **legal bundle values** (compiled-policy/corpus/attestation/evaluator
digests) — this code takes them as an INJECTED reference and only enforces presence, precisely so the
legal-policy workstream / ADR-0014 pins the real values (law is never interpreted here); (e) the placement of
the receipt issuance strictly **after** the durable C13 commit in the real commit path (this module models the
dependency; DBX-19 owns the durable WORM/hash-chain ledger and the actual §7.0 transaction). This code is the
mechanism; the pinned values and the sign-off are the gate.

## 8. What DBX-19 / DBX-21 consume

- **DBX-19 (evidence ledger binds receipts):** `SignedAcceptanceReceipt` (credential + `jws` + `receiptId`)
  and `ReceiptVerification.receiptDigest` (the `canonicalDigest` of the receipt credential) are what the
  append-only, external, hash-chained ledger anchors. `DurableCommit`/`DurableCommitCoordinator` are the seam
  DBX-19 replaces with the real §7.0 single-store C13 transaction (`commitEventId` is already bound into every
  receipt). The receipt-issued-only-after-durable-commit invariant is enforced here and preserved by DBX-19.
- **DBX-21 (notification / duty states):** `ReceiptStateJournal` + `RECEIPT_STATES`
  (accepted/notified/retrieved/acknowledged/reviewed/disposed) are the append-only progression DBX-21 drives —
  a `notified` transition is a hint that never rewrites `accepted`, and each transition is an evidence event
  mapping onto the ADR-0012 duty states. `AcceptanceReceiptBinding.activatedDuties` names the duties activated
  at acceptance that DBX-21's duty state machine advances.

## 9. Notes / limitations (honest)

- **This is the C13/C19 receipt mechanism only.** It signs/verifies a `DataboxAcceptanceReceipt` and models
  the durable-commit dependency + state progression; it does not run the real §7.0 C13 transaction, persist to
  a WORM/hash-chain ledger, or wire into the HTTP pipeline (DBX-19/gateway do that).
- **The durable-commit signal and the idempotency/receipt stores are in-memory reference implementations**
  (mirroring `gateway/IdempotencyRegistry` and the storage registries) — a durable store swaps in behind the
  same surface. The invariants (no-receipt-before-commit, idempotent-replay-returns-original) are structural,
  not storage-dependent.
- **The trusted-issuer/key set and the legal bundle are injected, not hardcoded** (see §7) — the concrete
  values are a deployment/cryptographer/legal-policy responsibility.
