---
timestamp: 2026-11-10T12:16:27Z
decision: approved
---

# M57-T01 filtered reports and visible history amendment

Both UX-v1 findings are resolved in the amended design/test plan. An open,
visible current history page reconciles remote unassignment/retention within30
seconds without requiring users to discover close/reopen behavior. One-page
Older/Newer navigation makes that refresh boundary understandable and avoids
automatic polling of every old cached page. Refresh does not imply process
activity, and the existing ownership-only labels remain appropriate.

Filtered Add link now retains the legacy write and presents truthful feedback
when the returned row falls outside the selected report scope. Show all reports
makes success reachable instead of appearing lost. Ungrouped wording depends on
the actual returned association; an existing other-receipt link remains correctly
associated. The reader's selected receipt is never used to invent human writer
ownership. TC009 covers this flow while preserving summary writing/unlink policy.

Existing fonts, semantic tokens, native disclosure/scope controls and task-detail
hierarchy remain coherent. No static UX blocker remains. This approves proposed
behavior only; source, rendered keyboard/theme/viewport, actual worker handoff and
final gates remain future work. No source/design/journal edits or service
operations were performed; prior review records remain preserved.

```yaml
findings: []
```
