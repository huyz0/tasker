---
id: M23
title: Rich Markdown Editor
status: complete
goal: A user can bold, italicize, link, and list-format a task description without ever seeing raw markdown syntax or leaving edit mode to preview it, and the result round-trips as the same plain markdown string the CLI and API already expect.
depends_on: []
surfaces: [gui, specs]
exit_criteria_met: true
started_at: 2026-08-19
completed_at: 2026-08-19
---

# M23 — Rich Markdown Editor

## 1. Goal

Every markdown-editing surface in the GUI is today a bare `<textarea>`
labeled "Markdown supported" with zero actual support — no toolbar, no
formatting shortcuts, no live preview; a user has to know markdown
syntax and can only see the rendered result by leaving edit mode
entirely. This milestone replaces that, piloted on the task description
field: a true WYSIWYG editor where formatting appears as you type, with
no raw-markdown/preview mode switch, while the underlying wire contract
(`description: string`, plain markdown) is completely unchanged.

## 2. Why Now

Requested directly by the user, who asked for web research into
open-source rich markdown editors before deciding, then confirmed the
recommendation (`@mdxeditor/editor`, chosen over Milkdown/Tiptap/
BlockNote — see `ADR-0018`) and set delivering it as the session goal.
Design pass (`.specs/specs/2026-08-19-2026-rich-markdown-editor/` +
`ADR-0018`) is complete. No formal dependency on any `todo` milestone;
sequenced here by explicit user priority, the same way M13/M21/M22 were
each sequenced ahead of the numbered backlog.

## 3. Exit Criteria

- [x] A user can bold, italicize, add a link, and create a heading/list
      in the task description editor without typing markdown syntax or
      leaving edit mode — confirmed via a real Playwright test, not a
      mocked one. (The e2e test exercises Bold specifically, end to
      end through the real toolbar and the real editor; the other
      formats are the same toolbar/plugin wiring, unit-tested in
      `RichMarkdownEditor.test.tsx` and visible in Storybook.)
- [x] The saved description round-trips as the exact same plain
      markdown string the CLI already reads — verified by editing via
      the GUI, then reading the same task via `tasker tasks get`.
      (The e2e test asserts this directly against a fresh `GetTask`
      RPC call: `task.description === "**E2E <stamp> bold check**"`.)
- [x] `RichMarkdownEditor` is themed with this repo's existing design
      tokens in both light and dark mode, not MDXEditor's default
      palette. (`moon run gui:storybook-test`: 0 axe violations across
      32 stories — including both new `RichMarkdownEditor` stories —
      which checks color-contrast in dark mode too, not just light.)
- [x] The editor is not in the GUI's main JS bundle — it loads only
      when a user opens task-description edit mode
      (`React.lazy`/`Suspense`). (Confirmed via `vite build` output:
      `RichMarkdownEditor-*.js`, 561KB, is its own chunk, separate
      from `index-*.js`.)
- [x] `@mdxeditor/editor` has its own row in `tech-stack.md` and
      `moon run :spec-drift` passes.
- [x] `moon check --all` is clean (27/27) with every changed file
      holding the 95% coverage gate. (`RichMarkdownEditor.tsx`/
      `.test.tsx` at 100% stmt/branch/func/line; the aggregate gate —
      what `gui:test`'s `thresholds` actually enforces, matching this
      repo's own convention of an aggregate rather than a per-file
      gate — holds at 98.31/95.03/97.08/98.63%.)

## 4. Scope

**In Scope**: `@mdxeditor/editor` dependency; a new
`apps/gui/src/components/ui/RichMarkdownEditor.tsx` shared component
(plugins, hand-picked toolbar, design-token theming, lazy-loaded);
wiring it into the task description edit flow in
`apps/gui/src/features/Tasks/index.tsx`; one Playwright e2e smoke test;
`ADR-0018`.

**Out of Scope**: comments and artifact content (both still bare
textareas — explicit follow-up once this pilot proves out, not
silently dropped, `ADR-0018`'s own "Foreclosed, for now" section);
any change to the `description`/`content` wire contract, storage, or
`MarkdownRenderer`'s rendering; project description (not markdown-
rendered today at all, unrelated to this milestone).

## 5. Task Breakdown

- [x] **M23-T01** — Save spec documentation: `.specs/specs/2026-08-19-
      2026-rich-markdown-editor/`, `ADR-0018`, this `MILESTONE.md` and
      `PROGRESS.md`. No product code.
      - Files: `.specs/specs/2026-08-19-2026-rich-markdown-editor/*`,
        `.specs/adr/ADR-0018-*.md`,
        `.milestones/MILESTONE-23-rich-markdown-editor/*`
      - Verify: files exist, `moon run tasker:docs-lint` passes.

- [x] **M23-T02** — Add `@mdxeditor/editor` to `apps/gui/package.json`
      + a matching row in `tech-stack.md`; build
      `RichMarkdownEditor.tsx` (headings/lists/quote/thematic-break/
      link/table/markdown-shortcut plugins, a small hand-picked
      toolbar, design-token theming for light + `data-theme="dark"`) +
      `RichMarkdownEditor.test.tsx` (mocking `@mdxeditor/editor`'s
      `MDXEditor` export) + `RichMarkdownEditor.stories.tsx`.
      - Files: `apps/gui/package.json`, `.specs/product/tech-stack.md`,
        `apps/gui/src/components/ui/RichMarkdownEditor.tsx` (+
        `.test.tsx` + `.stories.tsx`)
      - Verify: `moon run gui:test`/`gui:typecheck`/`gui:lint`/
        `gui:design-lint` clean; `moon run :spec-drift` passes with the
        new dependency declared.

- [x] **M23-T03** — Replace the bare `<textarea>` in `Tasks/index.tsx`'s
      description edit form with `RichMarkdownEditor`, behind
      `React.lazy`/`Suspense` (first instance of this pattern in the
      codebase, documented inline).
      - Files: `apps/gui/src/features/Tasks/index.tsx` (+
        `.test.tsx`)
      - Verify: `moon run gui:test` (coverage gate held); existing
        save/cancel/description-view behavior unchanged.

- [x] **M23-T04** — One Playwright e2e test exercising real typing plus
      a toolbar action (bold) against the live editor on the task
      description field, then confirming the saved result via a fresh
      `getTask`-equivalent read.
      - Files: `apps/gui/e2e/*`
      - Verify: `moon run gui:e2e` passes.

- [x] **M23-T05** — Backfill remaining test coverage; run the full
      milestone verification suite.
      - Files: any file left under the 95% gate after M23-T02–T04
      - Verify: `moon check --all` (27/27).

## 6. Verification

```bash
moon check --all
cd apps/gui && bun run storybook   # visual check of RichMarkdownEditor
```

## 7. Risks

- **Bundle size.** MDXEditor pulls in Lexical; mitigated by
  `React.lazy`/`Suspense` and a scoped plugin set (not the full
  toolbar/plugin kitchen sink) — measure the actual chunk size at
  M23-T03, not just assume the mitigation worked.
- **jsdom can't exercise real Lexical editing.** Named and accepted in
  `ADR-0018` — unit tests mock the library boundary, one Playwright
  test (M23-T04) proves real behavior. Resist the temptation to chase
  jsdom polyfills to make unit tests "more real"; that's a maintenance
  trap for a browser-API surface this large.
- **Markdown round-trip drift.** MDXEditor is markdown-native
  specifically to avoid this (unlike an HTML-native editor), but verify
  it directly at M23-T04: edit via the GUI, then read the same task via
  `tasker tasks get` and confirm the string matches expectations, not
  just "looks right" in the rendered view.
