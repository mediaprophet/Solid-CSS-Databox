# DBX-05 — Test-Identification Scheme

**Prompt:** DBX-05 (Wave A). **Agent level:** Hard. **Depends on:** DBX-01, DBX-02, DBX-03, DBX-04.
**Status:** complete. **Companion:** [conformance requirements](dbx-05-conformance-requirements.md) (CR-ids).
**Consumed by:** DBX-25 (integration suite), DBX-26 (adversarial suite), DBX-27 (conformance/interop suite).

## 1. Purpose

This fixes **how conformance requirements (`CR-*`) map to test identifiers**, how those relate to the
existing DBX-03 adversarial tests (`AT-*`), and how the three downstream suites (DBX-25/26/27) consume them.
It is the stable id contract so a later prompt can author a test knowing exactly which requirement and which
threat it discharges — and which requirements are **blocked pending an unresolved decision** and therefore
must not be treated as testable yet.

## 2. Identifier namespaces

| Namespace | Meaning | Owner / authoring prompt | Stability |
|---|---|---|---|
| `CR-<CLASS>-nn` | Conformance requirement (this DBX-05 pair). `<CLASS>` ∈ {SRV, BRG, PRV, DEP, AGT}; compat matrix uses `CR-SRV-Cnn`. | DBX-05 | Stable; never renumbered; new req → new number |
| `T-nn` | Threat (DBX-03 threat model), 01–58 | DBX-03 | Stable |
| `AT-nn` | Adversarial test (DBX-03 backlog), 01–58, 1:1 with `T-nn` | DBX-03; **run by DBX-26** | Stable |
| `IT-nn` | Integration / positive-path test | **DBX-25** | Allocated here; authored by DBX-25 |
| `CT-nn` / `CT-Cnn` | Conformance test (Solid compat matrix, track separation, manifest, interop) | **DBX-27** | Allocated here; authored by DBX-27 |
| `EV-nn` | Evidence-verification test (offline receipt/ledger/proof verification harness) | **DBX-25/DBX-27** | Allocated here |

**Numbering rule (inherited from DBX-03).** IDs are stable and are the contract downstream prompts consume;
new tests get new numbers, they are never renumbered or reused. To avoid collisions:

- `AT-nn` keeps its DBX-03 range **01–58** and is **reused verbatim** wherever a CR restates a threat that
  already has an adversarial test — no new negative id is minted when an `AT-nn` already fits.
- `IT-nn`, `EV-nn` **mirror the number of the AT/threat they pair with** where one exists (e.g. `IT-08` is
  the positive-path partner of `AT-08`/`CR-SRV-18`… note the pairing is by requirement, see §4), and take
  fresh numbers ≥60 only where no threat maps.
- `CT-nn` is a fresh sequence for conformance/compat; `CT-Cnn` matches the `CR-SRV-Cnn` compat row it tests.

## 3. Suite responsibilities

| Suite | Prompt | Runs | Gate |
|---|---|---|---|
| Integration | **DBX-25** | `IT-*` (POS), and the positive-path equivalents of the `AT-*` P1 negatives | Granted capabilities work end-to-end (deposit, submission, retrieval, recovery, rotation, policy update) |
| Adversarial | **DBX-26** | `AT-*` (NEG) | **Every P1 `AT-*` must pass (fail-safe) before release**; reproduces the DBX-03 negatives independently |
| Conformance / interop | **DBX-27** | `CT-*` (compat matrix, track separation, manifest signing) + `EV-*` (offline verification) + the ADR-0025 interop proof | Solid surface preserved; ≥2 independent client stacks + 1 external issuer; two un-merged manifests |

A requirement is **release-blocking** if it carries a P1 `AT-*` test (isolation/identity/evidence) or is a
compat-matrix row (`CR-SRV-Cnn`). SHOULD-level and P2/P3 requirements are tracked but not release gates.

## 4. CR → test → threat mapping

Every non-blocked requirement maps to at least one runnable test. "NEG via" cites the reused `AT-*`.

### Server (`CR-SRV`)

| CR | Cat | Tests | Threat(s) | Suite |
|---|---|---|---|---|
| CR-SRV-01 | POS | IT-01, AT-01, AT-54 | T-01, T-54 | DBX-25/26 |
| CR-SRV-02 | NEG | AT-01 | T-01 | DBX-26 |
| CR-SRV-03 | NEG | AT-06, AT-07 | T-06, T-07 | DBX-26 |
| CR-SRV-04 | POS | IT-04, AT-06 | T-06 | DBX-25/26 |
| CR-SRV-05 | NEG | AT-35, AT-36 | T-35, T-36 | DBX-26 |
| CR-SRV-06 | POS | IT-06, AT-12 | T-12 | DBX-25/26 |
| CR-SRV-07 | NEG | AT-13 | T-13 | DBX-26 |
| CR-SRV-08 | NEG | AT-26, IT-08 | T-26 | DBX-25/26 |
| CR-SRV-09 | EVD | EV-09, AT-27 | T-27 | DBX-27 |
| CR-SRV-10 | EVD | EV-10, IT-10 | T-46 | DBX-25/27 |
| CR-SRV-11 | EVD | IT-11, EV-11 | T-24, T-39 | DBX-25/27 |
| CR-SRV-12 | NEG | AT-38 | T-38 | DBX-26 |
| CR-SRV-13 | POS | AT-39, AT-50 | T-39, T-50 | DBX-26 |
| CR-SRV-14 | EVD | IT-14, EV-14 | T-39 | DBX-25/27 |
| CR-SRV-16 | NEG | AT-21, AT-57 | T-21, T-57 | DBX-26 |
| CR-SRV-17 | NEG | AT-11, AT-53 | T-11, T-53 | DBX-26 |
| CR-SRV-18 | NEG | AT-17, AT-18, AT-19 | T-17, T-18, T-19 | DBX-26 |
| CR-SRV-19 | POS | IT-19, AT-49 | T-49 | DBX-25/26 |
| CR-SRV-21 | NEG | AT-31 | T-31 | DBX-26 |
| CR-SRV-25 | NEG | AT-25, IT-25 | T-25 | DBX-25/26 |
| CR-SRV-55 | EVD | AT-55 | T-55 | DBX-26 |
| **CR-SRV-22** 🔒 | NEG | AT-15 *(blocked)* | T-15 | *pending DBX-12* |

### Compat matrix (`CR-SRV-C`)

| CR | Tests | Threat(s) | Suite |
|---|---|---|---|
| CR-SRV-C01 | CT-C01 | — | DBX-27 |
| CR-SRV-C02 | AT-16, CT-C02 | T-16 | DBX-27 |
| CR-SRV-C03 | CT-C03 | — | DBX-27 |
| CR-SRV-C04 | CT-C04, AT-26 | T-26 | DBX-27 |
| CR-SRV-C05 | CT-C05, AT-42 | T-42 | DBX-27 |
| CR-SRV-C06 | CT-C06 | — | DBX-27 |
| CR-SRV-C07 | CT-C07, IT-06 | — | DBX-27 |
| CR-SRV-C08 | AT-43, CT-C08 | T-43 | DBX-27 |
| CR-SRV-C09 | CT-C09, IT-14 | — | DBX-27 |
| CR-SRV-C10 | AT-07, CT-C10 | T-07 | DBX-27 |

### Bridge / Provider / Deployment / Agent

| CR | Cat | Tests | Threat(s) | Suite |
|---|---|---|---|---|
| CR-BRG-01 | NEG | AT-02 | T-02 | DBX-26 |
| CR-BRG-02 | POS | IT-24, AT-24 | T-24 | DBX-25/26 |
| CR-BRG-03 | NEG | AT-23, IT-23 | T-23 | DBX-25/26 |
| CR-BRG-04 | EVD | EV-20, AT-20 | T-20 | DBX-26/27 |
| CR-BRG-05 | POS | IT-05, AT-03 | T-03, T-35 | DBX-25/26 |
| CR-BRG-06 | EVD | EV-06, AT-28 | T-28 | DBX-26/27 |
| CR-PRV-01 | NEG | AT-30, EV-30 | T-30 | DBX-26/27 |
| CR-PRV-02 | NEG | AT-31 | T-31 | DBX-26 |
| CR-PRV-03 | EVD | AT-32, EV-32 | T-32 | DBX-26/27 |
| CR-PRV-04 | POS | AT-33, EV-33 | T-33 | DBX-26/27 |
| CR-PRV-05 | NEG | AT-34 | T-34 | DBX-26 |
| CR-PRV-06 | NEG | AT-58 | T-58 | DBX-26 |
| CR-PRV-07 | NEG | AT-37 | T-37 | DBX-26 |
| **CR-PRV-08** 🔒 | NEG | *(blocked)* | T-30 | *pending ADR-0021 §residual* |
| CR-DEP-01 | EVD | CT-01 | — | DBX-27 |
| CR-DEP-02 | NEG | AT-42, CT-02 | T-42 | DBX-26/27 |
| CR-DEP-03 | POS | AT-04, CT-03 | T-04 | DBX-26/27 |
| CR-DEP-04 | NEG | AT-43, CT-08 | T-43 | DBX-26/27 |
| CR-DEP-05 | EVD | CT-05 | T-42 | DBX-27 |
| **CR-DEP-06** 🔒 | EVD | *(blocked)* | — | *pending DBX-07 legal-policy* |
| CR-AGT-01 | POS | AT-52 | T-52 | DBX-26 |
| CR-AGT-02 | NEG | AT-51, IT-51 | T-51 | DBX-25/26 |
| CR-AGT-03 | POS | AT-53, IT-03 | T-53 | DBX-25/26 |
| CR-AGT-04 | EVD | EV-46, IT-14 | T-39, T-46 | DBX-25/27 |
| CR-AGT-05 | POS | IT-05, AT-10 | T-10 | DBX-25/26 |

## 5. Blocked-pending-decision requirements

Three requirements are **blocked** and MUST NOT be scored as pass/fail until their unblocking input lands.
These are exactly the three Blocked items in [decisions/README §6](decisions/README.md); nothing else in the
matrix is unresolved. Each is recorded with a reserved test slot, never a green result.

| Requirement | What is blocked | Unblocking input (owner) | Blocks | Not blocked (proceed now) |
|---|---|---|---|---|
| **CR-SRV-22** 🔒 | Exact RFC 8693 wire semantics (subject- vs actor-token) binding the connection credential + fresh holder-key proof into the token exchange (IF-01). | The token-exchange ADR against the pinned LWS draft — **DBX-12** (with DBX-13). | The Track B unattended-sync token path; the finalisation of `AT-15` as a scored gate. | The **broker grant-lookup** behavior (a token for an ungranted realm is refused) is testable now via the Track A path (CR-SRV-07/CR-SRV-21); only the Track B *wire binding* is deferred. |
| **CR-PRV-08** 🔒 | Whether/how a high-assurance **provider-blind** encryption profile is offered. | Custodianship/legal determination (ADR-0002 + R-12 legal workstream) + key-custody design from a **named security reviewer**. | Only the provider-blind profile test (`EV-30` ciphertext-only variant). | **TLS in transit** and **at-rest per-tenant** encryption are decided and required now — CR-PRV-01 is fully testable. |
| **CR-DEP-06** 🔒 | Making a **legal-compliance release claim** (incl. the CDR profile of ADR-0023). | (1) legislation corpus ingested + content-digest-pinned; (2) authorized human attestation of the legal→ODRL mapping — a separate Hard legal-policy prompt via **DBX-07**. | Only the legal-compliance *claim*. | All technical work on **synthetic** policies (CR-SRV-25, IF-19 unattested-fail-closed) is explicitly **not** gated and is testable now. |

**Rule for suites.** DBX-26/DBX-27 MUST report a blocked requirement as `BLOCKED` (with the owning prompt),
never as `PASS` or `FAIL`. A release conformance report MUST list the three blocked items as open gates, not
silently omit them (mirrors the DBX-03 fail-closed discipline: an unverifiable claim is not a passing claim).

## 6. Test-id ranges (allocation summary)

| Range | Namespace | Status |
|---|---|---|
| AT-01 … AT-58 | Adversarial (DBX-03) | Defined; reused by DBX-05 negatives 1:1 with threats |
| IT-01 … IT-25 | Integration positive | Allocated here (mirror the requirement/threat number); authored by DBX-25 |
| IT-60 + | Integration positive (no threat partner) | Reserved for DBX-25 |
| EV-06 … EV-33, EV-46 | Evidence verification | Allocated here; authored by DBX-25/27 |
| CT-01 … CT-08 | Conformance (manifest/track/CORS/topology) | Allocated here; authored by DBX-27 |
| CT-C01 … CT-C10 | Conformance (Solid compat matrix rows) | Allocated here; authored by DBX-27 |

## 7. Self-check

- **Every non-blocked CR maps to ≥1 runnable test** (§4) whose suite owner is named (§3).
- **Negatives reuse existing `AT-*` 1:1 with threats** — no duplicate negative ids minted; positives/evidence
  take mirrored or ≥60 numbers to avoid collision.
- **Blocked requirements carry reserved slots, never green results** (§5), and name their unblocking input +
  owner from decisions/README §6.
- **Release gate is explicit:** P1 `AT-*` + all `CR-SRV-Cnn` compat rows must pass; the three 🔒 items are
  reported as open gates.
