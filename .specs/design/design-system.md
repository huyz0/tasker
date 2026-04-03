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

*Note: NEVER hardcode `#hex` colors in UI components. Always use the mapped Tailwind classes above.*

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
