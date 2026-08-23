# M28 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M28-T01 — Save the design record (spec, ADR-0025)

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `.specs/specs/2026-08-23-2300-addressable-screens/` (shape.md,
  plan.md, standards.md), `.specs/adr/ADR-0025-*.md`, this MILESTONE.md,
  STATE.md ledger + roadmap.
- **Verified**: files exist; `moon run tasker:docs-lint` clean.
- **Notes**: the URL-scheme decision was settled by one measured fact rather
  than taste — `AppShell` sits *above* the inner `<Routes>` (a descendant
  router inside its `children`, not an `<Outlet/>` layout), so it can never
  call `useParams`, and it is exactly where the single app-wide
  `useLiveEvents({orgId, projectId})` subscription lives. Path-segment scope
  would force converting that descendant router into a nested layout route,
  which silently turns twenty absolute paths relative and breaks the nav's
  `startsWith` active check with no error. `useSearchParams` works anywhere
  inside the Router. Recorded in ADR-0025 with the rest of the measured cost.
  Keeping the store as the read surface is the second decision and preserves
  the M23 deep-link guard *by construction*: `previousScope` discriminates
  hydration from a real switch by the previous project being empty, which
  only stays true while the store starts empty and fills a tick later. Path
  scope would have killed that arm silently.
  The audit also turned up three latent bugs that are not the missing
  feature — Artifacts still using the `isFirstRender` guard Tasks abandoned,
  and two in Memory (no cross-scope reconciliation; the route param mirrored
  into `useState` and written with `replace: true`, so Back never steps
  through visited beliefs). Each gets T06 and a regression test it lacks.
- **Next**: M28-T02 (the shared test render helper).

## M28-T02 — The shared test render helper

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: new `src/test/renderScoped.tsx` (router + query client +
  location probe, returning `{location, queryClient, rerender}`) and
  `renderScoped.test.tsx` (9 tests); adopted in `Tasks`, `Artifacts` and
  `Memory` by reimplementing each file's own `renderPage(entry)` on top of
  it, so all ~170 existing call sites are untouched. Net **−112 lines** of
  duplicated harness across the three.
- **Verified**: full GUI suite 1096 pass / 73 files. Test counts per file
  unchanged (Tasks 73, Artifacts 55, Memory 46) and **no assertion edited** —
  the constraint that makes this a refactor rather than a rewrite.
- **Notes**: the helper shipped with a real bug and the catch is worth
  recording. `rerender()` handed React **the same element object**, so React
  bailed out in `beginWork` and re-rendered *nothing*. The three
  "scope changed → overlay closes" tests drive their change from outside the
  tree (a mocked store), so they failed immediately and correctly.
  What matters is that **my own helper test could not have caught it**: it
  asserted that component state *survives* a rerender, which a no-op
  satisfies perfectly. The old per-file harness worked only by accident — its
  `page()` factory minted a fresh element every call. Fixed with
  `cloneElement` (new props object, so React reconciles; same type and
  position, so state survives rather than remounting), and pinned by a new
  test that drives a change from outside the tree. That test was then proven
  to bite: reverting the clone fails exactly it and nothing else.
  Same lesson as M26's two near-broken guards, now three milestones running —
  a test written to pass is not yet a test.
- **Next**: M28-T03 (scope in the URL).

## M28-T03 — Scope in the URL

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: new `hooks/useScope.ts` — `useScope` (read), `useSetScope`
  (write), `useScopeSync` (URL → store, called once from `AppShell`) and
  `useScopedTo` (carry scope onto a path) — with 13 tests. All four scope
  writers now write the URL: the switcher's two picks and two auto-selects,
  `Organizations`' snap-to-first and its post-create select, its org-list
  click, and `Projects`' archive-clears-active. Ten navigations that would
  have dropped the query string now carry it (Tasks' open/close and its
  handoffs link, Artifacts' five, Memory's one). **No store reader changed** —
  the twenty read sites still read the store, which is the point of ADR-0025.
- **Verified**: full GUI suite 1109 pass / 74 files; `moon check --all` clean
  (34 tasks). The M23 four-case `previousScope` suite passes untouched,
  hydrate-from-empty included — the guard survives because the store still
  starts empty and the URL fills it a tick later, which `useScopeSync`'s own
  test now pins explicitly so a future "optimisation" to make it synchronous
  fails loudly instead of silently breaking deep links.
- **Notes**: three findings worth carrying forward, none of them the feature.
  1. **A real render loop, found by a test that hung rather than failed.**
     `useSetScope` closed over `params`, so its identity changed on every
     navigation — and the scope-correcting effects list it as a dependency.
     `Organizations` derives `orgsData` fresh on every render, so its effect
     already ran every render; combined, it re-navigated forever. Fixed at the
     source with `setParams`' functional updater (stable identity) *and* by
     making the correction idempotent — it now returns early when the URL
     already carries the target, so it cannot re-issue a correction that has
     landed. Either fix alone would have masked the other.
  2. **An assertion that had been passing for the wrong reason.**
     `Organizations`' "selects a root org … via keyboard" fired `keyDown` and
     asserted `toHaveBeenCalledWith('org-root')` — which matches *any*
     historical call, and the mount-time scope correction had already called
     the setter with that very id. jsdom does not synthesise click-from-Enter,
     so the keyboard half tested nothing at all. Replaced with the guarantee
     that actually delivers the behaviour: the name is a real `<button>`, so
     the browser handles Enter and Space natively (the M06-T14 fix this test
     was written to protect).
  3. Scope assertions moved from "the store setter was called" to "the URL
     says so" across three suites — strictly better, since the URL is the
     observable outcome and the setter was an implementation detail. The
     switcher's suite was mutation-tested to confirm the new assertions bite.
- **Next**: M28-T04 (every in-app link preserves scope).
