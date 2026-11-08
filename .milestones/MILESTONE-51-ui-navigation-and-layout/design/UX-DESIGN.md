# UI direction — an operational workspace

## Research and judgment

Read on 2026-11-08: [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md), [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md), [Carbon productive typography](https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets), [Carbon layering](https://www.carbondesignsystem.com/building-blocks/foundations/color/guidelines) and [NN/G local navigation](https://www.nngroup.com/articles/local-navigation/). These sources inform judgment; none establishes usability without observing Tasker's own flows. Baseline screenshots are retained under `/tmp/tasker-ui-review` in this execution environment.

Tasker should read as a calm operational workspace. Preserve violet for interaction and selection; reserve warning, success and information colors for state. Retain the installed system sans stack: changing fonts before fixing hierarchy would obscure rather than solve the observed problems. IBM Plex is a possible later comparison, not an installed dependency. Reject a decorative redesign, stronger shadows and indiscriminately denser cards: each would leave the navigation and responsive failures intact.

## Navigation

Keep existing route URLs. Order daily work first: Dashboard, Tasks and Handoffs under Work; AI Agents under Agents; Artifacts and Memory under Knowledge; Workflows and Schedules under Automation; Reports under Insights. Workspace settings contains Projects, Task Types, Labels, Organizations, Teams, Roles, Bin and Account & system. The `/settings` screen includes account controls as well as health; the earlier review label suggestion of System health alone was too narrow. Less-frequent settings may collapse, but auto-expand on a settings route, preserving discoverability and familiar destination names. A visible disclosure button has an accessible expanded state. Current project is visible on mobile without opening the drawer. Links retain organization/project parameters, active indication and browser-history behavior. Closing a task returns to the scoped task list; Back reopens it.

## Layout

The page title and descriptive text own one row. A growing set of filters belongs below, wraps within available space and never competes with the title's minimum width. Mobile task detail uses one scroll owner, content followed by metadata; desktop retains content and property columns. All controls must be reachable through ordinary scrolling and keyboard navigation. The board intentionally scrolls horizontally; its toolbar must not.

Workflow and schedule screens use one empty introduction with one primary creation action. Once populated, a bounded master list sits beside detail on desktop and stacks on mobile. Error states explain failure with Retry, loading retains a status indicator, and access-denied errors remain errors rather than empty collections. Permission handling stays with the existing server and shared error components.

## Visual roles

- Color: existing `primary`/`primary-subtle` for interaction/selection; existing state subtle pairs for meaningful status, always accompanied by text.
- Surfaces: canvas, panel and raised roles map to existing background/card/popover values; light canvas gains a restrained neutral distinction, dark layering remains deliberate.
- Type: page, section, item, body, label, caption and code roles are shared classes; use one system sans stack, with monospace limited to identifiers/code. Page titles remain prominent, headings are medium or semibold, task reading uses body text and operational rows use compact body text. Essential controls never rely on the 10px micro role.
- Density: shared control, row and panel roles standardize existing spacing. Use ordinary section gaps for composition; avoid a border and shadow around every subsection.

## Density and disclosure

Empty optional task summary, plan and cost sections use native accessible disclosures; existing content opens normally. Descriptions, comments and notes remain primary. Report exception lists start with a bounded preview and an explicit count-bearing expansion control, without discarding any entries. Dashboard empty panels become compact summaries while populated panels retain their space.

## Review boundaries

Do not change authorization, server calls, routing scope semantics or user data to achieve a visual result. Empty, loading, error and access-denied states retain distinct copy. Both themes, 375/768/1024/1280px and realistic seeded lists are acceptance surfaces. Treat no-overflow checks as necessary but insufficient: the original clipped header passed that check.
