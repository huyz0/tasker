---
id: M06
title: UX, Design System & Accessibility
status: done
goal: The interface is one coherent visual system, every interaction is operable by keyboard and screen reader, and no view is a dead end.
depends_on: [M05]
surfaces: [gui, specs]
exit_criteria_met: true
started_at: 2026-08-15
completed_at: 2026-08-15
---

# M06 — UX, Design System & Accessibility

## 1. Goal

The product looks and behaves as one system. Colour comes from tokens, status
colour comes from a documented scale, dialogs trap focus and restore it, every
detail view can be reached by URL and escaped by breadcrumb, and the navigation
switcher works when there are two thousand projects.

## 2. Why Now

After M05 the screens are feature-complete, which is the right moment to make
them coherent — doing it earlier means reworking components that are about to
change. The accessibility work is also a prerequisite for meaningful E2E
coverage in M12, since dialogs without roles are hard to drive from a test.

## 3. Exit Criteria

- [x] No colour literal outside `index.css` and the documented status scale;
      enforced by a lint rule. — `gui:design-lint`, 128 files, 0 findings; the
      rule set grew two more in T12 (no-op utilities, runtime-built classes).
- [x] Light and dark themes both render every view legibly, and a user can
      choose light, dark, or system. — axe over all 9 views in both themes: 0
      violations (25+2 light and 10+2 dark when first measured, closed in T14).
      `ThemeToggle` offers all three and persists the choice.
- [x] Every modal has `role="dialog"`, `aria-modal`, focus trapping, focus
      restoration and escape-to-close. — one `Dialog` primitive (ADR-0009), 19
      tests; the mobile drawer shares its `useFocusTrap` rather than repeating
      it.
- [x] `window.confirm` appears nowhere; destructive actions use a styled dialog.
      — a sweep test enumerates the source and fails on any occurrence.
- [x] Every detail view shows breadcrumbs back to its parent. — the two
      parameterised routes (`/tasks/:taskId`, `/artifacts/:artifactId`) are the
      detail views, and both render `Breadcrumbs`.
- [x] The org/project switcher is searchable and does not preload every record.
      — against 2,001 projects: 2 `ListOrgs` + 2 `ListProjects` at boot, one
      page of 10, "Showing 10 of 2001", and a typed query finds the exact
      project on another page.
- [x] Storybook's accessibility addon runs in CI at `error` severity and passes.
      — `test: 'error'`, and `moon run gui:storybook-test` runs axe over all 21
      stories in a real browser: 0 violations. **Observed locally; in CI this is
      verified as configuration** — the workflow step and the browser install
      are committed and pinned by `storybook-a11y-config`, but no CI run has
      executed them yet.

## 4. Scope

**In Scope**: token compliance, the status colour scale, an accessible dialog
primitive, breadcrumbs, the switcher, the mobile sidebar, theme selection,
empty and error states, the a11y gate.

**Out of Scope**: list virtualization for performance (M07), new features (M05),
a graphical workflow canvas unless the ADR in M06-T02 concludes it is warranted.

## 5. Task Breakdown

- [x] **M06-T01** — Define a semantic status colour scale (success, warning,
      danger, info, neutral) as tokens in `design-system.md` and `index.css`,
      with light and dark values.
      - Files: `.specs/design/design-system.md`, `apps/gui/src/index.css`
      - Verify: `BuildBadge` and the PR badges use the same success token.

- [x] **M06-T02** — Decide the component-library question in an ADR: adopt Radix
      primitives (as `tech-stack.md` originally claimed) or formalise the
      hand-rolled set. Whichever is chosen, `tech-stack.md` must match.
      - Files: `.specs/adr/ADR-0009-component-primitives.md`
      - Verify: the ADR is referenced by the dialog implementation.

- [x] **M06-T03** — Build the accessible `Dialog` primitive and migrate the task
      detail overlay and the search palette onto it.
      - Files: `apps/gui/src/components/ui/Dialog.tsx`, call sites
      - Verify: tab cycles within the dialog; closing restores focus to the trigger.

- [x] **M06-T04** — Replace every `window.confirm` with a `ConfirmDialog` that
      names the consequence and the undo path.
      - Files: all `features/*` delete handlers
      - Verify: no `window.confirm` remains in `src/`.

- [x] **M06-T05** — Move `PaginationControls`, `Login` and `ErrorBoundary` onto
      tokens and remove the hex literal from the OAuth button.
      - Files: those three components, `RepositoryIntegrationConfig.tsx`
      - Verify: the login page respects the active theme.

- [x] **M06-T06** — Add a lint rule (oxlint or a custom check) forbidding raw
      Tailwind palette classes and hex literals in `src/components` and `src/features`.
      - Files: `.oxlintrc.json` or `scripts/check-tokens.ts`, `moon.yml`
      - Verify: adding `bg-blue-600` fails the lint task.

- [x] **M06-T07** — Add a theme toggle (light / dark / system) persisted to
      local storage and applied via a root attribute.
      - Files: `apps/gui/src/store/layout.ts`, `AppShell.tsx`, `index.css`
      - Verify: the choice survives reload and overrides the OS preference.

- [x] **M06-T08** — Build a `Breadcrumbs` component and mount it on every detail
      route introduced in M01, reflecting the path the user arrived by.
      - Files: `apps/gui/src/components/layout/Breadcrumbs.tsx`, route views
      - Verify: a deep-linked task shows project → task.

- [x] **M06-T09** — Replace the two native switcher selects with a searchable
      combobox querying the server by name, showing org hierarchy as indentation.
      - Files: `apps/gui/src/components/layout/OrgProjectSwitcher.tsx`
      - Verify: with 2,000 projects the switcher opens instantly and finds one by typing.

- [x] **M06-T10** — Mobile sidebar: add a backdrop, close on navigation, and trap
      focus while open.
      - Files: `apps/gui/src/components/layout/AppShell.tsx`
      - Verify: tapping outside closes it; the underlying page is not focusable.

- [x] **M06-T11** — Audit empty, loading and error states across every view and
      give each one an action rather than a dead end.
      - Files: all `features/*`
      - Verify: no view renders an unexplained blank region.

- [x] **M06-T12** — Fix the invalid `border-t/50` utility and sweep for other
      no-op class names.
      - Files: `apps/gui/src/components/layout/AppShell.tsx`
      - Verify: the token lint reports no unknown utilities.

- [x] **M06-T13** — Set Storybook's a11y addon to `error` and add
      `moon run gui:storybook-test` to CI.
      - Files: `apps/gui/.storybook/preview.tsx`, `moon.yml`, `.github/workflows/ci.yml`
      - Verify: a component with a contrast violation fails CI.

- [x] **M06-T14** — Close the five accessibility violations that running axe
      over every view in both themes surfaced, which the exit-criteria check
      found and no per-task check could: `text-primary` on `bg-primary/10`
      (4.2:1) and on `bg-primary/20` (3.38:1), `text-muted-foreground/70`
      (2.84:1 light, 4.23:1 dark), the bin-retention input with no label, and
      the organization row whose `role="button"` wrapper contains focusable
      children. Add a `primary-subtle` token pair so the tinted-surface case is
      covered by the contrast gate rather than by a className.
      - Files: `apps/gui/src/index.css`, `components/layout/AppShell.tsx`,
        `components/BuildBadge.tsx`, `features/Organizations/index.tsx`
      - Verify: axe over all 9 views, in light **and** dark, reports 0
        violations.

## 6. Verification

```bash
moon run gui:lint gui:test gui:storybook-test gui:e2e
```

## 7. Risks

Adopting Radix in M06-T02 pulls in a dependency family that the current bundle
does not carry. Measure the bundle delta and record it in the ADR; if the cost
is unacceptable, formalising the hand-rolled set is an equally valid outcome as
long as the accessibility criteria are still met.
