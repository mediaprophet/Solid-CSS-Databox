# Completion plan — drive the in-flight upgrade to fully green

Companion to [dependency-upgrade-plan.md](dependency-upgrade-plan.md) (the strategy for the remaining 47
majors). **This file is tactical**: it covers the work currently sitting UNCOMMITTED in the working tree
and exactly what must happen for `build + lint + tsc + unit + integration` to be genuinely green, with no
muted rules, no weakened tests, and no claimed passes that were not observed.

Written 2026-07-17. Standard of work, per the project owner: *"no scams, fraudulent claims, dodgy work
... do it properly."* This is the Solid reference server; correctness is the deliverable.

## 1. Ground truth — measured, not assumed

Already committed and pushed, green, not at risk:
- `392155a01` — `start:databox-demo` + guide fix
- `5e592d066` — Node 24.18.0 floor (integration was **28 suites / 804 tests, exit 0** at this commit)

Uncommitted in the working tree:

| Gate | Result |
|---|---|
| `npm run build` | **exit 0** |
| `npm run lint` | **exit 0** (from 531) |
| `npx tsc --noEmit` (src) | **0** |
| `npx tsc -p test --noEmit` | **0** (from 30) |
| `test:unit` + coverage | **435 suites / 3342 tests, 100% gate met** |
| **`test:integration`** | **5 suites / 39 tests FAIL** |

Everything is green EXCEPT integration. Integration passed at `5e592d066`, so **the 64 within-range
dependency updates caused this**. It is a real regression — not flakiness, not CPU starvation (those
present as 90s timeouts; these are assertions and TypeErrors).

### The 5 failing suites and what we know

| Suite | Observed error | Prime suspect |
|---|---|---|
| `Identity.test.ts` | `OPError: invalid_redirect_uri (redirect_uris must only contain strings)` | `oidc-provider` 8.4.3 -> 8.8.1 (tightened client validation) |
| `WebSocketChannel2023.test.ts` | `TypeError: Only absolute URLs are supported` — `subscriptionUrl` is a **non-absolute string** (NOT undefined; the `exposes metadata` test that sets it PASSED) | storage-description subscription URL now relative/empty |
| `WebhookChannel2023.test.ts` | (same family; suite took 207s) | as above |
| `LdpHandlerWithoutAuth.test.ts` | not yet diagnosed | — |
| `V6Migration.test.ts` | not yet diagnosed | — |

## 2. Why this is worth finishing rather than reverting

The uncommitted tree contains genuinely valuable, independently-correct work:
- **A real production bug fixed**: `QuotaStrategy` dropped async rejections, so a failed upload **stalled
  forever instead of erroring**. Fixed with a `try/catch` routing to `done()`, plus 2 tests that are
  **mutation-proven** (strip the `try/catch` -> exactly those 2 fail).
- **Six tests that were green and lying**, now real: an `expect` on an arrow-function literal that never
  invoked the constructor; `toEqual(new Error(...))` accepting a wrong error class (proven by probe); a
  `new Map() as any` posing as async storage; a `Literal('abcde')` fixture broken since ~2019 that made
  the "literal" case silently assert on a NamedNode; assertions on unawaited Promises.
- **Both HIGH vulnerabilities eliminated at source** (22 -> 13 total; 2 -> 0 high): koa via
  `oidc-provider` 8.8.1, linkify-it via `typedoc` 0.28.20.
- **The typedoc footgun defused** — `typedoc.json` `out` moved off `docs/`, which is the published Pages
  site in this fork. Verified: running typedocs now leaves `docs/` at 0 changed files.
- 390 lint errors fixed properly; `unbound-method` precision restored (58 targeted disables, 3 genuine
  sites preserved, no blanket disables, `eslint.config.mjs` byte-identical to HEAD).

Discarding all of that to dodge 5 suites would be the wrong trade.

## 3. Phase 1 — Identify the culprits by bisecting the lockfile (do this FIRST)

Do **not** guess. 64 packages moved; 5 suites broke. Bisect.

1. Save the current lockfile. `git stash` is NOT available to isolate this (the tree holds unrelated
   fixes), so work from a copy: `cp package-lock.json /tmp/lock.after`.
2. Get the pre-update lockfile from HEAD (`git show HEAD:package-lock.json > /tmp/lock.before`).
3. Binary-search: install a lockfile with half the updates reverted (`npm ci` from a spliced lockfile),
   run ONLY the 5 failing suites at `--maxWorkers=2`, and narrow to the offending package(s).
   Expect 6-7 iterations. Each `npm ci` + 5 suites is a few minutes.
4. Output: the exact package -> suite mapping.

Faster first probe (cheap, likely to short-circuit the search): revert **only** `oidc-provider` to 8.4.3
and re-run `Identity.test.ts`. If green, oidc-provider owns that suite and the search halves immediately.
Then probe `cross-fetch` 4.0.0->4.1.0 and `ws` 8.21.0->8.21.1 against `WebSocketChannel2023.test.ts` —
`"Only absolute URLs are supported"` is a fetch-layer error message.

**Rule: no fix is written until its root cause is demonstrated.** A fix aimed at a guessed cause is the
dodgy work we are explicitly avoiding.

## 4. Phase 2 — Fix each root cause, properly

For each culprit, exactly one of these is the honest answer. Decide per package, on evidence:

- **(a) Our code/test was wrong and the new version exposed it** -> fix our code. This has already
  happened repeatedly in this upgrade (the 6 lying tests, the RdfPatcher never-assigned vars, the
  QuotaStrategy dropped rejection). Prefer this outcome; it is real value.
- **(b) The new version has a genuine breaking change we must adapt to** -> adapt properly. E.g. if
  `oidc-provider` 8.8.1 legitimately requires `redirect_uris` to be strings, our client registration or
  test fixture must supply strings. Fixing the fixture is correct; pinning back to hide it is not.
- **(c) The package belongs to a cluster and must not be taken piecemeal** -> **pin it back in
  `package.json` with a comment**, and hand it to its cluster in
  [dependency-upgrade-plan.md](dependency-upgrade-plan.md). This is legitimate, not a cop-out: `n3` and
  the `@comunica`/`rdf-*` family are **cluster A** members that entered through the back door via a
  minor bump. Taking one member of a coupled cluster alone is precisely what the strategy says not to do.

Constraints (non-negotiable):
- No `any`, `@ts-ignore`, `@ts-expect-error`, or casts to silence.
- No weakened or deleted tests. If an assertion must change, it must verify the same thing or more.
- No rule disabled in `eslint.config.mjs`. Single-line disables only for a **provable** false positive,
  with the reason stated.
- Every claim backed by observed command output.

## 5. Phase 3 — Full gate, throttled

This machine starves at Jest's default parallelism (proven: 7 workers -> 51 false timeouts; same tree
passed at 2). Run each gate separately and **capture real exit codes** — do not let a `| tail` or `| grep`
pipe mask them (that mistake hid a failure twice in this effort):

```
npm run build                                              # expect 0
npm run lint                                               # expect 0
npx tsc --noEmit && npx tsc -p test --noEmit               # expect 0 / 0
npx jest --config=./jest.coverage.config.js test/unit --maxWorkers=2   # 3342 tests, 100% gate
npx jest test/integration --maxWorkers=2                   # 28 suites / 804+ tests, exit 0
```

Then drive the real app, because the gate has already proven insufficient once:
`npm run start:databox-demo`, load `/index.html`, click **Provision Charles James** and **MegaMart twice
each** (the second run is what catches already-registered bugs), confirm the QR renders with the correct
program, then load the Admin console routes.

## 6. Phase 4 — Land

One commit, hook passing if the machine allows; if the hook starves, run every gate individually at
`--maxWorkers=2` and **say so explicitly in the commit message**. No bylines.

Commit message must record honestly:
- 64 within-range updates; **both HIGH vulns eliminated at source** (22 -> 13, 2 -> 0 high)
- any package **pinned back** and why (cluster ownership)
- the QuotaStrategy production bug + mutation-proven tests
- the six lying tests, named
- the typedoc `out` fix (it destroyed the published Pages site in `docs/`)
- 390 lint errors fixed with no rules muted

## 7. Swarm shape (if parallelised)

- **Phase 1 bisect is SEQUENTIAL** — it mutates `node_modules`. One agent, no fan-out. Parallel agents
  would fight over the install.
- **Phase 2 may fan out** one agent per root cause, but only after Phase 1 names them, and only if they
  touch disjoint files.
- **Verification stays central and throttled** (1-2 runners). Never N agents running the suite.

## 8. Residual items to fold in

- **2 `as any` casts** introduced in `StaticAssetHandler.test.ts` (lines ~247/289) by the autofix pass.
  Net `any` unchanged and they match that file's pre-existing pattern, but they are casts and were
  flagged for review rather than buried. Decide: keep, or type properly.
- `InteractionUtil.test.ts:35` has an assertion change sitting in the tree from the lint pass — verify it
  strengthens rather than weakens.
- **The stale `C:\Program Files\nodejs` (v26.3.0)** still shadows nvm in any shell with an inherited PATH.
  Removing it is a machine-level action for the owner.
