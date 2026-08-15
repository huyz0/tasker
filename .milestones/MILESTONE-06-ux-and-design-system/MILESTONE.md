---
id: M06
title: UX, Design System & Accessibility
status: in-progress
goal: The interface is one coherent visual system, every interaction is operable by keyboard and screen reader, and no view is a dead end.
depends_on: [M05]
surfaces: [gui, specs]
exit_criteria_met: false
started_at: 2026-08-15
completed_at: null
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

- [ ] No colour literal outside `index.css` and the documented status scale;
      enforced by a lint rule.
- [ ] Light and dark themes both render every view legibly, and a user can
      choose light, dark, or system.
- [ ] Every modal has `role="dialog"`, `aria-modal`, focus trapping, focus
      restoration and escape-to-close.
- [ ] `window.confirm` appears nowhere; destructive actions use a styled dialog.
- [ ] Every detail view shows breadcrumbs back to its parent.
- [ ] The org/project switcher is searchable and does not preload every record.
- [ ] Storybook's accessibility addon runs in CI at `error` severity and passes.

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

- [ ] **M06-T07** — Add a theme toggle (light / dark / system) persisted to
      local storage and applied via a root attribute.
      - Files: `apps/gui/src/store/layout.ts`, `AppShell.tsx`, `index.css`
      - Verify: the choice survives reload and overrides the OS preference.

- [ ] **M06-T08** — Build a `Breadcrumbs` component and mount it on every detail
      route introduced in M01, reflecting the path the user arrived by.
      - Files: `apps/gui/src/components/layout/Breadcrumbs.tsx`, route views
      - Verify: a deep-linked task shows project → task.

- [ ] **M06-T09** — Replace the two native switcher selects with a searchable
      combobox querying the server by name, showing org hierarchy as indentation.
      - Files: `apps/gui/src/components/layout/OrgProjectSwitcher.tsx`
      - Verify: with 2,000 projects the switcher opens instantly and finds one by typing.

- [ ] **M06-T10** — Mobile sidebar: add a backdrop, close on navigation, and trap
      focus while open.
      - Files: `apps/gui/src/components/layout/AppShell.tsx`
      - Verify: tapping outside closes it; the underlying page is not focusable.

- [ ] **M06-T11** — Audit empty, loading and error states across every view and
      give each one an action rather than a dead end.
      - Files: all `features/*`
      - Verify: no view renders an unexplained blank region.

- [ ] **M06-T12** — Fix the invalid `border-t/50` utility and sweep for other
      no-op class names.
      - Files: `apps/gui/src/components/layout/AppShell.tsx`
      - Verify: the token lint reports no unknown utilities.

- [ ] **M06-T13** — Set Storybook's a11y addon to `error` and add
      `moon run gui:storybook-test` to CI.
      - Files: `apps/gui/.storybook/preview.tsx`, `moon.yml`, `.github/workflows/ci.yml`
      - Verify: a component with a contrast violation fails CI.

## 6. Verification

```bash
moon run gui:lint gui:test gui:storybook-test gui:e2e
```

## 7. Risks

Adopting Radix in M06-T02 pulls in a dependency family that the current bundle
does not carry. Measure the bundle delta and record it in the ADR; if the cost
is unacceptable, formalising the hand-rolled set is an equally valid outcome as
long as the accessibility criteria are still met.
