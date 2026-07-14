# Handoff — DBX-04

**Prompt:** DBX-04 — Reference architecture and interface boundaries
**Status:** complete (acceptance gate met; see reference-architecture §10 + §11)
**Agent level:** Hard (lead author + independent Hard trace-check)
**Date:** 2026-07-14
**Depends on:** DBX-01, DBX-02, DBX-03 (accepted)

## Commits / changed files

- `databox/dbx-04-reference-architecture.md` — component inventory (C1–C21), deployment topology + trust
  boundaries (B1–B10), interface catalog (IF-01–IF-20), Track A/B adapter split, authoritative-state matrix,
  six sequence traces + the §7.0 commit protocol, failure ownership, architecture decisions.
- `databox/handoffs/DBX-04.md` — this record.

No production code (DBX-04 is architecture). On branch `databox-implementation`.

## Method / provenance

Hard lead authored the architecture; an independent Hard (Opus) reviewer trace-checked all six flows against
the gate and found a cross-cutting defect (cross-system atomic commit treated as a primitive) plus an
undefined step-up state. All findings incorporated (§11).

## Decisions consumed

Every ADR-0001…0025; DBX-03 boundaries B1–B10 and threats (controls in the traces cite T-ids); DBX-01 seams
(each component names its CSS extension point).

## Decisions created (feed DBX-05 conformance) — reference-architecture §9

1. Tenant resolution (C5) precedes authorization (C4), tenant carried immutably into the op (T-01/T-54).
2. **Commit point = single-store C13 transaction** (evidence + outbox), C1 is a reconciled projection;
   receipt only after durable C13 confirm. This supersedes any reading of "C1/C13 atomic".
3. C15 cursor feed (track-agnostic), not the C14 outbox, is the consumer recovery contract.
4. KMS (C18) is a distinct component behind B10, separated from provisioning (C10) and mapping (C11).
5. C4 is authorization-system-neutral; same conjunction on both tracks.
6. Track A/B differ only in the C1–C3/C9 front-end; C4–C18 identical, so Track B cannot weaken a Track A control.

## Open / provisional items

- **IF-01 (token exchange) is provisional** pending the Blocked ADR-0005 RFC 8693 wire-detail → DBX-12.
- Delegation/guardianship grant state (C9-owned) is represented but its full model is DBX-13/DBX-14 (T-47).

## Commands / test results

None — no code. Verification is the §10 self-check + the §11 independent trace-check.

## Exact artifacts available to dependent prompts

- **DBX-05 (conformance):** the interface catalog (IF-01–20), authoritative-state matrix and the six traces
  are the requirement sources; §9 decisions each become conformance requirements; the Track A/B split (§5)
  drives the two-track conformance manifest.
- **DBX-06 (institution profile schema):** component profile inputs (program origin/audience, IdP trust,
  assurance map, record classes, ODRL, notification, signing, encryption) map to C5/C9/C10/C11 config.
- **DBX-07 (vocab/ODRL):** C12 evaluator + IF-04/IF-19 contracts.
- **DBX-09 (scaffold):** the component list (C1–C18 server-side) and CSS seams define the package module
  boundaries; the Track B separate-preset (ADR-0024) is the config shape.
- **DBX-10/11/12/13/14:** C5 (tenant), C3 (context), C4 (authorizer), C9 (broker), C10 (provisioning) are
  their build targets with the IF contracts here.
- **DBX-15–21:** C6/C7 (gateway/append-only), C12 (ODRL), C13 (evidence), C14/C15 (notify/cursor), §7.0
  commit protocol.
- **DBX-22/23/24:** C21 bridge, C17 review, C20 consumer agent contracts.
