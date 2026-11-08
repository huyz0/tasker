---
id: M51
title: UI Navigation and Layout
status: in-progress
goal: People can navigate, read and supervise agent work through a coherent interface at mobile, tablet and desktop sizes.
depends_on: []
surfaces: [backend, gui, specs]
exit_criteria_met: false
started_at: 2026-11-08
completed_at: null
---

# M51 — UI Navigation and Layout

## 1. Goal

Tasker presents daily work before administration, retains visible project context, and uses consistent typography, surfaces and screen patterns without hiding content at intermediate widths.

## 2. Why Now

The rendered review found a 48px task-content region at 375px and collapsed headings/clipped filters at 768px and 1024px despite a passing design-lint gate. Seventeen navigation destinations and repeated empty panels dilute the daily supervision flow. The user requested independent research and delivery of a detailed plan.

## 3. Exit Criteria

- [x] Task titles, descriptions, metadata and actions remain reachable at 375px; headers and filters remain readable at 768px and 1024px.
- [x] Daily navigation is grouped by activity with all existing destinations and URL scope preserved; mobile identifies its current project.
- [ ] Typography, density, surface and task-status roles are documented and applied consistently in light and dark themes.
- [ ] Workflow/schedule empty states have a clear creation action; optional empty task content and report exceptions no longer overwhelm the screen.
- [ ] Browser regressions, GUI coverage and local gates pass, with screenshots and remaining limitations recorded.

## 4. Scope

In scope: the seven tasks below, existing routes and server contracts, documentation and browser evidence. Work is isolated in its own worktree because M46 has unfinished event-relay changes. M44–M50 reliability work remains tracked separately and is not marked complete by this milestone. No new font package, backend API, permission model, attention-inbox feature, or destructive data operation is introduced. A future font-family change requires visual comparison and explicit delivery scope; this pass fixes type roles using the installed system stack.

## 5. Task Breakdown

- [x] **M51-T01** — Record the researched UI direction, implementation boundaries and executable acceptance scenarios with reliable baseline gates.
  - **Files**: design/UX-DESIGN.md; .test-plans/TEST-PLAN-0051-ui-navigation-and-layout/TEST-PLAN.md; apps/backend/src/modules/webhooks/delivery.test.ts
  - **Verify**: Compare the direction with captured screens and external primary guidance; define navigation, typography, surface and density roles before implementation.

- [x] **M51-T02** — Restore usable task detail and header layouts at mobile, tablet and small laptop widths.
  - **Files**: apps/gui/src/components/ui/PageHeader.tsx; apps/gui/src/features/Tasks/index.tsx; apps/gui/tests/e2e/ui-layout.spec.ts
  - **Verify**: At 375px the task title and description occupy usable space and all properties are reachable; at 768/1024px the heading and every toolbar action remain visible without overlap.

- [x] **M51-T03** — Group navigation by daily activity and keep project context visible on mobile.
  - **Files**: apps/gui/src/components/layout/AppShell.tsx; AppShell.test.tsx; AppShell.stories.tsx
  - **Verify**: Group Work, Agents, Knowledge, Automation, Reports and Settings; preserve every route, scoped query string, active indication, keyboard access and mobile dismissal; expose current project in the header.

- [ ] **M51-T04** — Introduce shared typography, density and surface roles with consistent task status semantics.
  - **Files**: apps/gui/src/index.css; .specs/design/design-system.md; apps/gui/src/components/ui/; apps/gui/src/features/Tasks/
  - **Verify**: Preserve the violet identity and system font; distinguish canvas/panel/raised surfaces, page/section/item/body/caption roles and status colors in both themes; color contrast gate passes.

- [ ] **M51-T05** — Give workflow and schedule empty states a clear first action and usable creation layout.
  - **Files**: apps/gui/src/features/Workflows/; apps/gui/src/features/Schedules/
  - **Verify**: Empty views offer one coherent introduction and creation action; populated master-detail and new-item routes remain usable at 375/768/1280px; loading/error/retry remain distinct.

- [ ] **M51-T06** — Reduce empty task-detail sections and bound report exceptions while retaining access to every item.
  - **Files**: apps/gui/src/features/Tasks/; apps/gui/src/features/Reports/; apps/gui/src/pages/Dashboard.tsx
  - **Verify**: Empty optional task context is disclosed on demand; populated content remains visible; reports show a bounded exception preview with accessible expand/collapse; dashboard avoids equally prominent empty panels.

- [ ] **M51-T07** — Verify all delivered layouts, navigation journeys and documentation against the browser and full gates.
  - **Files**: apps/gui/tests/e2e/ui-layout.spec.ts; design/; reviews/; .milestones/STATE.md
  - **Verify**: Capture desktop/tablet/mobile in both themes, run GUI coverage and browser journeys, run moon check --all, inspect console errors and record four-lens review with exact evidence.

## 6. Verification

1. Write and run browser regressions reproducing the actual layout failures before changing layout code.
2. Run focused component tests for navigation, disclosure and exception expansion behavior.
3. Capture seeded real-backend views at 375, 768, 1024 and 1280px; inspect light/dark, empty and populated states, and open/close/back navigation.
4. Run `moon run gui:test gui:typecheck gui:design-lint` and explicit Playwright journeys with one worker.
5. Run `moon check --all`, inspect failures and console output, and record correctness, coverage, architecture and security review before closure. Local optional CI simulation is not remote CI evidence.

## 7. Risks

Moving navigation can disrupt learned locations; preserve route URLs and label familiar destinations. Collapsing content must preserve discovery and controls. Status mapping must leave custom workflow states readable. Shared tokens can affect every screen, so inspect representative views in both themes. Revert the individual task commit if verification fails; backend reliability commits remain independent.
