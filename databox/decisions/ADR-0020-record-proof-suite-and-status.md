<!--
ADR — Databox decision register (DBX-02). Cluster: exchange & evidence.
Follows decisions/ADR-TEMPLATE.md exactly.
-->
# ADR-0020 — Verifiable record proof suite and credential status format

- **Status:** Adopted
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** cryptography — pinning a proof suite, canonicalization and status format is a cryptographic decision and requires a named cryptographer to sign off before production; the hackathon scope is adoptable now.
- **Sources adjudicated:** HD-05 (credential format); review-item #18 (bind digest/attestation, not a string); review-item #13 (machine output "valid" ≠ "attested/true"); S-14 (offline verification bundle, pinned contexts/hashes); identity-and-access.md record-credential row.
- **Consumed by / blocks prompts:** DBX-16, HAK-06, HAK-07 (record/receipt issuance and verification).
- **Relates to:** ADR-0007 (Databox Connection Credential — same proof suite for consistency), ADR-0019 (receipts use this suite and status), ADR-0018 (records whose bytes are digest-bound).

## Context

Records (receipts, warranties, determinations — identity-and-access.md "Record credential" row) and acceptance receipts (ADR-0019) must be independently verifiable, offline, without dereferencing mutable or organisation-private contexts (S-14). Review-item #18 requires binding to digests and attestation identifiers rather than a version string. Review-item #13 requires distinguishing a *cryptographically valid* signature from an *attested/true claim*: a valid proof over a machine-generated interpretation does not make the interpretation attested or the underlying claim true. HD-05 pins the connection-credential format (VC Data Model 2.0, VC-JOSE-COSE `application/vc+jwt`, ES256); consistency argues the record/receipt suite should align with it and with ADR-0007.

DBX-01 §10 confirms a VC 2.0 / VC-JOSE-COSE (ES256) library is a new, to-be-pinned dependency; nothing in CSS 7.1.9 issues verifiable records today. isolation-and-privacy.md's data-minimisation note ("cryptographic validity does not make the underlying claim true") is the normative anchor for the valid-vs-true distinction.

## Decision

1. **Proof suite (pinned).** Records and acceptance receipts MUST be issued as **W3C Verifiable Credentials Data Model 2.0**, secured with **VC-JOSE-COSE** and signed with **ES256** (P-256), served as `application/vc+jwt`. This is deliberately the **same suite as the Databox Connection Credential (HD-05 / ADR-0007)** so the vault verifies connection credentials, record credentials and receipts with one pinned toolchain. BBS/selective-disclosure cryptosuites are **not** required (HD-05) and are out of scope for the hackathon.

2. **Credential status format (pinned).** Revocation/suspension status MUST use **W3C Bitstring Status List** (`BitstringStatusListEntry` / published `BitstringStatusListCredential`). Records, receipts and the connection credential (ADR-0007) share this one status mechanism. A verifier resolves status from the pinned status list; absence or unreachability of the list fails closed (see Failure behavior).

3. **Canonicalization + exact accepted-payload-digest preservation.** Every record/receipt MUST bind the **canonical digest of the exact accepted payload bytes** (the digest ADR-0019 records and ADR-0018 preserves). A single canonicalization algorithm MUST be pinned and versioned so the digest is reproducible by any verifier; the accepted bytes are never re-serialised in a way that changes the digest. The receipt/record binds this digest, the compiled-policy/profile digest and (where applicable) corpus-manifest and attestation identifiers — never a bare version string (review #18).

4. **Valid ≠ true (review #13, isolation-and-privacy.md).** The proof attests **issuer, integrity and time**, not the truth or attestation-status of the claim. Every record MUST carry, as first-class fields, the **author, method, verification-status and (where applicable) attester** so a verifier and a consumer can distinguish: a preference, a self-asserted fact, a verified credential, and a machine-proposed-but-not-human-attested interpretation. A valid signature over a machine-generated legal/normative interpretation MUST be surfaced as "cryptographically valid, not human-attested" until an authorized human attests it (review #13). The program profile states whether a value is preference, self-asserted or verified (isolation-and-privacy.md).

5. **Offline verification bundle (S-14).** Issuance MUST produce an offline-verifiable bundle: the credential/receipt, the **pinned JSON-LD contexts and their content hashes**, the issuer verification method / public key, the status-list snapshot reference, the canonicalization algorithm identifier, and the digest inputs. A verifier MUST be able to verify **without dereferencing mutable or organisation-private URLs** (S-14). Contexts are pinned by hash; a context whose fetched hash does not match the pinned hash is rejected.

6. **Trusted-issuer + key-history enforcement.** Verification MUST check the issuer against the program's **trusted-issuer** set (there is no CSS issuer allowlist today — DBX-01 §2 — so this is net-new) and MUST accept signatures from **historical signing keys retained in the ledger's key history** (ADR-0019) so a receipt signed by a since-rotated key still verifies while a revoked key is honoured via the status list.

## Alternatives considered

- **Data Integrity proofs (e.g. `ecdsa-rdfc-2019` / JCS or RDF canonicalization) instead of VC-JOSE-COSE.** Deferred/rejected for now: splitting suites between connection credential (JOSE-COSE per HD-05) and records would double the verification toolchain in the vault and the interop surface. Alignment with HD-05/ADR-0007 wins; a Data-Integrity profile MAY be added later as a typed option but is not adopted.
- **`StatusList2021` / revocation-list-2020.** Rejected in favour of the successor **Bitstring Status List**, which is the current W3C status mechanism and covers both revocation and suspension in one bitstring; pinning the older list would incur a later migration.
- **Bind records to a live status/policy URL rather than a pinned bundle.** Rejected (S-14, invariant 8): verification must not depend on a mutable or organisation-private URL; the offline bundle with pinned context hashes is mandatory.
- **Treat a valid signature as sufficient proof of the claim.** Rejected (review #13, isolation-and-privacy.md): conflating cryptographic validity with truth/attestation is exactly the false-assurance the register forbids; author/method/verification-status fields are mandatory.
- **BBS selective disclosure for records.** Out of scope (HD-05): not required for the demonstration; may be a future profile.

## Consequences

- **Positive:** One pinned suite (VC 2.0 / VC-JOSE-COSE / ES256) and one status format (Bitstring Status List) across connection credentials, records and receipts — a single verification toolchain in the vault, satisfying HAK-06's "credentials independently verify" gate and giving DBX-16 a fixed target. Offline bundles make evidence portable and provider-independent (invariant 8, S-14). The valid-vs-true fields prevent the system from over-claiming machine output (review #13).
- **Negative / cost:** New pinned dependency (VC-JOSE-COSE/ES256 library — DBX-01 §10) and a Bitstring-Status-List publisher/verifier. Pinning contexts by hash means every context version bump is a tracked, tested change (S-14 / S-01 compatibility manifest). Canonicalization must be frozen and versioned; changing it is a breaking evidence change.
- **Privacy & threat notes:** Closes "replay/forge a record" and "verify against a mutated context" threats. Bitstring Status List can itself leak issuance volume / correlation if a single global list is shared — status lists MUST be **program-local** (isolation-and-privacy.md Analytics: no hidden global consumer key), not a cross-program correlator. Offline bundles must not embed personal identifiers in context URLs or verification methods (isolation-and-privacy.md identifier-leakage list).

## Failure behavior

Fail closed:
- A record/receipt whose signature does not verify, whose issuer is not in the trusted-issuer set, or whose signing key is neither current nor in retained key history, is **rejected** as unverifiable.
- A credential whose status list is unreachable, or whose bitstring marks it revoked/suspended, is treated as **not currently valid** — status-unknown fails closed, it is never assumed valid.
- A context whose fetched content hash does not match the pinned hash is rejected (no silent acceptance of a mutated context).
- A payload whose recomputed canonical digest does not match the bound digest is rejected (integrity failure — ties to ADR-0018 immutability and ADR-0019 idempotency).
- Machine-generated interpretive content lacking an attester is surfaced as "valid, not attested" and MUST NOT be presented as attested/true (review #13).

## Open sub-questions / residual gates

- The **exact canonicalization algorithm identifier and version** and the **context set + pinned hashes** are pinned by the cryptographer sign-off and recorded in the Track A/Track B compatibility manifest (S-01, R-13); this ADR fixes *that they are pinned and hash-checked*, DBX-16/DBX-09 record the concrete values.
- Whether a **Data Integrity** proof profile is offered as an additional typed option is deferred; owner DBX-16, gated on interop need.
- Trusted-issuer set contents are a **Profile choice** per program (review-item #1; owned by DBX-06); this ADR fixes only that verification enforces it.
- Contract for its scope is otherwise fully specified.
