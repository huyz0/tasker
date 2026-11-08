# Tasker UI/UX review and delivered improvements

Reviewed 2026-11-08 against the running seeded application and its implementation. The strongest improvement is a clearer working hierarchy: daily work first, task content before empty metadata, and creation screens with an obvious next action. Keep the restrained violet identity and system font. The observed reading and navigation problems justified structural changes before a font-family or brand redesign.

## What the implementation supports

Tasker serves people supervising agent work: tasks and their relations, approvals and questions, agent activity, handoffs, knowledge, automation and reports. It is a React/Vite client with React Router, TanStack Query for remote state and Zustand for layout. Shared primitives include Radix-backed overlays/navigation; Tailwind v4 semantic HSL tokens define both themes. Connect-RPC clients consume the shared TypeSpec contract, also used by the Go CLI. The UI is a client of the task system rather than an agent runtime.

The existing foundations are useful: scoped URLs, shared PageHeader/ListState/Dialog primitives, generated contracts, per-query error states, keyboard behavior tests and meaningful status pairs. Important layout bugs nevertheless passed design lint and no-overflow checks. Rendered geometry and real navigation are therefore necessary evidence alongside static checks.

## Findings and delivery

| Priority | Observed problem | User impact | Delivered in M51 |
|---|---|---|---|
| P0 | At 375px the task reading region shrank to 48px above metadata | Title/description and comments were effectively hidden | One mobile scroll owner, content followed by properties; desktop columns retained |
| P1 | Task headings had zero usable width at 768/1024px as filters competed with them | Page context and actions became hard to read | Separate wrapping toolbar beneath the title |
| P1 | Seventeen destinations competed in one navigation list | Daily work and administration had equal prominence | Activity groups, discoverable settings disclosure, automatic settings-route expansion |
| P1 | Mobile lacked visible project context | People had to open navigation to verify scope | Project label in the mobile header; scoped URLs preserved |
| P1 | Empty automation screens repeated empty-list and choose-detail prompts | First-time creation lacked a coherent starting point | One introduction/action; full-width selected views below 1024px; return/Cancel flows retained |
| P1 | Mobile schedule actions squeezed its heading to 128px | The description became a narrow column | Actions stack below the description on narrow screens |
| P2 | Page/panel headings and state appearance varied | Weak hierarchy slowed scanning | Shared type, surface and density roles; common board/table status mapping |
| P2 | Empty optional task sections, tall empty dashboard panels and long report exceptions dominated reading | Relevant work appeared farther down the screen | Native optional-context disclosure, compact empty panels, five-item exception preview with all loaded rows reachable |

Navigation now groups Work (Dashboard, Tasks, Handoffs), Agents, Knowledge, Automation and Insights above Workspace settings. Familiar destination names and every existing URL remain. `/settings` is labeled **Account & system** in navigation because it contains both account controls and backend telemetry; **System health** remains the actual telemetry section heading.

Automation uses list/detail on desktop and collection → full-width detail/editor below 1024px. Empty, loading and access-denied states remain distinct. Existing authorization and creation endpoints retain their behavior.

## Palette, tokens and fonts

Preserve violet for interaction and selection. Use neutral for todo/custom states, information for in-progress, success for done, and warning/destructive roles for conditions that warrant attention. Keep visible state text: color alone is insufficient, and a custom status name cannot establish its meaning.

Canvas, panel and raised aliases map to existing background/card/popover values. A restrained light canvas separates white panels without introducing stronger shadows. Existing dark layers remain. The contrast gate checks semantic foreground/background pairs in both themes; rendered accessibility checks complement that static contract.

Keep one system sans stack with monospace for identifiers/code. Shared roles now define page titles at 28/36 semibold, sections at 18/24 semibold, task titles at 20/28 semibold, operational body/labels at 14/22, and captions at 12/16. Long task descriptions retain readable prose styling. The 10px micro role is limited to incidental counters. Common control/row/panel tokens are 36px, 44px and 16px. Adoption covers shared primitives and the principal reviewed screens; legacy components still need incremental role adoption.

A new font family has no demonstrated benefit from this review. If a stronger typographic identity is desired later, compare the current stack and IBM Plex Sans with the same real task/table content, at the same sizes and weights, including font loading and fallback behavior.

## Remaining priorities

1. **Clarify organization-wide versus project-specific scope.** Workflow and schedule collections query by organization; the selected project supplies creation/start context. The global project label alone can imply that these lists are project-filtered. Give organization-wide screens an explicit scope label, or introduce an intentional filter with matching server/query semantics. Validate the wording before changing the scope contract.
2. **Validate the navigation with users.** Test finding a task, switching project, answering an agent question, creating automation and locating account settings. A proposed acceptance target is four of five participants completing each on their first attempt within 15 seconds. This is a future validation target, not a measured result. Watch whether settings disclosure and the separation of Agents from Work match users' expectations.
3. **Give Reports local navigation.** The exception preview improves its first screen, but exceptions, trends and spend still form a long analytical page. Prototype addressable sections for Exceptions, Trends and Spend; preserve project/time filters and browser Back. Compare that prototype with the current page before implementation.
4. **Finish token adoption as components change.** Consolidate remaining direct type/spacing choices into the documented roles. Audit long names, realistic counts, dense tables, 200% zoom and 320px views. Raise primary mobile touch controls toward 44px while retaining useful desktop density. Avoid converting every status/counter into a prominent badge.
5. **Strengthen visual regression coverage.** Retain geometry checks as well as overflow checks. Use deterministic empty/loading/denied/populated fixtures and verify that a story actually rendered before running axe. The rendered accessibility sweep also found a prohibited account-label attribute; an explicit named group now exposes the account correctly, including mobile. This pass repaired missing query providers in the shell/workbench stories and a nested-router fixture in Reports. Other screens' fixtures have not all been audited. Storybook's development Vitest addon still requests a missing `/vite-inject-mocker-entry.js`; that separate harness issue remains.

## Evidence and limits

The original review captured 32 application views. Final application verification covers six routes × four widths (375/768/1024/1280px) × two themes, with settled task editors. These 48 captures report no application console errors or document overflow. A curated set is committed below; full execution captures and machine results remain under `/tmp/tasker-ui-review` in this workspace. The fixtures contain synthetic local data.

- [Before: mobile task reading failure](evidence/before-task-mobile.png) → [After: task content and disclosure](evidence/after-task-mobile.png)
- [Before: tablet heading/filter collision](evidence/before-tasks-tablet.png) → [After: separate toolbar](evidence/after-tasks-tablet.png)
- [Compact empty dashboard beside populated activity](evidence/dashboard-mixed-state.png)
- [Bounded report exceptions](evidence/after-reports-desktop.png)
- [Purposeful workflow introduction](evidence/workflow-empty.png)
- [Readable mobile schedule detail](evidence/schedule-mobile.png)

See [verification evidence](VERIFICATION.md), the [seven-task plan](../MILESTONE.md), [UX decisions and research sources](UX-DESIGN.md), and [acceptance scenarios](../../../.test-plans/TEST-PLAN-0051-ui-navigation-and-layout/TEST-PLAN.md). This is a heuristic and implementation review with seeded-browser evidence, not a usability study or a production-load assessment. M44–M50 reliability delivery remains separately tracked.
