---
timestamp: 2026-11-10T19:22:11Z
decision: approved
---

# M58-T01 table semantics and shared horizontal scroll amendment

Independent source review follows CODE-v1 and preserves it. Reviewed current
Tasks table markup, semantic regression, empty/loading/denied previews,
Reports error/denial play assertions and permanent fast-type/native keyboard
browser test. No implementation or competing tests/browser suites were changed.

The corrected columnheader is a container with a native button, so it retains
header semantics and ordinary Tab/Space/Enter activation. Only the active header
has aria-sort; its decorative triangle is hidden from the accessible name.
Table-level aria-rowcount includes the header plus the server's full filtered
count, while each virtual row has its actual index offset by two. Neither loaded
row count nor the rowgroup is falsely presented as the total table size.

The minimum772px semantic table places header and virtual rows inside the same
outer horizontal scroll area. Its rowgroup remains the bounded vertical
virtualizer source. Empty/loading/error controls are siblings outside the
semantic table, so non-row content no longer violates required child roles.
The header-only table has a truthful one-row count in these states. The change
does not alter sort mappings, paging queries, access policy or URL ownership.

The native regression asserts full rowcount, first virtual position, non-button
header role, nested native control and sort direction. The reported original
red and nine targeted green cases address the actual semantic defect. New table
previews cover empty/loading/error rather than hiding those markup branches.
Reports previews now target the real Try again label and poll all three
independently settling reads. The browser regression uses native Tab/Space and
checks the Status button's viewport bounds instead of merely invoking a click.

No blocking source finding identified. One layout edge was sent for owned
browser verification: when horizontally scrolled, transition to ListState must
keep its narrow message/Retry/Clear filters reachable; being outside the semantic
table alone does not prove visibility inside the shared scroller. This is an
unverified layout concern, not a claimed rendered failure. The source approval
does not certify that edge or pending regenerated six-journey captures, affected
matrices, full/final-head gates. Original static and full-source boundaries in
CODE-v1 remain unchanged.

```yaml
findings: []
```
