# UI design review — 2026-10-02

Whole-app review of the GUI (`apps/gui`): layout, UX and design tokens.
Every routed screen was captured light and dark at 375px and 1280px against
seeded data (`bun run seed`), and judged by reading the screenshots, not the
source.

## Method

Rubrics, installed as user-scope agent skills (`~/.claude/skills/`):

| Skill | Source | Used for |
|---|---|---|
| `frontend-design` | [anthropics/claude-code](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design) | Aesthetic direction; the "generated-UI defaults" calibration list |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Static rules: focus, forms, typography, dark mode, i18n |
| `redesign-existing-projects` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | Audit checklist for an existing UI |

The marketing-page advice in the last one (grain overlays, stock imagery,
scroll-driven motion) does not apply to a dense work tool and was not used.
The project's own `design-review` skill, `design-system.md` and
`gui:design-lint` were the binding references.

## Findings

Severity follows the `design-review` skill: Critical and Major block.

### Critical

| # | Finding | Where |
|---|---|---|
| C1 | Four of six chart series had no colour. Tailwind v4 prunes theme variables no utility uses, and `chartColor()` reads them at runtime | `index.css` `@theme`, `charts/scale.ts:105` |
| C2 | List/detail screens did not stack at 375px; the detail pane shrank to one word wide | Artifacts, Task Types |
| C3 | Roles matrix unusable at 375px: one checkbox column visible, no scroll cue, row text on the border | `features/Roles` |

### Major

| # | Finding | Where |
|---|---|---|
| M1 | No shared page header: three title sizes, an extra `p-4` gutter on four screens, no `h1` on two | every route |
| M2 | The desktop sidebar stretched with the page (5,600px on the task board), so the nav and account scrolled away | `AppShell.tsx` |
| M3 | The task board grew to 5,600px. Columns were unbounded, so the whole page scrolled | `features/Tasks` |
| M4 | Every cancelled RPC (stream teardown on navigation) was reported as an error, both in the console and in the backend error log | `lib/connectTransport.ts` |
| M5 | Dark mode: `card` and `popover` were the page colour, so panels and menus did not separate. No `color-scheme`, no `theme-color`, and the page flashed light before paint | `index.css`, `index.html` |
| M6 | Empty states contradicted themselves ("No teams yet." beside "Select a team…") | Teams, Memory |
| M7 | Disabled primary buttons rendered as `bg-muted`, so an empty login form had no visible primary action | `ui/button.tsx` |
| M8 | Raw-hex GitHub button nearly invisible in dark mode | `RepositoryIntegrationConfig.tsx` |
| M9 | Overflow at 375px: repo input, label swatch and Create button, theme toggle clipped in the mobile header | several |
| M10 | Agents table misaligned: header over the wrong column, names wrapping one word per line | `features/Agents` |
| M11 | `design-lint` passed while 32 strings used `...`; the regex could not match after a letter, and the div-`onClick` rule read one line at a time | `scripts/design-lint.mjs` |

### Tokens

- Brand `271 100% 60%` was a fully saturated violet, the most common colour of
  generated "AI" interfaces. It competed with content wherever it appeared.
- `text-[10px]`/`text-[11px]` appeared 13 times: a missing type step.
- The base layer had no `text-wrap: balance` on headings and no
  `touch-action: manipulation`.

### Minor

- The search trigger label wrapped onto two centred lines.
- The theme toggle left an empty band.
- Nav group labels were all-caps and tracked.
- "No more items to load" showed under one-item lists.
- Em-dashes were used as sentence glue in Reports subtitles.
- "pong from backend!" had an exclamation mark.
- Section headings were in Title Case.
- `toLocaleString()` was used with no `<time>` element, and the Reports locale was hardcoded to `en-US`.
- Several inputs had no `name`/`autoComplete`.
- `autoFocus` fired on page load.

## Fixes

All Critical and Major findings and the token findings are fixed on
`chore/ui-design-review`. Verification at the last commit:

- `gui:design-lint` passes. It also gained three rules: the ellipsis rule
  that now works, the multi-line div-`onClick` rule, and a check for
  runtime token references.
- `tsc -b` is clean.
- vitest passes: 1,206 tests.
- Playwright e2e passes: 47 of 47 on a freshly seeded backend.

Fixing the e2e suite surfaced one more defect, now fixed.

**The first click after load was undone.** The org/project switcher's
auto-select wrote the URL scope onto the page the shell had *rendered* on. It
landed 11ms after a sidebar click and sent the user back to where they had
been (`hooks/useScope.ts`).

## Deferred

- **Shared `Input` and `Badge` primitives.** 56 hand-copied input class
  strings and 7 copies of the badge pill. This is a refactor across every
  feature, so it is better done as its own change.
- **Brand mark.** The shell uses the generic lucide `Activity` icon. A real
  mark is a brand decision, not a review fix.
- **A shared `formatDateTime` helper.** Tasks, Handoffs, Memory, Bin,
  AgentTokens and CommentItem each build the same `Intl.DateTimeFormat`.
- **A page-scroll mode for `VirtualList`.** Projects and Roles dropped their
  inner scroll boxes, so they render every loaded row. That is fine at
  today's page sizes.
- **Remaining copy and label work:**
  - Button labels are still in Title Case ("Ping Backend", "Load More").
  - The "Recent completions" label on Reports is all caps.
  - Handoffs shows raw status values (`in_progress`).
  - Register has no brand mark.
  - Set password still disables submit until the fields are valid.
- **Light-mode greys** are still the stock shadcn slate. They are consistent
  (one cool family) and pass contrast, so changing them is taste, not a
  defect.
