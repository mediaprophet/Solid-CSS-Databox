# ADR-0015 — Legal-policy compilation boundary and human attestation

- **Status:** Adopted-with-scope (technical interface + attestation regime adopted) **+ explicit Blocked (decision required) release gate** for the legal-compliance profile — see Open sub-questions.
- **Date:** 2026-07-14
- **Decision owner:** DBX-02 (Hard lead)
- **Residual human review required:** legal-policy — by construction: the whole point of this ADR is that an authorized human attester, not a machine and not the runtime, adopts any legal interpretation. Also cryptography (bundle signing) and security (trust boundary).
- **Sources adjudicated:** R-12 (legal-policy workstream + compiled-policy input interface); review-item #11 (ELI does not pin the corpus); review-item #12 (evaluator does not decide commencement/repeal/transition); review-item #13 (machine outputs are proposed until attested); implementation-decisions.md (Legislative policy provenance); legal-review-cdr-data-awareness-and-correction.md (status, retained legal questions).
- **Consumed by / blocks prompts:** DBX-07 (technical ODRL profile + WebCivics mapping), DBX-20 (evaluator consuming compiled bundles).
- **Relates to:** ADR-0013 (composition consumes attested rules), ADR-0014 (effective-time comes from the compilation stage), ADR-0019 (evidence binds the attestation id + digests), ADR-0023 (CDR/APP candidate profile depends on this gate).

## Context

The runtime must never improvise law. review-item #12 rejects "the ODRL evaluator decides commencement, repeal and transition"; review-item #11 rejects "an ELI identifier pins the processed corpus"; review-item #13 adopts-with-scope "machine outputs are merely proposed until human-attested." R-12 sets the strategy: proceed now on a **technical ODRL profile** of deterministic operational terms with clearly synthetic test policies, and define a **stable compiled-policy input interface** so that when the legislation corpus and human review are ready, a separate Hard legal-policy prompt maps the reviewed model into that interface. implementation-decisions.md fixes the enforceable chain: authoritative legal source → immutable corpus manifest + digests → jurisdiction/commencement/applicability analysis → machine-proposed mapping → **authorized human attestation** → signed policy bundle → runtime controls → receipt/evidence.

Why this matters to an invariant: the register-wide rule is that the runtime evaluator "must not perform free-form legal interpretation — it consumes signed, human-attested compiled policy," and "unsupported/ambiguous policy fails closed." This ADR draws the line between what a machine may *propose* and what a human must *attest*, and it defines the interface across that line.

## Decision

**The runtime consumes a signed, versioned, human-attested COMPILED policy bundle. It never performs legal interpretation.** Specifically, the runtime evaluator MUST NOT decide commencement, repeal, transition, or jurisdictional applicability (review #12 **rejected as stated** — that reasoning belongs to the compilation stage). The evaluator applies what the attested bundle states, records the exact inputs it used, and fails closed on anything unsupported (ADR-0013).

**The corpus is pinned by an immutable corpus manifest, not by an ELI (review #11 rejected as stated).** Every compiled bundle MUST reference a corpus manifest whose entries each carry: authoritative source URI, jurisdiction, expression/version, retrieval time, media type, **canonical content digest**, and provenance. An ELI (or other legislation identifier) MAY appear *inside* a manifest entry as a human-facing locator, but it does NOT replace the content digest and does not pin the retrieved artefact.

**Machine outputs are PROPOSED until an authorized human attests them (review #13 adopted-with-scope).** A machine-generated normative mapping or legal interpretation has status `proposed` and MUST NOT be admitted to a runtime bundle. An authorized human attester promotes it to `attested`, recording **separately**: author (who/what produced the machine proposal), method (how), verification-state, and attester (the accountable human and the scope of their attestation). This does **not** require prior human signature for every ordinary factual system event (a deposit receipt, a duty transition) — only for legal interpretations and normative mappings.

**Stable compiled-policy input interface (from R-12).** The compilation stage emits, and the runtime consumes, a bundle with these fields (stable across corpus updates so the evaluator does not change when the law does):

- `jurisdiction` and applicability scope;
- `corpusManifestDigest` — digest of the immutable corpus manifest above;
- `commencementRepealTransition` — the *result* of the legal-temporal analysis (an effective interval per ADR-0014), never the raw reasoning for the runtime to redo;
- `proposedMapping` — the machine-proposed normative/WebCivics→ODRL mapping (review #14 artefact, produced by DBX-07);
- `attestation` — attester identity, method, verification-state, scope, and signature; absence ⇒ `proposed` ⇒ not admissible;
- `webCivicsSourceAndJuralTerms` — the source rank (ADR-0013 stage 2) and jural correlatives;
- `compiledPolicyDigest` + `profileDigest` and the `effectiveInterval` (ADR-0014);
- `appealRedressMetadata` (feeds ADR-0023 routes);
- `evaluatorVersion` compatibility marker.

The bundle is signed (cryptography review). The runtime validates signature, attestation presence/scope, and all digests before admitting any rule (ADR-0019 binds these into evidence).

**Technical work proceeds now on synthetic policies.** DBX-07/DBX-20 build and test the profile, evaluator, duties (ADR-0012), conflict composition (ADR-0013) and versioning (ADR-0014) against **clearly synthetic, labelled** compiled bundles that exercise the interface without asserting any real legal meaning. No synthetic fixture may be labelled or exported as a compliance claim.

## Alternatives considered

- **Let the evaluator interpret legislation at runtime (from ELI + constraints)** — rejected (review #12). It puts un-attested legal reasoning on the hot path, is non-reproducible, and cannot be reviewed by an accountable human before it affects a person's rights. The evaluator consumes results, not raw law.
- **Pin the corpus with an ELI/version identifier** — rejected (review #11). ELIs name but do not pin; a publisher can change bytes behind a stable ELI. The content-digested corpus manifest is required for offline, tamper-evident verification.
- **Treat machine-proposed mappings as directly usable if SHACL-valid** — rejected (review #13). Shape-validity proves well-formedness, not legal correctness. Human attestation with recorded scope is the gate; SHACL is a necessary pre-filter, not a substitute for the attester.
- **Block all Databox technical work until the corpus and attestation exist** — rejected (R-12). Identity, storage, integration, credential, exchange, evidence, and the deterministic operational profile can and should proceed on synthetic policies; only the *legal-compliance profile* is gated.
- **Attest a whole corpus once and treat everything downstream as covered** — rejected. Attestation has explicit *scope*; a broad "the corpus looks fine" signature is not an attestation that a specific mapping for a specific provision/effective-interval is correct. Scope is recorded per attestation.

## Consequences

- **Positive:** law enters the system only through an accountable human's scoped signature; every runtime decision is traceable to a pinned corpus, a named attester, a compiled digest and an evaluator version; technical delivery is unblocked without manufacturing a compliance claim.
- **Negative / cost:** a real compilation+attestation pipeline and an accountable legal reviewer are required before any compliance profile ships; maintaining the stable interface as the corpus evolves is ongoing work; synthetic-only status must be conspicuously enforced to prevent premature compliance claims.
- **Privacy & threat notes:** closes the *un-attested-law-on-the-hot-path* threat and the *mutable-URL corpus* threat (both would let policy meaning drift without an accountable record). The attestation record names a human and staff-side details; that record is protected like other staff-identifying evidence (exchange-and-evidence.md Audit) and minimised in any consumer-visible projection (ADR-0023).

## Failure behavior

Fail closed, hard. A bundle with status `proposed` (no attestation) MUST NOT be admitted. A bundle whose signature, `attestation` scope, `corpusManifestDigest`, `compiledPolicyDigest`, `profileDigest`, or `evaluatorVersion` fails to verify or is incompatible MUST NOT be admitted; any action depending on it fails closed and is audit-visible. The runtime MUST NOT "best-effort interpret" a missing field. A compliance *release* MUST NOT pass while the legal-compliance gate below is open. Synthetic fixtures MUST be machine-labelled synthetic so no build can accidentally assert compliance.

## Open sub-questions / residual gates

- **Blocked (decision required) — legal-compliance release gate.** The legal-compliance profile is **Blocked** pending two inputs: (1) the **actual legislation corpus** ingested and pinned as a content-digested corpus manifest, and (2) **authorized human attestation** of the WebCivics/legal→ODRL mapping for the relevant provisions and effective intervals. **Unblocking input:** the ingested corpus manifest + a scoped human attestation record. **Owning prompt:** the separate Hard legal-policy mapping prompt (per R-12), producing artefacts through **DBX-07**; the accountable human legal reviewer supplies the attestation. Until both exist, no build may claim legal compliance; technical work on synthetic policies is *not* gated and proceeds.
- The WebCivics→ODRL loss-aware mapping shapes and human-review workflow are owned by **DBX-07** (review #14 artefact).
- The signing-suite and key-history retention for bundles are a **cryptography** decision (shares the credential/receipt signing choices in the R-04/R-11 ADRs).
