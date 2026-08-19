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
