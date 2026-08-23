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

## M28-T04 — Every in-app link preserves scope

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `useScopedTo` applied to every navigation that stays inside the
  shell — all 15 sidebar links, the Dashboard's task rows / recent activity /
  reports and agents links, Reports' shared `TaskLink` and the churn card's
  handoffs link, the Agents screen's dashboard link, `NotFound`'s way back,
  and Handoffs' task selection.
- **Deliberately left unscoped**: the auth boundary. `Login ⇄ Register`,
  post-login `/`, the OAuth callback's `/projects` and the logout button's
  `/login` all leave or precede the shell, where a scope is meaningless or
  belongs to the session that just ended.
- **Verified**: full GUI suite 1111 pass; `moon check --all` clean (34).
  The exit criterion asked for enforcement rather than inspection, so
  `AppShell.test.tsx` now asserts the invariant over *every* rendered shell
  link at once, and it was proven to bite: unscoping the single nav `to=`
  fails it naming all fifteen links.
- **Notes**: the same mistake recurred three times and is worth naming — the
  hook was declared in one component of a file and used in another
  (`Tasks`' `HandoffsSummary`, `Dashboard`'s `Dashboard` vs `TaskRow`,
  `ChurningTasksCard`). Each surfaced only as a runtime `ReferenceError` in a
  test, never at typecheck, because the identifier resolves lexically to
  nothing until it runs. A `<ScopedLink>` component would make that
  impossible by construction; it was not built here because
  `frontend-standard` requires a story per component and the hook keeps the
  scope explicit at the call site. Recorded as the trade rather than a
  discovery.
- **Next**: M28-T05 (navigational state into the URL).

## M28-T05 — Navigational state into the URL

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: Bin `?tab=`, Organizations `?section=`, Memory `?scope=`, and
  Task Types as `/task-types/:typeId` (it already fetched by id, so the deep
  link resolves without the list). The three query params share one new
  `hooks/useUrlEnum.ts` — validate-or-fall-back on read, and a setter that
  copies existing params through the functional updater so `?org`/`?project`
  are never clobbered — rather than three copies inside three files already
  at the 400-line cap. 16 new tests; suite 1111 → 1127.
- **Verified**: `moon check --all` clean (34); GUI 1127 pass; coverage 98.5%.
  Each screen has a genuine reload test — interact, assert the URL the app
  produced, then re-render fresh at exactly that URL and assert the same
  view — plus an absent/unrecognised fallback case. TaskTypes' reload test
  returns an *empty* type list on the second render, so it proves the deep
  link resolves by id rather than by finding the row in a loaded page.
- **Notes**: two findings, one of them a bug this milestone would otherwise
  have shipped.
  1. **`useScopedTo` was the wrong helper for same-screen navigation.**
     Memory's `selectBelief` used it, and it carries *only* scope by design —
     so opening a belief while in organization scope dropped `?scope=` and
     flipped the list back to project memory with an org belief open beside
     it. Same-screen navigation now carries the whole query string, which is
     a superset. Covered by a test. The general rule this surfaces: leaving a
     screen carries scope; moving within one carries everything.
  2. **The M23 bug had a fresh place to reappear.** TaskTypes resets its
     selection on org change (M19-T05), and with the id now in the URL that
     reset is a *navigation* — so an unguarded effect would have thrown away
     every deep link on first render, because the store hydrates from `''` a
     tick after mount. It uses the same discriminator `Tasks` does (an empty
     previous org is hydration, not a switch), with `replace` rather than a
     push since the entry being left is the cross-org state the correction
     exists to remove. Proven load-bearing: removing the guard fails exactly
     the two deep-link tests.
  `TaskTypes/index.tsx` is now at exactly 400 lines — at the cap, with no
  headroom for the next change.
- **Next**: M28-T06 (the three latent bugs).

## M28-T06 — The three latent bugs

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `Artifacts` now uses `Tasks`' `previousScope` discriminator
  instead of the `isFirstRender` guard `Tasks` abandoned; `Memory` renders a
  foreign-scope belief under **its own** org/project with a `role="status"`
  banner saying so; `Memory`'s `selectedBeliefId` is the route param alone
  (the mirrored `useState` and its sync effect are gone) and selection
  pushes rather than replaces. 7 new tests; suite 1127 → 1134.
- **Verified**: every fix reproduced red first, with the failure recorded.
  `moon check --all` clean (34); GUI 1134 pass; coverage 98.52/95.37/97.53/
  98.86; design-lint 230 files, 0 findings. **No existing assertion was
  changed** — the only edit to existing test code was adding a Back probe.
- **Notes**: bug 2 was materially worse than "renders under the wrong
  heading". `BeliefDetail` took `orgId` from the *active* scope, and that id
  was passed to `PromoteBeliefDialog` — so promoting a belief opened by deep
  link from another organization would have moved it **into the reader's
  organization**. That is data integrity, not presentation. Fixed at the
  source: `BeliefDetail` no longer takes `orgId`/`scopeType` as props at all,
  so there is nothing left to mis-wire; both come off the belief. `canPromote`
  was likewise testing the screen's toggle rather than a fact about the
  belief. Verified by mutation — pointing the dialog back at `activeOrgId`
  fails exactly the promote test.
  The banner is a deliberate third option between the two the task offered:
  refusing to render would break the deep link this milestone exists to
  build, and rendering silently would leave the reader unable to tell the
  panel is not from the list beside it. It is shown, acted on under its own
  scope, and says so.
  Also worth recording: the scope toggle had to become a *single*
  navigation. It previously set the tier and cleared the selection in two
  calls; with the selection in the path, two calls race — the second is
  built from the query string as it stood before the first and puts the old
  tier back.
- **Next**: M28-T07 (breadcrumbs).

## M28-T07 — Breadcrumbs on every deep-linkable detail view

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: new `hooks/useScopeLabels.ts` (resolves the project name via
  `getProject`, sharing `Tasks`' existing `['project', id]` cache entry);
  `Tasks` refactored onto it, so there is one implementation rather than an
  inline query added "purely for the breadcrumb"; new
  `Memory/BeliefCrumbs.tsx` and `TaskTypes/TaskTypeHeader.tsx`; 9 stories
  across 3 files including the first-ever `BeliefDetail` story, covering the
  foreign-scope banner T06 added. Suite 1134 → 1150.
- **Verified**: `moon check --all` clean (34); `gui:storybook-test` green —
  **116 stories, 0 axe violations, nothing wider than 375px**; coverage
  98.53/95.47/97.54/98.87.
- **Notes**: four things worth carrying.
  1. **No trail names an organization, deliberately.** There is no
     `getOrg`-by-id RPC — only `getProject` — so an org's name is not
     resolvable from an id anywhere in the GUI (the switcher only has a label
     because it syncs one from whatever `listOrgs` page happened to contain
     it). Adding the RPC is a contract change and outside this milestone. The
     reasoning lives in `useScopeLabels`' docblock, which is the one resolver
     every trail passes through.
  2. **Task Types gets no project crumb.** Task types are org-scoped —
     `listTaskTypes` takes an `orgId` and one type is shared across every
     project in it — so a project crumb would name a parent the type does not
     have and link where the type is not. The honest parent is the
     organization, which is exactly the unresolvable name.
  3. **The Memory crumb re-states `?scope=`.** `useScopedTo` carries only
     org and project by design, so the back-link from an organization-tier
     belief would otherwise land in the *project* list. Same distinction T05
     surfaced: leaving a screen carries scope, moving within one carries the
     screen's own parameters too.
  4. The refactor found **the last shell link still dropping scope** —
     `Tasks`' own breadcrumb pointed at a bare `/projects`. T04's invariant
     test covers rendered nav links, not crumbs built inside a screen.
  `TaskTypes/index.tsx` went 400 → **350** lines: the extraction took the
  whole identity strip, and the header now remounts on `key={selectedId}`,
  which is what resets an in-flight rename when you switch types.
  **Carried forward, unresolved**: two early `gui:test` runs reported one
  failure without the name being captured, unreproducible in 12 subsequent
  runs (1150/1150 each). It matches the machine-contention flake this repo
  has recorded before rather than anything here, but it is unidentified —
  worth watching in CI rather than assuming.
- **Next**: M28-T08 (end-to-end proof, NAVIGATION.md, closeout).

## M28-T08 — End-to-end proof, NAVIGATION.md, closeout

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: new `tests/e2e/addressable.spec.ts` (6 tests);
  `NAVIGATION.md` documents the scope convention, gains
  `/task-types/:typeId`, and its breadcrumb rule is now **true as filed** —
  four screens, every ancestor link scoped, and the no-organization-crumb
  constraint stated with its reason.
- **Verified**: the headline claim proven across **two real browser
  contexts** — context A pins `Bulk Project 00001` (deliberately *not* the
  newest project, which is what a cold load auto-selects, so a URL copied
  from the default would prove nothing), creates a uniquely-named task in
  it, and copies the URL; context B is a fresh `browser.newContext()` whose
  own auto-selected project is asserted to differ, and `goto(urlFromA)`
  shows A's task, A's project in the breadcrumb, and A's scope unchanged by
  the auto-select. Also: a deep-linked task survives `page.reload()` (M23 at
  browser level), `?section=` and `?tab=` survive reloads, and a cold-linked
  task shows a trail whose every link carries scope. Full e2e **44/44, run
  twice**; `moon check --all` clean; route parity between `App.tsx` and the
  route table re-checked mechanically; `:doc-drift` clean.
- **Notes**: two findings, and the second is about this milestone's own
  process.
  1. **Breadcrumb ancestors were dropping scope** — exit criterion 6's exact
     wording ("no navigation within the shell silently drops `?org`/
     `?project`") was false for crumbs. Clicking "Tasks" out of a deep-linked
     task in project A landed on bare `/tasks`, where the switcher
     auto-selects `projects[0]` — so the way *out* of a task took you into a
     different project. T04's invariant test covers rendered nav links, not
     trails built inside a screen. Reproduced red by the new e2e, fixed in
     `Tasks` and `Artifacts`.
  2. **`gui:e2e` is `type: 'run'`, so it is not in `moon check --all`.**
     T03 and T04 each broke an existing spec — `reports.spec.ts`'s
     `toHaveURL(/\\/reports$/)` once nav links gained a query string, and the
     rich-editor spec's `url.split('/tasks/')[1]` once the URL carried one —
     and every local gate stayed green through both. A third failure
     (`core-journey`'s strict-mode `Delete`) predated M28. All three fixed;
     baseline was measured with the work stashed (35/38) to be sure none was
     mine. The lesson is the M26 one again from a new angle: a green
     `moon check --all` does not mean the browser suite passes, and nothing
     says so at the point of use.
     Also worth carrying: run e2e with `--workers=1` locally; the default 10
     produced dynamic-import and renderer crashes across *pre-existing*
     specs on this machine. CI already uses 1.
