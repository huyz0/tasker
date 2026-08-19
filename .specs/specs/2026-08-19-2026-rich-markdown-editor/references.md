# References for Rich Markdown Editor

## Similar Implementations

### `apps/gui/src/components/ui/MarkdownRenderer.tsx` — the render side this pairs with

- **Location:** `apps/gui/src/components/ui/MarkdownRenderer.tsx:1-31`.
- **Relevance:** `react-markdown` + `remark-gfm` + `rehype-sanitize` is the
  existing, working half of this pair — `RichMarkdownEditor` only needs
  to produce the same plain markdown string this already renders
  safely. No change needed here; `tablePlugin` on the editor side
  should mirror `remark-gfm`'s GFM table support so both directions
  agree on what markdown dialect is supported.

### `apps/gui/src/features/Tasks/index.tsx` — the edit flow being replaced

- **Location:** `apps/gui/src/features/Tasks/index.tsx:424-425`
  (`editTitle`/`editDescription` state), `:920-926` (entering edit
  mode), `:968-1013` (the edit form, textarea at `:984-990`), `:623-632`
  (`updateTaskMutation`), `:1014-1022` (read-side `MarkdownRenderer`
  view).
- **Relevance:** `RichMarkdownEditor` is a drop-in replacement for the
  `<textarea>` at `:984-990` only — same controlled-value shape
  (`value`/`onChange`), same surrounding form/mutation/Save/Cancel
  logic, all unchanged. `editTitle`'s plain `<input>` stays untouched.
- **Key patterns to borrow:** The mutation's `onSuccess` invalidates
  `['tasks', activeProjectId]` and calls `setIsEditingTask(false)` —
  nothing about this needs to change since the editor's `onChange` just
  keeps updating the same `editDescription` string state.

### `.specs/adr/ADR-0011-adopt-radix-for-overlay-and-navigation-primitives.md` — the precedent for adopting a targeted UI dependency

- **Location:** `.specs/adr/ADR-0011-adopt-radix-for-overlay-and-navigation-primitives.md`.
- **Relevance:** This repo's only prior "adopt a third-party UI
  dependency" decision, and the direct precedent `ADR-0018` follows: (a)
  explicit user authorization required, (b) a genuinely hard-to-hand-roll
  interaction pattern as the concrete need, (c) adopt piecemeal/scoped,
  not a whole framework, (d) a `tech-stack.md` row at install time so
  `moon run :spec-drift` doesn't flag it as undeclared. It also
  explicitly rejected `shadcn/ui` wholesale for dragging in unrelated
  conventions (`cva`, `tailwind-merge`, `clsx`) — the same reasoning
  ruled out BlockNote's heavier, more opinionated footprint here.

### `apps/gui/src/index.css` — design tokens the editor's theme must reuse

- **Location:** `apps/gui/src/index.css:88-149` (light `:root` block),
  `:156-195` (dark `:root[data-theme='dark']` block), `:3-68` (`@theme`
  mapping Tailwind utilities to the `hsl(var(--x))` custom properties).
- **Relevance:** MDXEditor ships its own default CSS palette; overriding
  it to reuse these existing tokens (rather than hand-picking new
  colors) is what keeps the editor visually consistent with the rest of
  the app in both themes. This repo's dark mode is applied via the
  `data-theme="dark"` attribute, never `prefers-color-scheme` directly
  — confirmed by the explicit comment at `index.css:151-155`.

### `apps/gui/src/setupTests.ts` — why this milestone doesn't chase jsdom polyfills

- **Location:** `apps/gui/src/setupTests.ts` (20 lines total):
  `ResizeObserver` stub (`:5-12`, needed by `@tanstack/react-virtual`),
  forced `offsetHeight`/`clientHeight` (`:18-19`, for virtualization
  layout).
- **Relevance:** No `matchMedia`, `getSelection`, or `Range` polyfills
  exist — all things Lexical (MDXEditor's engine) needs for real
  contentEditable behavior in jsdom. Rather than add fragile,
  Lexical-specific polyfills here, `RichMarkdownEditor.test.tsx` and
  `Tasks/index.test.tsx` mock `@mdxeditor/editor`'s `MDXEditor` export
  directly — the same boundary-mocking convention every test in this
  suite already uses for `@connectrpc/connect`'s `createClient`. Real
  editing behavior is proven once, for real, in the M23-T04 Playwright
  test instead.

### `.specs/product/tech-stack.md` — where the new dependency gets declared

- **Location:** `.specs/product/tech-stack.md`, `### Frontend` table
  (header around line 26-30), existing markdown-rendering row at line
  39: `| \`react-markdown\`, \`remark-gfm\`, \`rehype-sanitize\` |
  ^10.1.0 / ^4.0.1 / ^6.0.0 | Markdown rendering |`.
- **Relevance:** `@mdxeditor/editor` gets its own row directly below
  this one, same three-column format (`Technology` / `Version` /
  `Role`). `moon run :spec-drift` fails if `package.json` names a
  dependency with no matching row here.
