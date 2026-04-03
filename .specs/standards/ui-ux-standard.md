# UI/UX Standards

## 1. Design Tokens & System

- **Rule**: NEVER hardcode color hexes or ad-hoc pixel values
  (`style={{ color: '#000' }}`).
- **Action**: Strictly use Tailwind CSS classes mapped to tokens
  (`text-primary`, `bg-background`). Prefer cohesive, bold palettes over timid
  AI defaults.
- **Reference**: MUST strictly follow the explicit token mappings defined in `.specs/design/design-system.md`.
- **Components**: Rely purely on standard UI primitive libraries (**Shadcn
  UI**). Place generic components in `apps/gui/src/components/ui/` and standard layouts in `apps/gui/src/components/layout/`. Macro layouts MUST align with `.specs/design/layout-manifest.md`.

## 2. Accessibility (a11y)

- **Minimum Target**: WCAG 2.1 AA.
- **Forms**: All inputs MUST have an associated label. Use `aria-describedby`
  for errors.
- **Keyboard Navigation**: Ensure all paths are keyboard-navigable. Never
  suppress `focus-visible:ring-2` styling.
- **Color Contrast**: 4.5:1 minimum text-to-background contrast ratio (3:1 for
  large graphical text).

## 3. Responsive Design

- **Mobile-First**: Design for narrow widths (`320px-375px`) first, scale up via
  Tailwind breaks (`md:`, `lg:`).
- **No Overflow**: Prevent accidental horizontal scrollbars. Contain wide table
  content inside horizontal scrolling wrappers.

## 4. Micro-interactions & Polish

- **States**: Enforce distinct `hover:`, `focus:`, and `active:` states.
- **Direct Manipulation**: Favor inline edits or drag layouts over disconnected
  forms.
- **Intentional Motion**: Use native Browser View Transitions over heavy JS
  libraries.
  - Directional slides only for depth transitions (list -> detail).
  - Tab switching must fade or jump instantly.
- **Loading & Errors**: Use Skeletons to block layout shift. Expose Retry
  states.

## 5. Visual Hierarchy & Spacing

- **Typography Metric**: Map `h1`-`h6`, `body`, and `small`. Pair distinct
  display fonts with readable body text. Avoid generic AI fonts unless matching
  brand guidelines exactly.
- **Composition**: Embrace functional grouping and intentional whitespace
  proximity. Break symmetry for high-impact landing layouts.
