# Design System

This document outlines the core tokens, typography, and spacing scales that all UX/UI implementations must strictly follow. AI Agents must reference these tokens exactly when generating Tailwind utility classes over ad-hoc hex codes or pixel sizing.

## 1. Tokens and Colors

We use Semantic HSL variables mapping closely to the Shadcn UI standard.

### Core Semantics

- `primary`: Interactive elements, main branding, active states (e.g., `bg-primary`, `text-primary`).
- `secondary`: Secondary actions, subtle visual distinctions (e.g., `bg-secondary`).
- `destructive`: Error states, deletion actions, destructive warnings.
- `muted`: Disabled text, subtle borders, backgrounds for inactive items (`text-muted-foreground`).
- `accent`: Hover states on menus, slight pop-out background (`bg-accent`).
- `background` / `foreground`: Default document background and base text rendering.

### Status Semantics

`destructive` is an **action** (delete this thing). `success`, `warning`, `info`
and `neutral` are **states** something reports. Each has a solid pair for badges
and a subtle pair for tinted callouts:

| Token | Meaning | Solid | Subtle |
|---|---|---|---|
| success | It worked, it is healthy, it is open | `bg-success text-success-foreground` | `bg-success-subtle text-success-subtle-foreground` |
| warning | It needs attention but has not failed | `bg-warning text-warning-foreground` | `bg-warning-subtle text-warning-subtle-foreground` |
| info | Worth knowing, not a problem | `bg-info text-info-foreground` | `bg-info-subtle text-info-subtle-foreground` |
| neutral | Neither good nor bad — draft, todo, archived, unknown | `bg-neutral text-neutral-foreground` | `bg-neutral-subtle text-neutral-subtle-foreground` |
| destructive | It failed, or this action destroys something | `bg-destructive text-destructive-foreground` | `bg-destructive-subtle text-destructive-subtle-foreground` |

**There is no `danger`.** The failure step is `destructive`, which is also the
delete-action colour, and the two have never needed to differ. A separate
`danger` token would have to be introduced everywhere `destructive` is already
correct, and every call site would then have to answer "is this the action or
the state?" — a question with no consequence, since the answer is the same
colour.

**Pick `neutral` over `muted` for a state.** `muted` means *de-emphasised* — a
disabled control, a secondary label. A "todo" badge is not de-emphasised; it is
reporting a real state that happens to be uneventful. They looked the same on
screen, which is why `bg-muted` kept getting used for both, and it left an
unstyled-looking badge next to styled ones.

**Never spell a status with an alpha tint.** `bg-success/10 text-success` is not
the subtle pair: it is a fourth colour, it is not contrast-checked (the gate
reads token pairs, not arbitrary utilities), and it lands slightly different in
every component that reinvents it. Use `bg-success-subtle
text-success-subtle-foreground`.

- Reach for these instead of `bg-green-100` / `text-red-800`. Raw palette
  utilities were the single largest source of drift in this codebase.
- MUST NOT convey state by colour alone (WCAG 1.4.1). Pair the colour with text
  or an icon.

*Note: NEVER hardcode `#hex` colors in UI components. Always use the mapped Tailwind classes above.*

**This is enforced, not advised.** `moon run gui:design-lint` fails the build on
a raw hex, a raw palette utility, or a token pair below WCAG AA 4.5:1 in either
theme. A genuine exception — a third-party brand colour, or user-chosen entity
data — carries `design-lint-disable-next-line tokens — <reason>`.

### Brand and surfaces

- The brand is a calm violet (`262 56% 50%` light, `262 80% 78%` dark), not
  the fully saturated `271 100% 60%` it replaced: links and active rows should
  read as ink, not compete with content.
- In dark mode `card` and `popover` sit one and two steps above `background`.
  A panel is a lifted surface, not a border drawn on the page colour.
- The `@theme` block is `@theme static`: every token is emitted even when no
  utility class names it, because some (the chart series) are read at runtime
  via `var(--color-…)`. `design-lint` fails a runtime reference otherwise.

## 2. Typography

Use the operational role table in section 6 as the canonical type scale. Routed titles use `PageHeader` and `type-page-title`; panels use `type-section-title`, and open task titles use `type-detail-title`. Keep heading levels semantic rather than choosing a level for its default size.

- **Font**: One system sans stack for interface and reading; `font-data` for identifiers/code. Numeric values may use tabular figures without changing the typeface. No downloaded font is required.
- **Body**: `type-body` for compact operational content; retain the existing readable prose treatment for long descriptions.
- **Small text**: `type-caption` (12px) for secondary metadata. The 10px micro role is limited to incidental counters, never essential controls or explanatory content.
- **Headings**: The base layer balances `h1`–`h3`; do not add this independently at each call site.
- **Page composition**: Every routed screen opens with `PageHeader` (`components/ui/PageHeader.tsx`). Use its toolbar slot for wrapping filters. The application `main` owns the page gutter.

## 3. Spacing & Sizing Scale

- **Scale Metric**: Tailwind default 4-point grid (`1` = `0.25rem` = `4px`).
- **Gaps**: Default `gap-4` for standard component lists. Use `gap-6` for distinct conceptual sections.
- **Micro-metrics**: Use `p-2` or `px-3 py-1` for highly dense badges or tags.
- **Border Radius**: Unified via `--radius` CSS variable. Standard is `rounded-md` for buttons/inputs, `rounded-lg` for cards and modals.

## 4. Components Rules (Atomic)

- Generic inputs, buttons, and dialogs live in `apps/gui/src/components/ui/`.
- Do not build complex business logic into generic `ui/` components.
- Where a component needs real focus, menu, or tab semantics — an overlay, a
  dropdown, a tab set — build it on **Radix** (`@radix-ui/react-*`), per
  [ADR-0011](../adr/ADR-0011-adopt-radix-for-overlay-and-navigation-primitives.md).
  Simple presentational primitives (`Button`, `Card`) stay hand-rolled; the
  line is whether the component needs to manage focus or keyboard
  interaction on behalf of its children.
- **Do not hand-roll a second overlay, menu, or tab implementation.**
  `components/ui/Dialog.tsx` is the one overlay primitive; a new dropdown or
  tab set is a new Radix-backed primitive in `ui/`, not a bespoke
  `useState` toggle inside a feature.

## 6. Operational visual roles (M51)

The interface keeps its restrained violet and system sans stack. Typography expresses the working hierarchy rather than introducing a second display face. Font aliases `font-ui` and `font-data` point to the installed sans and monospace stacks; no network font is required. Color is selected independently from typography so status meaning cannot be overwritten by a caption style.

| Role class | Scale and weight | Use |
|---|---|---|
| `type-page-title` | `text-ui-page`, 28/36, semibold | Routed page title |
| `type-section-title` | `text-ui-section`, 18/24, semibold | Panels and task sections |
| `type-detail-title` | `text-ui-detail`, 20/28, semibold | Open task title |
| `type-item-title` | `text-ui-body`, 14/22, medium | List item titles |
| `type-body` | `text-ui-body`, 14/22, regular | Compact operational content |
| `type-label` | `text-ui-body`, 14/22, medium | Form and control labels |
| `type-caption` | `text-ui-caption`, 12/16, regular | Secondary metadata and text in status badges |
| `type-code` | `font-data`, `text-ui-caption` | Identifiers and code |

Long descriptions continue to use the existing readable body treatment. The 10px micro role is only for incidental counters, never primary controls or explanatory content.

Surface aliases `bg-surface-canvas`, `bg-surface-panel` and `bg-surface-raised` map to `background`, `card` and `popover`. The light canvas has a restrained neutral tint so a white panel can be distinguished without a generic shadow on every box; dark layers keep their existing progression. Foreground/state token pairs remain the contrast contract. Do not use surface colors as workflow-state colors.

Density aliases `h-control` (36px), `min-h-row` (44px) and `p-panel` (16px) express common control, operational row and panel spacing. Use ordinary layout gaps between sections rather than inventing per-screen padding scales.

Built-in task states share one `taskTone` mapping in `components/ui/statusStyles.ts`: todo is neutral, in-progress is information, done is success. Both board headers and table badges use the same subtle pairs and retain visible state text. Custom workflow states use neutral unless their semantic role is explicitly known; a name alone must not imply completion.
