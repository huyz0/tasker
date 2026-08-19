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

## M23-T04 — E2E smoke test for the rich editor

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `apps/gui/tests/e2e/task-description-rich-editor.spec.ts`
  (new).
- **Verified**: `moon run gui:e2e` — ran the full suite with
  `CI=true` (matching `.github/workflows/ci.yml`'s actual settings:
  `workers: 1`, `retries: 2`), backend seeded fresh
  (`bun run seed`) and started standalone
  (`STANDALONE=true ENABLE_TEST_LOGIN=true`). This new spec passed on
  its first attempt, no retry needed. `moon check --all` stayed clean
  (27/27) throughout, since `gui:e2e` is deliberately outside that
  gate (`type: 'run'` in `moon.yml` — a commit must not require a
  booted backend and installed browsers).
- **Notes**: Two real bugs surfaced and got fixed while building this
  test, both in the test itself, not the product:
  1. MDXEditor's Bold/Italic/Underline toggles are a Radix
     single-select toggle group, which exposes ARIA role `radio`
     (not `button`) — found by reading the actual accessibility tree
     via a Playwright error-context snapshot, not guessed.
  2. The toggle's accessible name flips between `"Bold"` and
     `"Remove bold"` depending on whether the cursor is already inside
     bold text — and Lexical carries the last format forward through a
     select-all-delete, so a *second* run of this test against the
     *same* seeded task (this repo's `bun run seed` always produces
     the same first task) inherited bold formatting from the first
     run's leftover content. Fixed by checking the toggle's
     `aria-label` right after clearing and explicitly turning bold off
     first if it's already on, so every run starts from the same known
     state regardless of what a previous run left behind.
  3. A related, separate bug in the test: `getByRole('button', {name:
     'Edit'})` is ambiguous once the task has any comments (each
     comment has its own identically-labelled Edit button) —
     `comments.spec.ts` posts to the same seeded "first task" this
     spec also opens, and in a single-worker, deterministic-file-order
     run (`comments.spec.ts` sorts before this file, so it always runs
     first) the ambiguity is guaranteed to trigger, not just possible.
     Fixed by scoping to the dialog's own header row
     (`getByRole('heading', {name:'Task Details'}).locator('..')`)
     rather than the whole page.

  One genuine, pre-existing, unrelated bug was found incidentally and
  is explicitly **not** fixed here (out of scope for a rich-editor
  milestone): a hard reload of a deep-linked `/tasks/:taskId` URL
  loses the route once `activeProjectId` finishes hydrating
  (`Tasks/index.tsx`'s "closes the detail overlay when the active
  project changes" effect treats the async hydration itself as a
  scope change). Confirmed via `git diff` that no file this milestone
  touched is anywhere near that effect. Chose a direct `GetTask` RPC
  call over `page.reload()` for the "fresh read" verification instead
  of fixing it — this proves the same thing (a real server round-trip,
  not client cache) without depending on that unrelated code path.
  Worth a follow-up task, not a rich-editor concern.

  Two other, also pre-existing, also unrelated e2e specs
  (`navigation.spec.ts`'s "/agents renders the state machine panel"
  and `universal-search.spec.ts`'s "Command Palette can be opened")
  fail consistently in this sandbox regardless of branch — confirmed
  via `git diff` showing zero changes to either spec file or the
  features they exercise across every commit in this milestone. Not
  investigated further (unrelated feature, environment-shaped, not a
  regression this milestone introduced) beyond that confirmation.
- **Next**: M23-T05 — test coverage backfill + final `moon check --all`
  pass; verify the light/dark theming exit criterion; close the
  milestone.
