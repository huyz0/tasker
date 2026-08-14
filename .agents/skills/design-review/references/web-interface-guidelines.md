# Web Interface Guidelines

Adapted from [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)
(MIT), trimmed to this stack — React 19, Vite, Tailwind, Radix/Shadcn — with the
Next.js-only rules removed.

Vendored rather than fetched at review time on purpose: a gate that needs the
network fails offline and in CI, and a third-party file pulled at runtime is
unreviewed code. Refresh it deliberately from the upstream `command.md`.

Rules `apps/gui/scripts/design-lint.mjs` already decides statically are marked
**[gated]** — do not spend judgement on them.

## Accessibility

- Icon-only buttons need `aria-label`
- Form controls need `<label>` or `aria-label`
- Interactive elements need keyboard handlers
- `<button>` for actions, `<Link>` for navigation — never `<div onClick>` **[gated]**
- Images need `alt` (or `alt=""` if decorative) **[gated]**
- Decorative icons need `aria-hidden="true"`
- Async updates (toasts, validation) need `aria-live="polite"`
- Semantic HTML before ARIA
- Headings hierarchical `<h1>`–`<h6>`; a skip link to main content
- `scroll-margin-top` on heading anchors
- Never convey state by colour alone — WCAG 1.4.1. Pair colour with text or an icon

## Focus

- Every interactive element has a visible focus indicator **[gated]**
- Never `outline-none` without a replacement **[gated]**
- `:focus-visible` over `:focus`, so a click does not leave a ring
- `:focus-within` for compound controls
- Focus order follows visual order; a modal traps focus and restores it on close

## Forms

- Inputs need `autocomplete` and a meaningful `name`
- Correct `type` (`email`, `tel`, `url`, `number`) and `inputmode`
- Never block paste **[gated]**
- Labels clickable (`htmlFor` or wrapping the control)
- `spellCheck={false}` on emails, codes, usernames
- Checkbox/radio label and control share one hit target — no dead zones
- Submit stays enabled until the request starts; spinner during it
- Errors inline beside the field; focus the first error on submit
- Placeholders end with `…` and show an example
- Warn before navigating away with unsaved changes

## Motion

- Honour `prefers-reduced-motion` **[gated]**
- Animate `transform`/`opacity` only — compositor-friendly
- Never `transition: all` — list properties **[gated]**
- Correct `transform-origin`; SVG transforms on a `<g>` with `transform-box: fill-box`
- Animations interruptible — respond to input mid-flight
- Directional slides only for depth (list → detail). Tabs fade or cut

## Typography

- `…` not `...` **[gated]**
- Curly quotes, not straight
- Non-breaking spaces: `10&nbsp;MB`, `⌘&nbsp;K`, brand names
- Loading states end with `…`
- `font-variant-numeric: tabular-nums` for number columns
- `text-wrap: balance` on headings to prevent widows

## Content handling

- Text containers handle long content: `truncate`, `line-clamp-*`, `break-words`
- Flex children need `min-w-0` to allow truncation
- Handle empty states — never render a broken box for an empty array
- Anticipate short, average and very long user content

## Images

- Explicit `width`/`height` to prevent layout shift
- Below the fold: `loading="lazy"`. Above it: `fetchpriority="high"`

## Performance

- Lists over ~50 items: virtualize, or `content-visibility: auto`
- No layout reads in render (`getBoundingClientRect`, `offsetHeight`, `scrollTop`)
- Batch DOM reads and writes; do not interleave
- Controlled inputs must be cheap per keystroke
- `preconnect` for asset domains; `preload` critical fonts with `font-display: swap`

## Navigation and state

- The URL reflects state — filters, tabs, pagination, expanded panels
- Links are `<a>`/`<Link>` so Cmd-click and middle-click work
- Deep-link stateful UI. If it is `useState` and a user would bookmark it, it belongs in the URL
- Destructive actions need confirmation or an undo window — never immediate

## Touch and layout

- `touch-action: manipulation` to kill the double-tap zoom delay
- `overscroll-behavior: contain` in modals, drawers, sheets
- During drag: disable text selection, `inert` on dragged elements
- `autoFocus` sparingly — desktop only, one primary input, never on mobile
- `env(safe-area-inset-*)` on full-bleed layouts
- Never a horizontal scrollbar the design did not ask for
- Flex and grid over JS measurement

## Theming

- `color-scheme` on `<html>` so scrollbars and native inputs follow the theme
- `<meta name="theme-color">` matching the page background
- Native `<select>`: explicit `background-color` and `color`

## Locale

- `Intl.DateTimeFormat` and `Intl.NumberFormat` — never hardcoded formats
- Detect language from `Accept-Language` / `navigator.languages`, not IP
- `translate="no"` on brand names, code tokens and identifiers

## Hydration

- An input with `value` needs `onChange`, or use `defaultValue`
- Guard date/time rendering against server/client mismatch
- `suppressHydrationWarning` only where genuinely needed

## Copy

- Active voice: "Install the CLI", not "The CLI will be installed"
- Specific button labels: "Save API Key", not "Continue"
- An action keeps its name through the flow: "Publish" → "Published"
- Errors state the fix, not only the problem
- Numerals for counts: "8 deployments"
- Second person; never first
