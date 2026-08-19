# Rich Markdown Editor — Plan

## Task 1 (this document) — Save spec documentation

Write this spec folder (`shape.md`, `standards.md`, `references.md`,
`plan.md`), one ADR (`ADR-0018` in `.specs/adr/`), and the formal
milestone spec (`.milestones/MILESTONE-23-rich-markdown-editor/
MILESTONE.md` + `PROGRESS.md`). No product code changes in this task.

## Tasks 2 onward — tracked in `MILESTONE-23`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s own Task Breakdown section
(with stable `M23-T<NN>` ids, `Files:`, and `Verify:` per task) is the
single source of truth for what remains. Summary, for orientation:

- **M23-T02** — Add `@mdxeditor/editor` dependency + `tech-stack.md`
  entry; build `RichMarkdownEditor` wrapper component (plugins,
  hand-picked toolbar, design-token theming for light/dark) + its own
  tests (mocking the underlying library) + Storybook story.
- **M23-T03** — Wire `RichMarkdownEditor` into the task-description
  edit flow in `Tasks/index.tsx`, behind `React.lazy`/`Suspense` (first
  instance of this pattern in the codebase).
- **M23-T04** — One Playwright e2e test proving real typing/formatting
  behavior against the live editor.
- **M23-T05** — Test coverage backfill + final `moon check --all` pass.

Each executes one at a time, one commit per task, in the discipline this
repo has used for every milestone so far: dedicated test per change,
full GUI suite plus `moon check --all` clean before commit.

## Where the design lives

The full design (component shape, plugin/toolbar selection, theming
approach, testing strategy) is recorded in `shape.md`'s Decisions
section and in `ADR-0018` — not restated here, to keep one place
authoritative per decision.
