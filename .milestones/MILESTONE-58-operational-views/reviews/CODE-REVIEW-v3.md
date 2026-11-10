---
timestamp: 2026-11-10T19:32:39Z
decision: rejected
---

# M58-T01 recovery placement and semantic no-op follow-up

Independent review covers current recovery/scroller placement, URL equality
comparison, writer tests, exact Reports preview keys and play assertions.
Prior versions remain preserved. No implementation or competing browser/tests
were changed. Updated375dark and768light task captures were inspected.

Moving ListState outside the horizontal scroll wrapper resolves the previously
unverified recovery concern. The owner reproduced Try again at x=-207.625 before
the correction and x=144.375 afterward. Its permanent DeniedTable play focuses
Status and checks recovery viewport bounds. This is an actual repaired defect,
not an inference from the earlier screenshot. Native table semantics remain
correct. Reports trends now uses the exact fifth undefined taskTypeId query-key
slot, and supported waitFor assertions require three real independent retries
instead of a mismatched preview/network path.

Sorting URLSearchParams before comparison correctly avoids a history entry
caused only by key order. One valid unchanged-state case remains: explicit
default spellings. /tasks?view=board reads Board, but clicking Board deletes the
parameter and pushes /tasks. /reports?days=30 likewise pushes a second entry
when30 days is already selected. Other accepted default forms include ready=0,
priority= and sort=. This contradicts the accepted unchanged-control policy and
is not covered by the new ordering-only regression.

For valid current input, compare supported semantic state or canonicalized
current/next forms before navigation. Retain intentional malformed cleanup and
Reset behavior; invalid duplicates must not be treated as an unchanged clean
view. Add real history regressions for explicit task/report defaults, alongside
the ordering case. No authorization, tenant boundary or data-access problem is
identified. This is a bounded history-correctness defect.

The permanent native Tab/Space/fast-type/history test is reported green18.9s;
the real-browser7 log has four themed-width passes at review time. Final37-story
matrices, remaining captures, full and final-head gates are pending. Those
results do not replace the missing semantic no-op cases. All other reviewed
source corrections have no remaining blocker.

```yaml
findings:
  - file: apps/gui/src/hooks/useOperationalView.ts
    line: 34
    severity: Medium
    comment: >-
      Comparing sorted raw URL parameters with the canonical writer output
      still pushes history for valid explicit defaults. /tasks?view=board plus
      Board, or /reports?days=30 plus30 days, navigates despite no supported
      state change. Compare semantic/canonical current and next state for valid
      input, preserving intentional invalid/reset cleanup, and cover both
      screens with Back-history regressions.
```
