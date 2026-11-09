---
timestamp: 2026-11-09T09:20:30Z
decision: rejected
---

# M47-T01 initial design review

Independent human-workflow review found three acceptance gaps. A dead worker
emits no expiry event, so visible running history needs bounded source refresh.
Pause/delete need visible distinct effects, and concrete creation/recovery copy
must distinguish retry eligibility from actual execution. History task links must
use the schedule's own project, not the currently selected project. Corrected
ADR/UX/test-plan revisions address these findings; re-review remains pending.

```yaml
findings:
  - file: .specs/adr/ADR-0041-recoverable-schedules.md
    line: 97
    severity: Medium
    comment: Expired leases need a visible transition without a new event.
  - file: .milestones/MILESTONE-47-recoverable-schedules/design/UX-DESIGN.md
    line: 24
    severity: Medium
    comment: Explain pause versus delete and concrete recovery wording.
  - file: apps/gui/src/features/Schedules/index.tsx
    line: 38
    severity: Medium
    comment: History task links need the schedule project rather than selected project.
```
