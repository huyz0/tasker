# M06 — UX, Design System & Accessibility — Progress Journal

Append-only. Newest entry at the bottom.

**Branch note.** This milestone is being delivered directly on `main` at the
user's explicit instruction, overriding `milestone-standard.md` §5 and
`git-workflow-standard.md`, which both require a `feature/m06-*` branch. Recorded
here rather than left implicit, because the next session will otherwise read the
standard and wonder which one is wrong.

## M06-T01 — Semantic status colour scale

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `apps/gui/src/index.css`, `.specs/design/design-system.md`,
  new `apps/gui/src/components/ui/statusStyles.ts` (+ test),
  `BuildBadge.tsx`, `RepositoryIntegrationConfig.tsx`, `PullRequestBadge.tsx`
- **Verified**: `moon run gui:test` — 531 pass, branches 95.13%.
  `moon run gui:design-lint` — 114 files, 0 findings.
  `moon check --all` — 24 tasks pass.
- **Notes**: Most of the scale already existed. The work was the fifth step and
  the disagreement between components.
  - **Added `neutral`** (solid + subtle, both themes) for a state that is
    neither good nor bad — draft, todo, archived, unknown. `bg-muted` had been
    standing in for it, and `muted` means *de-emphasised*, which a real status
    is not; it left an unstyled-looking badge next to styled ones. The contrast
    gate discovers `<base>`/`<base>-foreground` pairs automatically, so it
    checked the new values in both themes with no change to the gate —
    confirmed by injecting a failing value and watching it fail.
  - **Rejected renaming `destructive` to `danger`**, which the task's wording
    implies. The failure state and the delete action have never needed to be
    different colours, so a `danger` token would have to be introduced at every
    site where `destructive` is already right, and each one would then have to
    answer "action or state?" — a question with no consequence. Recorded in
    `design-system.md` so the next reader does not re-open it.
  - **The verify line was false when the task was written.** `BuildBadge` used
    the subtle pairs; `RepositoryIntegrationConfig` rendered the same build
    success as `bg-success/10 text-success`. Both now map a *state* to a tone
    through one shared table, so a component never picks a colour. An alpha tint
    is not the scale: it is a fourth colour, and the contrast gate cannot see it
    because it reads token pairs and not arbitrary utilities.
  - **Found while reading the icons**: a pull request closed *without* merging
    rendered a tick (`CircleCheck`) in destructive red — the colour said "bad"
    and the shape said "done", which is exactly the failure the "never by colour
    alone" rule exists to prevent. Now `GitPullRequestClosed`, and every status
    icon carries an `aria-label`.
  - **Not fixed here, and it is not oversight**: `bg-destructive/10` error
    panels remain in `ErrorBoundary`, `OAuthCallback` and `Bin`. M06-T05 owns
    two of those; `OAuthCallback` and `Bin` are named by neither task, so T05
    should take them.
- **Next**: M06-T02

## M06-T02 — Component primitives decision

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `.specs/adr/ADR-0009-component-primitives.md`,
  `.specs/product/tech-stack.md`
- **Verified**: the ADR is referenced by the dialog implementation —
  `apps/gui/src/components/ui/Dialog.tsx:8` names it, and the seven behaviours
  it lists are the seven tests in `Dialog.test.tsx`. Discharged by T03, which is
  why this box was checked in T03's commit rather than its own.
- **Notes**: ADR-0005 recommended installing Radix for overlays only. Rejected,
  for a reason ADR-0005 did not anticipate: `AGENTS.md` forbids installing a
  third-party package without explicit user authorization or a `tech-stack.md`
  entry, and neither exists — a recommendation inside an ADR is not
  authorization. The milestone already allows formalising the hand-rolled set
  provided the accessibility criteria are met, and the ADR makes that
  conditional real by naming seven behaviours and requiring a test for each.
  The bundle delta is recorded as **not measured**, because measuring means
  installing; the argument turns on correctness, not size. If the user wants
  Radix, ADR-0009 names the three conditions that reverse the decision and the
  swap is one file, because call sites depend on `Dialog`'s props.
- **Next**: M06-T03

## M06-T03 — The accessible Dialog primitive

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: new `apps/gui/src/components/ui/Dialog.tsx` (+ 19 tests),
  `features/Tasks/index.tsx`, `components/layout/GlobalSearch.tsx`,
  `components/layout/AppShell.tsx`, `store/layout.ts`, and the two suites whose
  assumptions moved
- **Verified**: in a real browser, both overlays — 60 Tabs and 30 Shift+Tabs
  inside the task detail with focus leaving the dialog **0 times**, `aria-modal`
  true, the name announced, scroll locked while open and released on close, and
  focus restored to the card that opened it. Same for the palette, restoring to
  the search button. `moon run gui:test` — 551 pass, branches 95.0%.
  `moon check --all` — 24 tasks pass.
- **Notes**: three defects surfaced that the task did not predict, each found by
  running the thing rather than reading it.
  - **⌘K opened two modal dialogs.** `GlobalSearch` is mounted twice — header
    and sidebar — and each copy held its own `open` state and its own ⌘K
    listener. Two stacked overlays had always been there; giving them
    `aria-modal` is what made it visible. Split into `GlobalSearchTrigger`
    (rendered twice) and one palette mounted by `AppShell`, sharing `searchOpen`
    in the layout store.
  - **`autoFocus` in the palette silently broke focus restoration.** A child
    with `autoFocus` takes focus during the commit, *before* the dialog's effect
    runs, so `document.activeElement` was already inside the dialog and the
    opener was unrecoverable — closing dropped the keyboard user on `<body>`.
    `Dialog` now tracks the last focus outside any dialog. The unit test for
    this failed first and passes now; the browser check agreed both times.
  - **`offsetParent !== null` is the wrong visibility test here.** It is null for
    the entire subtree of a fixed-position element, which the panel is, so the
    first version of the focus filter dropped every control and disabled the
    trap it was meant to build — in jsdom *and* in a browser.
  - **The design-lint gate caught `outline-none` with no focus replacement** on
    the panel, which takes focus itself when it holds nothing focusable. Fixed
    rather than exempted.
  - **Two existing tests reached for `.fixed.inset-0`** to find the backdrop.
    The backdrop moved inside `Dialog`, so they now use a `data-testid`: a class
    name is styling, not contract.
- **Next**: M06-T04

## M06-T04 — ConfirmDialog replaces window.confirm

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: new `components/ui/ConfirmDialog.tsx` (+ 12 tests) and
  `src/test/confirm.ts`; thirteen call sites across nine components; the nine
  suites that stubbed `window.confirm`
- **Verified**: no `window.confirm` call remains in `src/` — and a test walks
  the tree on every run to keep it that way, proved by reintroducing one and
  watching it fail. In the browser, deleting an artifact shows the styled
  dialog, **zero** native dialogs are raised, `role="dialog"`,
  `aria-modal="true"`, focus starts on Cancel, Escape dismisses.
  `moon run gui:test` — 564 pass, branches 95.06%. `moon check --all` — 24 pass.
- **Notes**:
  - **The shape is the point, not the styling.** `window.confirm` gives one line
    and two identical buttons, so "you can restore it from the Bin" and "this
    cannot be undone" arrived looking exactly alike. `ConfirmOptions` therefore
    splits **consequence** from **undo path** and makes the undo path required —
    `undo: null` is how a caller says "permanent", and it renders as such and
    makes the action destructive without being told twice.
  - **`useConfirm` returns a promise** so each of the thirteen sites stayed a
    one-line conditional: `if (window.confirm(…))` became
    `if (await confirm({…}))` rather than a state machine per button.
  - **Every close path settles the promise.** Escape and the backdrop resolve
    `false`; leaving it pending would hang the caller's `await` forever with the
    button disabled and no error to explain it. There is a test for that.
  - **The old tests could not have caught a bad dialog.** They stubbed
    `window.confirm` to return `true`, which asserts nothing about what the user
    was shown, so a dialog that said the wrong thing passed identically. The new
    helpers act on the real dialog, so confirming an action also proves the
    dialog appeared.
  - **A scripted edit put `{confirmDialog}` in the wrong component** in
    `Organizations` — my closing-tag anchor matched `MemberRow` before the
    dashboard. It failed loudly (`confirmDialog is not defined`) rather than
    silently, but it is the second time this milestone that a
    "match the first occurrence" edit has landed somewhere unintended.
  - **knip caught a premature export** (`confirmDialogText`), which is the
    fourth time that gate has caught a speculative one. Removed.
  - **Three coverage gaps the branch gate named** were real and pre-existing,
    surfaced because the denominator grew: closing the token panel by clicking
    its own toggle, abandoning a subfolder form, and the "Clear filters" way out
    of an empty member search. All three are now tested.
- **Next**: M06-T05

## M06-T05 — The last components onto tokens

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `components/ErrorBoundary.tsx`, `pages/OAuthCallback.tsx`,
  `features/Bin/index.tsx`
- **Verified**: the login page renders `rgb(255,255,255)` on
  `rgb(2,8,23)` text in light and the exact inverse in dark, measured in a real
  browser under both `prefers-color-scheme` settings.
  `moon run gui:design-lint` — 121 files, 0 findings. `gui:test` — 565 pass.
- **Notes**: most of what this task describes was already done, and saying so is
  more useful than pretending otherwise.
  - **`Login` and `PaginationControls` were already on tokens.** No change was
    needed and none was invented.
  - **The OAuth button's hex stays**, with the exemption it already carries:
    `#2b3137` is GitHub's brand colour, fixed by the vendor, and
    `design-system.md` explicitly allows a third-party brand colour behind a
    `design-lint-disable-next-line` with a reason. Removing it would mean
    rendering GitHub's button in a colour GitHub does not use.
  - **What was actually left** was the alpha-tint pattern T01 documented as *not*
    the scale — `bg-destructive/10 text-destructive` — surviving in three error
    surfaces: `ErrorBoundary`, `OAuthCallback`, and the Bin's delete-forever
    button. Now on `destructive-subtle`, which the contrast gate checks at 4.5:1
    in both themes; the alpha tint it replaces was checked by nothing.
  - **`#3b82f6` in `Labels` stays too**: it is the default colour offered for a
    user-created label — entity data, not chrome.
- **Next**: M06-T06

## M06-T06 — The token lint

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `apps/gui/scripts/design-lint.mjs`, `scripts/design-lint.test.mjs`
- **Verified**: the task's line — "adding `bg-blue-600` fails the lint task" —
  passes, and so do `text-red-500`, `border-green-400`, `bg-[#123456]`,
  `text-white` and `bg-black`, each injected into a real source file and each
  failing `moon run gui:design-lint`. Injected into `src/components`,
  `src/features` and `src/pages`; all three caught. 16 gate tests pass.
- **Notes**:
  - **The rule already existed**; `design-lint`'s `tokens` check has failed on
    raw hex and raw palette utilities since M05-T01. Saying so beats building a
    second one.
  - **It had a real hole, and it is the interesting part of this task.**
    `text-white`, `bg-black` and `bg-white` carry no shade number, so the
    shade-based pattern never saw them — and they are *worse* than a palette
    shade, not better: they are the same colour in both themes, so a component
    using one is dark-mode-broken by construction. Now caught, with a test that
    also pins `backdrop-blur-sm` and `whitespace-nowrap` as **not** matches, so
    the new pattern cannot fire on a token whose name merely contains the word.
  - **A phantom gap nearly went in the journal as real.** A probe injecting
    `bg-blue-600` into a `.ts` file appeared to pass the gate, suggesting it only
    scanned `.tsx`. The injection had silently not applied — the file has no
    `import` line for my script to anchor on. Re-running it against
    `statusStyles.ts` failed correctly. This is the second time this discipline
    has caught a wrong conclusion; **an injection that proves nothing looks
    exactly like a gate that catches nothing.**
  - The one surviving `text-white` is on the OAuth button, inside the existing
    `design-lint-disable-next-line tokens` for GitHub's brand colour — white on
    that colour is the vendor's button, not this app's chrome.
- **Next**: M06-T07

## M06-T07 — Theme toggle

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/index.css`, `store/layout.ts`, `main.tsx`,
  new `components/layout/ThemeToggle.tsx` (+ 11 tests),
  `AppShell.tsx`, `scripts/design-lint.mjs`, `scripts/design-lint.test.mjs`
- **Verified**: in a browser with the machine set to **dark** throughout —
  no choice → `dark`; choosing Light → `light`, `rgb(255,255,255)`, stored;
  full reload → still `light`; System → back to `dark`; Dark → `dark`. So the
  choice both survives a reload and overrides the OS, which is the task's line.
  `gui:test` — 576 pass, branches 95.18%. `moon check --all` — 24 pass.
- **Notes**:
  - **"System" is resolved in JavaScript, not in CSS.** The alternative keeps
    the media query and adds an attribute block, which is two copies of every
    dark token — and the second copy is the one nobody updates. Now there is one
    `:root` and one `:root[data-theme='dark']`, and `applyTheme` decides which.
  - **I nearly disabled the contrast gate while doing it.** `design-lint`'s
    `themes()` matched `/:root\s*\{/`, which the old `@media { :root { … } }`
    satisfied and the new `:root[data-theme='dark']` does not. The gate would
    have found one theme, checked light, and reported success — the exact class
    of silent pass this milestone keeps running into. Regex widened, and there
    is now a test that feeds it a dark-only contrast failure; it fails against
    the old regex, which is how I know it pins the fix rather than describing
    it.
  - **The toggle lives in the sidebar as well as the header**, because the
    header is `md:hidden` — mounting it only there would have hidden it from
    every desktop user. Found by the browser check timing out on a click, not by
    reading.
  - **Three choices, not a switch.** A two-state switch cannot say "follow the
    machine", so it either ignores the preference the user already expressed at
    OS level or silently overrides it the first time they touch it.
  - **Storage failures do not break the theme.** Private browsing throws on both
    read and write; the read falls back to `system` and the write still applies
    the choice for the session. Both have tests.
- **Next**: M06-T08

## M06-T08 — Breadcrumbs

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: new `components/layout/Breadcrumbs.tsx` (+ 7 tests),
  `features/Tasks/index.tsx`, `features/Artifacts/index.tsx`,
  `scripts/rpc-coverage.mjs`
- **Verified**: cold-loading a task URL shows
  `Seed Project › Tasks › SEED-145`, with the first two as links and `SEED-145`
  carrying `aria-current="page"`. Cold-loading an artifact URL shows
  `Artifacts › Design › upload-test.png`. `gui:test` — 583 pass, branches
  95.06%. `moon check --all` — 24 pass.
- **Notes**:
  - **A deep-linked detail view has no history behind it** — the browser's Back
    button leaves the app — so breadcrumbs are the only way out that works
    whether the user clicked in from the board or pasted a URL. That is why the
    verify line says *deep-linked*.
  - **The last crumb is not a link.** A link to the page you are already on is a
    control that appears to do nothing; it is plain text with
    `aria-current="page"`.
  - **The task breadcrumb needed the project's name from its id**, which is what
    `getProject` is for — the RPC `rpc-coverage` listed as "redundant, the GUI
    holds the list already". Using it made that exception stale, and **the gate
    said so** on the next run ("listed in EXCEPTIONS but the GUI calls it"),
    which is the case M05-T12 built it for. Exception removed: 93 of 95 now.
  - **The first call used `{ projectId }`; the field is `id`.** The server
    answered `internal`, not `invalid_argument`, because `ZodError` propagates
    as internal across every handler — the defect recorded for **M12** in M04's
    handoff, now observed for a second time from the client side. The breadcrumb
    fell back to the label "Project" and hid it, so the test now asserts the
    real name and the exact request.
  - The artifact breadcrumb walks the folder chain to the root, bounded by the
    folder count for the same reason M05-T10's expansion is: nothing in the
    schema forbids a parent cycle.
- **Next**: M06-T09

## M06-T09 — A switcher that works at 2,000 projects

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `components/layout/OrgProjectSwitcher.tsx` (rewritten), its suite
  (3 tests replaced, 11 added)
- **Verified**: against a real 2,000-project fixture — **1** `ListProjects`
  request to render the switcher, opens in **75 ms**, shows "Showing 10 of 2001
  — keep typing to narrow it down", and one further request finds
  `Bulk Project 1234` by typing. Three requests for the entire session.
  `gui:test` — 597 pass, branches 95.15%. `moon check --all` — 24 pass.
- **Notes**:
  - **The old switcher followed `nextCursor` until it ran out**, for both orgs
    and projects, before the primary navigation control was usable — at 2,000
    projects that is 200 requests. The same unbounded-list shape M03 removed
    from the backend and M05-T04 reintroduced on the client, here in the one
    component every page mounts.
  - **The browser found a bug the unit tests could not.** After picking
    `Bulk Project 1234`, the switcher displayed `Bulk Project 0999`. Closing
    resets the search, page one comes back without the chosen project on it, and
    the auto-select effect read that as "the active project is gone" and
    re-picked `projects[0]`. That effect was correct when the list held *every*
    project; with one page, "not in this list" means "on another page". Now it
    only fires when nothing is selected at all, and a test reproduces the exact
    sequence.
  - **A native `<select>` cannot do this job**: it cannot search, cannot indent
    a hierarchy, and cannot say that what you are looking at is ten of two
    thousand. The replacement is a listbox with the keyboard contract that
    implies — arrows, Enter, Escape, click-outside — each with a test, because
    a combobox nobody can drive from the keyboard is a mouse-only control
    wearing the right ARIA roles.
  - **Organizations indent under their parents** within the page that came
    back. An org whose parent is not on this page renders at the top level
    rather than disappearing: a search result you cannot see is worse than one
    shown without its context.
  - **The 2,000-project fixture needed `setupDatabase("sqlite")` explicitly** —
    `STANDALONE` selects the driver at the server entry point, not inside the
    helper, so the seed script tried MySQL and hung on `ETIMEDOUT`.
  - knip caught the `Choice` interface exported for nobody. Fifth time.
- **Next**: M06-T10

## M06-T10 — The mobile sidebar

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: new `components/ui/useFocusTrap.ts` (extracted from `Dialog`),
  `components/ui/Dialog.tsx`, `components/layout/AppShell.tsx` (+ 6 tests)
- **Verified**: at 390×844 — no backdrop until it opens, a backdrop while open,
  focus lands **inside** the drawer, **40 Tabs and focus left it 0 times**, a
  tap outside closes it, Escape closes it, and navigating leaves it closed.
  `gui:test` — 603 pass, branches 95.2%. `moon check --all` — 24 pass.
- **Notes**: the trap is `Dialog`'s, extracted rather than rewritten —
  ADR-0009's warning is that hand-rolled overlays drift apart, and this app
  already had two that did. Dialog's 19 tests passed unchanged against the
  extracted hook, which is what made the extraction safe to do.
  **Three defects, none of which the unit tests could see:**
  1. **The first "focusable" was invisible.** The sidebar holds a
     `hidden md:block` search trigger, so on a phone `focus()` landed on an
     element inside a `display: none` ancestor and did nothing at all — the
     drawer opened with focus still on the hamburger, and the first Tabs walked
     the header. Now filtered with `checkVisibility`, which jsdom does not
     implement (hence the `?? true`) — so no test could have caught this, in
     either direction.
  2. **The escape callback was a dependency.** Callers write
     `() => setOpen(false)` inline, so its identity changed every render, the
     effect tore down and set up each time, and the teardown restores focus to
     the opener. Held in a ref now.
  3. **Tapping the link for the page you are already on left the drawer open**,
     because the pathname never changes and the effect that closes it keys on
     exactly that. Closed on the click as well. A test pins it by clicking
     Dashboard while already at `/`.
  A fourth, in my own test script rather than the product: `click({force:true})`
  on the backdrop dispatched at the element's centre, which is *underneath* the
  drawer, so it followed a nav link and I read the result as a navigation bug.
- **Next**: M06-T11

## M06-T11 — Empty, loading and error states

- **Status**: done
- **Date**: 2026-08-15
- **Audit**: every view has a loading state. The finding is the *error* state:
  every `isError` reference in `features/*` belongs to a **mutation**. Query
  errors surfaced per view — Projects 0, Labels 0, TaskTypes 0, Artifacts 0,
  Agents 0, Tasks 0, Bin 0, Organizations 1. A failed list therefore falls
  through to the empty branch and renders "No projects found": not a blank
  region but something worse, a confident lie that the user's data is gone,
  with nothing to click to find out otherwise.
- **Changed**: new `components/ui/ListState.tsx` (+ 9 tests), new
  `scripts/query-error-coverage.mjs` + `.test.mjs` (8 tests) wired into
  `moon.yml`; all 8 feature views, the 3 pickers, `BinList` and
  `OrgProjectSwitcher` (+ 1 test).
- **Verified**: with a real browser against a real backend, aborting **only**
  the one RPC each surface depends on and leaving the rest working — all nine
  surfaces (8 views + the switcher) render `role="alert"` with the server's own
  message and a **Try again** button, and **none** renders a "No X" claim.
  `gui:test` — 613 pass, branches 95.11%. `moon check --all` — 25 pass
  (24 before; the new gate is the 25th).
- **Notes**: the interesting part of the audit was not blankness. Loading
  states existed everywhere; what was missing was the *error* state, and its
  absence did not leave a blank region — it left the **empty** one. A failed
  `listProjects` fell through to "No projects found", which tells the user their
  data is gone when the request never arrived. Six of the nine surfaces said
  something false; the switcher said it on every page.
  **The gate paid for itself before it was committed**: after sweeping the eight
  views by hand, `query-error-coverage` named four more readers I had missed —
  `AgentTokens`, `AssigneePicker`, `ReviewerPicker`, `TaskArtifactLinks`. Two of
  those (`ReviewerPicker`, `TaskArtifactLinks`) had the same lie.
  Two deliberate exceptions, both permission-gated on `isSuccess` rather than
  shown as failures (`listInvitations`, `listAgentTokens`) — M03-T13's choice,
  and an exception excuses one query, not a whole file.
  A `Bin` test failed honestly: it set its projects mock *after* the tab click,
  so the first call always rejected and the pane rendered its empty state
  anyway. The failure had been invisible for as long as the test existed.
  And once more, the probe before the finding: the first browser run reported
  zero alerts everywhere. The route pattern used lowercase RPC names against
  PascalCase paths, so nothing was ever aborted. The second run broke `ListOrgs`
  for every view, which only disabled the `enabled: !!activeOrgId` queries
  downstream — also proving nothing. Only the third, one RPC per view with the
  abort counted, said anything.
- **Next**: M06-T12
