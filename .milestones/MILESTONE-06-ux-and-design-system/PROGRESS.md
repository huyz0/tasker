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
