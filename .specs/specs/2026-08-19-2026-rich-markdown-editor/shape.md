# Rich Markdown Editor — Shaping Notes

## Scope

Replace the bare `<textarea>` used to edit the task description with a
true WYSIWYG markdown editor — format while typing, no switching
between raw-markdown and preview modes. Pilot on task description only;
comments and artifact content are named, explicit follow-ups, not
silently dropped. No backend, contract, or CLI changes — `description`
stays the same plain markdown string on the wire.

Small, GUI-only milestone (5 tasks) — smaller than M21/M22 by design,
since there's no backend/contract/CLI surface at all, just one new
shared component and one call site.

## Decisions

- **`@mdxeditor/editor`** (MIT, built on Lexical + remark) chosen over
  Milkdown (same category, more assembly required), Tiptap+markdown
  (HTML-native content model risks silently rewriting markdown on save
  — this repo's markdown is also read verbatim via the CLI/API, not
  only rendered through this app's own renderer), and BlockNote (bigger
  block-editor UX shift, more complex licensing). MDXEditor's own
  design goal — "accepts and emits markdown as a string" — matches this
  repo's actual contract exactly.
- **React 19 compatibility verified live against the npm registry**,
  not assumed: `@mdxeditor/editor@4.2.0`'s own `peerDependencies` are
  `"react": ">= 18 || >= 19"` / `"react-dom": ">= 18 || >= 19"`, and its
  own dev environment runs React `^19.2.1` — compatible with this
  repo's `^19.2.5`. A known React-19-RC issue on the project's GitHub is
  from mid-2024 and long since resolved.
- **Pilot on task description only**, confirmed with the user. The
  `RichMarkdownEditor` wrapper this milestone builds is designed to be
  reused for comments/artifact content directly once the pilot proves
  out — not rebuilt.
- **Mocked in unit tests, proven for real in one Playwright e2e test.**
  Lexical depends on browser Selection/Range APIs jsdom implements
  incompletely; this repo's `setupTests.ts` has no polyfills for them
  today. Rather than chase fragile jsdom polyfills, unit tests mock
  `@mdxeditor/editor`'s `MDXEditor` export (the same boundary-mocking
  convention already used for `@connectrpc/connect`'s `createClient`
  everywhere in this suite) and verify the wrapper's own logic; one
  Playwright e2e test proves real typing/formatting behavior, matching
  `testing-standard.md`'s "E2E: Critical Happy Paths only" bar.
- **`React.lazy`/`Suspense` code-splitting** at the editor's single call
  site — confirmed via grep this is the first use of this pattern
  anywhere in the GUI, justified because MDXEditor pulls in Lexical, a
  real dependency weight that shouldn't load for a user who never opens
  task-description edit mode.
- **Its own ADR (`ADR-0018`)**, following ADR-0011's own precedent for
  how this repo adopts an editor-class dependency: explicit user
  authorization, a concrete failing need (three bare, toolbar-less
  textareas labeled "Markdown supported" with zero affordance to write
  it), the smallest scoped package (MDXEditor's plugin system, not the
  full kitchen sink), and a `tech-stack.md` entry so `moon run
  :spec-drift` doesn't flag it as undeclared.

## Context

- **Visuals:** None.
- **References:** `apps/gui/src/components/ui/MarkdownRenderer.tsx`
  (the render side this pairs with), `apps/gui/src/features/Tasks/
  index.tsx:920-1022` (the edit flow being replaced),
  `.specs/adr/ADR-0011-adopt-radix-for-overlay-and-navigation-primitives.md`
  (the precedent for adopting a targeted third-party UI dependency in
  this otherwise hand-rolled-primitives codebase) — full detail in
  `references.md`.
- **Product alignment:** Directly requested by the user, who confirmed
  the recommendation from this session's web research (MDXEditor over
  Milkdown/Tiptap/BlockNote) before setting it as the session goal.
  Additive to `roadmap.md` the same way M15–M22 were.

## Standards Applied

- `.specs/standards/dependency-standard.md` — minimalism, active-
  maintenance verification (done live against npm), latest-stable
  pinning.
- `.specs/standards/ui-ux-standard.md` — design-token reuse (no
  hardcoded colors), the hand-rolled-primitives default and ADR-0011's
  exception path for a genuinely hard-to-hand-roll interaction,
  accessibility minimums.
- `.specs/standards/frontend-standard.md` — container/presentational
  split, mandatory Storybook stories.
- `.specs/standards/testing-standard.md` — 95% coverage gate, E2E
  reserved for critical happy paths only.
- `.specs/standards/milestone-standard.md` — governs `MILESTONE.md`/
  `PROGRESS.md` format and the one-commit-per-task protocol.
