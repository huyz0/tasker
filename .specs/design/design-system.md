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

## 2. Typography

- **Font Family**: System UI / Sans-Serif (`sans`). Do not import custom web fonts unless explicitly defined by brand guidelines.
- **Headings**:
  - `h1`: `text-3xl font-semibold tracking-tight` (or larger `text-4xl text-5xl` for marketing/hero spots).
  - `h2`: `text-2xl font-semibold tracking-tight`
  - `h3`: `text-xl font-medium tracking-tight`
- **Body**: `text-base` for standard read, `text-sm` for dense data tables and secondary text.
- **Data/Code**: Use `font-mono` for metrics, telemetry `id`s, or command line references.

## 3. Spacing & Sizing Scale

- **Scale Metric**: Tailwind default 4-point grid (`1` = `0.25rem` = `4px`).
- **Gaps**: Default `gap-4` for standard component lists. Use `gap-6` for distinct conceptual sections.
- **Micro-metrics**: Use `p-2` or `px-3 py-1` for highly dense badges or tags.
- **Border Radius**: Unified via `--radius` CSS variable. Standard is `rounded-md` for buttons/inputs, `rounded-lg` for cards and modals.

## 4. Components Rules (Atomic)

- **Shadcn UI Base**: Leverage Shadcn UI patterns. When building generic inputs, buttons, or dialogs, place them in `apps/gui/src/components/ui/`.
- Do not build complex business logic into generic `ui/` components.
- Rely on accessible Radix primitives (or similar accessible ARIA-compliant base structures) whenever possible.
