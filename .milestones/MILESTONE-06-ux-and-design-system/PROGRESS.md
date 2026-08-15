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
