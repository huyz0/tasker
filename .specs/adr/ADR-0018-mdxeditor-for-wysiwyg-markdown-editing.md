---
id: ADR-0018
status: accepted
date: 2026-08-19
milestone: M23
---

# Adopt MDXEditor for WYSIWYG markdown editing, piloted on task description

## Context

Every markdown-editing surface in the GUI — task description, comments,
artifact content — is a bare `<textarea>` with a placeholder reading
"Markdown supported" and zero actual support: no toolbar, no formatting
shortcuts, no live preview. Edit and rendered-preview
(`MarkdownRenderer.tsx`, `react-markdown`+`remark-gfm`+
`rehype-sanitize`) are mutually exclusive states — a user writes raw
markdown from memory and only sees the result after leaving edit mode.
The user asked directly for a rich editor that formats while typing,
with no mode-switching, and requested this session research open-source
options before deciding (`ADR-0011` is the only prior precedent in this
repo for adopting a third-party UI dependency, so the same bar applies
here: explicit authorization, a concrete need, the smallest scoped
package, its own ADR).

## Options

**Keep the bare textareas.** Rejected outright — it's the status quo
this ADR exists to change, and the user explicitly authorized fixing
it (ADR-0011's condition (a): direct user authorization).

**Tiptap + a markdown extension** (`@tiptap/markdown` or
`tiptap-markdown`). Rejected. Tiptap is the most battle-tested
general-purpose rich-text framework (New York Times, The Guardian,
Atlassian) and headless like Radix, which this repo already favors —
but its content model is ProseMirror/HTML, with markdown produced as a
*conversion step*, not the native representation. This repo's markdown
strings are read verbatim outside this app too — the CLI
(`tasker tasks get`) and any agent driving the API directly see the
exact same `description` string, not a re-rendered view of it. An
HTML-native editor risks silently rewriting markdown on save (list
marker style, escaping, whitespace) in ways a purely GUI-internal tool
wouldn't need to care about.

**Milkdown** (ProseMirror + remark, MIT, 8.5k★). A real contender —
markdown-native (built on a remark AST, same family as
`MarkdownRenderer`'s own `remark-gfm`), plugin-driven, adds real-time
collaboration support if ever wanted. Not chosen only because it needs
more manual assembly (toolbar, theme, plugin wiring) than MDXEditor's
more turnkey plugin system for the same markdown-native guarantee —
kept as the documented fallback if MDXEditor's bundle weight or plugin
model turns out to be a poor fit in practice.

**BlockNote.** Rejected. Notion-style block editor — a bigger content-
model shift than "make description editing nicer" (blocks, not inline
markdown text), and its more advanced features carry a more complex
license (GPL-3.0 for open source use, subscription for closed-source) —
exactly the kind of unrelated complexity ADR-0011 rejected `shadcn/ui`
wholesale-adoption for pulling in.

**`@mdxeditor/editor`** (chosen). MIT licensed, built on Lexical +
remark. Markdown-native — its own stated design goal is "accepts and
emits markdown as a string," which is this repo's exact wire contract
for `description`/`content` fields. Plugin-based, so only the plugins
this pilot needs (headings, lists, quote, thematic break, link, table,
markdown-shortcut, a hand-picked toolbar) are loaded — not a kitchen
sink. React 19 compatibility verified live against the npm registry
(not assumed from training data): `@mdxeditor/editor@4.2.0`'s own
`peerDependencies` are `"react": ">= 18 || >= 19"` /
`"react-dom": ">= 18 || >= 19"`, and its own development environment
runs React `^19.2.1` — compatible with this repo's `^19.2.5`. A
React-19-RC incompatibility issue on the project's GitHub is from
mid-2024 and long since resolved by the package's own upgrade.

## Decision

**Adopt `@mdxeditor/editor`**, piloted on the task description field
only (`apps/gui/src/features/Tasks/index.tsx`) — the highest-traffic
markdown surface, and the one where the edit/save flow is already
fully understood. Comments and artifact content are explicit,
named follow-ups once the pilot proves out, not silently in scope.

Wrapped in a new shared component, `apps/gui/src/components/ui/
RichMarkdownEditor.tsx`, with the same controlled `value`/`onChange`
shape a controlled textarea has — the surrounding form, mutation, and
Save/Cancel logic in `Tasks/index.tsx` needs no change at all.
Styling reuses this repo's existing `hsl(var(--token))` design tokens
(light `:root` and dark `:root[data-theme='dark']` blocks in
`index.css`) rather than MDXEditor's own default palette — the exact
"Radix supplies behavior, not appearance" pattern ADR-0011 already
established for its own adopted dependency.

The component is loaded behind `React.lazy`/`Suspense` at its single
call site — the first use of this pattern anywhere in this GUI,
documented inline rather than left implicit, because MDXEditor pulls
in Lexical, real dependency weight that shouldn't load for a user who
never opens task-description edit mode.

`@mdxeditor/editor` gets its own row in `tech-stack.md` at the moment
it's installed, matching ADR-0011's own requirement, so
`moon run :spec-drift` doesn't flag it as undeclared.

## Consequences

**Easier.** A user formats a task description the way they'd expect
from any modern editor — bold, headings, lists, links — without
knowing markdown syntax or ever leaving edit mode to check the result.
The read side (`MarkdownRenderer`) needs zero changes, since the wire
contract (`description: string`, plain markdown) is unchanged.

**Harder.** Real DOM testing of the editor's actual typing/selection
behavior isn't practical in this repo's jsdom-based unit test suite —
Lexical depends on Selection/Range APIs jsdom implements incompletely,
and this repo has no polyfills for them today
(`setupTests.ts` only has `ResizeObserver` and forced layout
dimensions). Unit tests mock `@mdxeditor/editor`'s `MDXEditor` export
directly (the same boundary-mocking convention already used for
`@connectrpc/connect`'s `createClient`), proving the wrapper's own
logic, not Lexical's internals; one Playwright e2e test
(`apps/gui/e2e/`) proves real behavior once, matching
`testing-standard.md`'s "E2E: Critical Happy Paths only" bar. This is a
deliberate trade, not an accidental coverage gap — recorded here so
it reads as a decision, not an oversight, the next time someone
reviews this component's test file.

**Foreclosed, for now.** Comments and artifact content stay on bare
textareas until `RichMarkdownEditor` is reused there in a later,
separate task — the pilot needs to actually ship and be used before
that reuse is worth doing. Also foreclosed: any change to how
`description`/`content` are stored, transmitted, or rendered — this
ADR touches only how they're *authored* in the GUI. Reverse this
specific decision only if a measured cost (bundle size after
lazy-loading, an unresolvable styling conflict with the token layer,
markdown round-trip drift found in practice) turns out to outweigh
what it bought — record that as a new ADR rather than quietly
reverting to a textarea.
