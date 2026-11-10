---
timestamp: 2026-11-10T18:16:54Z
decision: approved
---

# M58-T01 URL-owned existing controls static review

Independent review compares the proposed UX and TC001–004 against actual
Tasks/Reports, useScope, useScopedTo and useUrlEnum behavior, under ADR0025.
This is design approval only. No runtime source, design file, journal, service
or tests were changed. Named definitions and their ownership ADR remain T02;
they are not claimed as T01 functionality.

The supported scope matches existing controls: Board/Table, text, priority,
ready-only and the four current table headers, plus the shared7/30/90 report
window. The URL becomes readable on entry rather than being overwritten by
local defaults. Keeping explicit choices as history entries, replacing text
typing and retaining the existing RPC debounce gives usable Back behavior
without a keystroke history. Table sort surviving a Board visit is coherent
because it remains a table setting. Reload/history should restore controls and
server requests together.

Narrow screen-owned writers, live-location guards and scope-only cross-screen
links fit ADR0025. Same-screen task entry/exit must preserve the list settings;
Back from a Reports task link must restore its report window without copying
Tasks filters into Reports. Malformed values recover field by field with a
neutral explanation and Reset view, while actual loading/error/denial/empty
states retain their meaning. Duplicate owned parameters cannot ambiguously
select a value. Reset preserves scope and unrelated parameters. No result,
cursor, draft or bulk selection becomes portable URL state or an access grant.

Source-specific implementation checks are important within the accepted plan:

- Task exit includes the existing Tasks breadcrumb as well as X, Escape,
  backdrop and existing mutation-close paths; both breadcrumb and
  setExpandedTaskId currently rely on the scope-only helper and lose new local
  settings unless handled deliberately. Cross-screen helper behavior should
  remain scope-only.
- Priority0 means No priority and differs from absent Any priority. Keep the
  current UI ID sort mapped to server createdAt, with an allowlist of the
  supported headers/directions rather than arbitrary server sort text.
- Clear transient selection on raw text changes, mode/sort/history and org/
  project changes. The current effect only covers project, debounced text and
  facets; hidden selection must not survive a changed view.
- Write typed URL text immediately with replace and debounce only query input.
  Test Back/Forward or a scope/screen departure during the debounce interval so
  an old callback cannot restore stale text, scope or pathname. A new generic
  writer must not inherit useUrlEnum's stale rendered-path limitation.

These are concrete interpretations of TC001–004, not additional filters or
features. Applying a whole supported query in one navigation leaves an
appropriate seam for later explicit saved-view Open without premature UI.

The existing responsive toolbar, native controls, font hierarchy and semantic
palette remain appropriate; there is no visual reason to replace them. No
static design blocker identified. Runtime reds/greens, parser/writer tests,
real navigation/request assertions, both-theme375/768/1280 rendered keyboard/
overflow checks, source review and full/final-head gates remain future proof.

```yaml
findings: []
```
