---
id: M59
title: UI Scope and Report Navigation
status: in-progress
goal: People can identify automation scope and navigate readable project reports without losing their current view.
depends_on: [M51, M58]
surfaces: [gui, specs]
exit_criteria_met: false
started_at: 2026-11-22
completed_at: null
---

# M59 — UI Scope and Report Navigation

## 1. Goal

People can tell that automation collections span their organization, identify
a schedule's own project, and move between report exceptions, trends and
spend without losing project/window context or browser navigation.

## 2. Why Now

M51's independently researched review left scope clarity, Reports navigation
and incremental token adoption as follow-ups. M58 supplies URL-owned filters
and saved views. Main134f2fa and all15 post-publication checks are verified.
The next useful UI changes build on that delivered behavior.

## 3. Exit Criteria

- [x] Organization-wide automation collections state their scope and schedules show their own project even when another project is selected.
- [x] Reports sections are addressable and preserve project/window, saved-view application and browser Back/Forward.
- [ ] Reviewed report controls, typography and daily-spend alternatives work in both themes, narrow layouts and enlarged text.
- [ ] Behavioral regressions fail before implementation; actual GUI/browser/visual and repository checks support the final review.

## 4. Scope

In scope: three tasks below, existing semantic colors/system fonts, native
section navigation, independent read states and accessible chart data.

M49 owns delivered load measurements, not a healthy1000/20000-caller claim.
Sustained overload changes require a separate plan. M51's proposed participant
study remains unmeasured; this batch records a protocol, not human-study
results. M58 retains saved-view authorization and definition boundaries.
No backend filter, permission, contract, dependency or font-family change.

## 5. Task Breakdown

- [x] **M59-T01** — Make organization-wide automation scope and each schedule's project visible.
  - **Files**: apps/gui/src/features/Workflows/index.tsx; apps/gui/src/features/Schedules/index.tsx; their tests/stories; this milestone's design/review artifacts.
  - **Verify**: With projectA selected and an authorized projectB schedule returned by the organization list, its row names projectB; existing start/edit and cross-project journeys retain canonical scope. Source-backed static scope wording uses the TDD exception; new data visibility gets an actual red.

- [x] **M59-T02** — Give Reports URL-fragment navigation for Exceptions, Trends and Spend with preserved view state.
  - **Files**: apps/gui/src/features/Reports/index.tsx; index.test.tsx; ReportsScreen.stories.tsx; apps/gui/tests/e2e/reports.spec.ts.
  - **Verify**: Direct links, keyboard activation, Back/Forward, window changes and named-view application select the correct visible section without dropping scope/query/hash or unrelated draft state. Loading/error/denied sections remain navigable; new regressions fail on the current screen first.

- [ ] **M59-T03** — Align report presentation tokens, control targets and daily-spend accessibility, then retain rendered evidence.
  - **Files**: apps/gui/src/features/Reports/ReportPanel.tsx; AgentSpendCard.tsx and tests/stories; Reports/index.tsx; apps/gui/src/index.css; .specs/design/design-system.md; browser verification/evidence.
  - **Verify**: Real DOM geometry proves44px report navigation/window/saved-view targets, reflow at320/375/768/1280px and200% text size; daily cost values have an accessible table. Keep intentional numeric emphasis, verify both themes, run full affected suites and moon check --all, then review four lenses before publication.

## 6. Verification

1. Commit in-progress journal/design/acceptance before code.
2. Run new observable scope/navigation/chart-data and target-size regressions against baseline; capture actual failures.
3. Implement each smallest change; run affected GUI suites and strict checks.
4. Exercise seeded browser journeys and selected rendered states in both themes; compare retained before/after images.
5. Run repository/doc/contrast/Storybook/browser gates; preserve actual counts, skips and limits.
6. Publish one atomic completed-task commit per task after final checks and verify the published tree.

## 7. Risks

- Hash changes must not reset time/project or alter the server's saved-view definition.
- Hidden report panels must keep independent reads and local chart state; hidden content must not masquerade as visible test success.
- Do not steal focus on initial load or when only changing a window.
- Project labels come from the schedule's canonical project, never the global selector.
- Larger controls and numeric type need real geometry checks, not only no-overflow assertions.
- An unavailable runtime is recorded honestly. No screenshot, local execution or participant-study pass is inferred.
