# M23 Progress Journal

## M23-T01 — Save spec documentation

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `.specs/specs/2026-08-19-2026-rich-markdown-editor/`
  (`shape.md`, `standards.md`, `references.md`, `plan.md`),
  `.specs/adr/ADR-0018-mdxeditor-for-wysiwyg-markdown-editing.md`,
  `.milestones/MILESTONE-23-rich-markdown-editor/MILESTONE.md`, this
  file.
- **Verified**: All files written per `milestone-standard.md` and
  `spec-shape`'s documented output format; `.specs/adr/README.md`'s ADR
  format followed (frontmatter + Context/Options/Decision/Consequences,
  mirroring `ADR-0011`'s own structure since it's the closest prior
  precedent for adopting a third-party UI dependency in this repo).
  `moon run tasker:docs-lint` run against the new files.
- **Notes**: This milestone's design work happened mostly *before*
  plan mode, in the conversation turn immediately preceding it — the
  user asked whether the GUI had a rich markdown editor, none exists
  (confirmed via direct exploration: three bare `<textarea>`s, no
  library installed), and web research (verified live against the npm
  registry, not guessed) produced a ranked comparison of
  `@mdxeditor/editor`/Milkdown/Tiptap+markdown/BlockNote/
  `@uiw/react-md-editor`, with `@mdxeditor/editor` recommended for its
  markdown-native content model — this repo's `description` strings are
  read verbatim via the CLI too, not just rendered through the GUI's
  own renderer, so an HTML-native editor (Tiptap) carries real
  round-trip-drift risk this one avoids by design. The user confirmed
  the recommendation and set delivering it as the session goal, so
  plan mode's own work was scoping (pilot on description only) and
  resolving the one real technical risk found during research: whether
  `@mdxeditor/editor`'s React 19 support (an old GitHub issue reported
  incompatibility) was actually resolved - checked directly against the
  live npm registry rather than trusted from a mid-2024 issue, and
  confirmed current (`peerDependencies: "react": ">= 18 || >= 19"`,
  package's own dev environment on React `^19.2.1`).
- **Next**: M23-T02 — add the dependency and build
  `RichMarkdownEditor.tsx`.

## M23-T02 — Dependency + RichMarkdownEditor component

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `apps/gui/package.json` (+`@mdxeditor/editor@^4.2.0`),
  `.specs/product/tech-stack.md` (new row),
  `apps/gui/src/components/ui/RichMarkdownEditor.tsx` (new),
  `apps/gui/src/components/ui/RichMarkdownEditor.css` (new — first
  per-component CSS file import in this codebase),
  `apps/gui/src/components/ui/RichMarkdownEditor.test.tsx` (new),
  `apps/gui/src/components/ui/RichMarkdownEditor.stories.tsx` (new).
- **Verified**: `moon run gui:test` (900/900 tests, coverage gate held —
  62 files, 98.31/95.03/97.08/98.63% stmt/branch/func/line, no
  per-file drop under 95%), `gui:typecheck`, `gui:lint`,
  `gui:design-lint` (161 files, 0 findings after removing a
  `font-family: inherit` line the tokens rule doesn't allow —
  `RE_FONT` requires `var(...)`, and this repo has no font token to
  reference, so the override was simply dropped rather than
  worked around), `moon run :spec-drift` (0 drift with the new
  dependency declared), `moon run tasker:docs-lint` (229 files clean).
- **Notes**: The real `@mdxeditor/editor` API surface (plugin names,
  `MDXEditorProps`/`MDXEditorMethods` shapes, the `toolbarPlugin`
  `toolbarClassName` escape hatch, the theme's CSS custom property
  names and which DOM element they're declared on) was confirmed by
  reading the installed package's own `dist/index.d.ts` and
  `dist/style.css` directly, not guessed from memory or docs — this
  mattered concretely: the theming tokens (`--base*`/`--accent*`) are
  declared directly on the editor's own root element (a private,
  hashed class alongside the stable public `.mdxeditor` class), so
  redefining them on `:root` the way `index.css` themes everything
  else would have silently done nothing — a same-element declaration
  always beats one merely inherited from an ancestor. Fixed by
  targeting `.rich-markdown-editor .mdxeditor` (specificity 0,2,0),
  which wins over the library's own single-class declaration (0,1,0)
  regardless of CSS import order. Both `hsl(var(--token))` referencing
  and the "exactly one dark block" pattern from `index.css` carry over
  unchanged — because the mapped tokens resolve through this repo's
  own `:root`/`:root[data-theme='dark']` HSL variables, the override
  file itself needs no separate dark-mode block.

  Per `ADR-0018`'s testing-strategy decision, unit tests mock
  `@mdxeditor/editor`'s exports (jsdom has no Selection/Range
  polyfills for Lexical); the mock's `toolbarPlugin` deliberately
  calls the real `toolbarContents()` callback it's given (rather than
  leaving it unexercised) so the component's own inline toolbar-list
  construction is still covered by the 95% gate — constructing the
  element tree is enough for coverage purposes without ever mounting
  it. Real typing/toolbar behavior is deferred to the M23-T04
  Playwright test, as planned.
- **Next**: M23-T03 — wire `RichMarkdownEditor` into
  `Tasks/index.tsx`'s description edit form, behind
  `React.lazy`/`Suspense`.

## M23-T03 — Wire into task description

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `apps/gui/src/features/Tasks/index.tsx` (+
  `index.test.tsx`).
- **Verified**: `moon check --all` (27/27); `gui:test` (69/69 in this
  file, 900+ overall, coverage gate held at 96.33/91.95/94.11/97.03%
  stmt/branch/func/line for this file — statistically unchanged from
  before the swap, meaning the new lazy/Suspense/wiring lines are
  fully exercised, not merely tolerated by slack elsewhere in the
  file); existing save/cancel/description-view behavior unchanged
  (only one of the four description-editing tests needed updating).
- **Notes**: This is the first use of `React.lazy`/`Suspense` anywhere
  in the codebase, documented inline at the `lazy(() => import(...))`
  call site in `Tasks/index.tsx`, not left as an implicit pattern for
  the next reader to reverse-engineer. The Suspense fallback is a
  plain status `<div>`, styled to match the surrounding form so the
  edit panel doesn't visibly jump when the chunk resolves (typically
  well under a frame in practice, but `role="status"` in case it's
  ever slow enough to be perceived).

  `Tasks/index.test.tsx` mocks the `RichMarkdownEditor` module
  directly (not `@mdxeditor/editor` a second time) — a plain
  controlled `<textarea>` standing in for it, since this file's job is
  proving `Tasks/index.tsx` wires `editDescription` through correctly,
  not re-proving `RichMarkdownEditor`'s own internals (already covered
  in `RichMarkdownEditor.test.tsx`). Of the four existing
  description-editing tests, only "edits a task title and description
  through the GUI" touched the description field directly, and needed
  exactly one change: `screen.getByDisplayValue(...)` →
  `await screen.findByDisplayValue(...)`, since the field is no longer
  present on the same tick `Edit` is clicked (it's behind a real,
  if near-instant, `import()`). The other three
  (cancel/error/reset-on-switch) only ever touched the title input or
  clicked Save/Cancel directly, so they needed no changes at all.
- **Next**: M23-T04 — one Playwright e2e test against the real editor.
