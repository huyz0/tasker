---
timestamp: 2026-11-09T17:35:00Z
decision: approved
---

# M53-T05 retained summary intent

Independent human-workflow review approves the source and rendered interaction.
Escape, backdrop, close, task/scope changes, breadcrumbs, sidebar and Back/Forward
retain the correct task's writing. Reopening exposes the draft without another
hidden disclosure. Cancel discards it. Save and Clear show distinct progress;
old success cannot erase newer text, and failed saves retain text and explanation
through unmount. A foreign pending write shows only a generic waiting message.

A native warning covers changed drafts even when every panel is closed. Actual
Chromium Stay/Leave journeys verify this best-effort behavior. Sign-out clears
local drafts immediately and reports a failed remote sign-out with Retry rather
than silently implying success. Unknown session lookup cannot erase writing.

Four actual browser journeys pass. Seventeen stories pass68 settled axe audits
across both themes and desktop/mobile widths, plus17 mobile overflow checks.
The375px dark failed-save capture shows readable editor, count/Unsaved status,
semantic error, Save action and context sections in one task-dialog scroll.
Existing system typography, violet primary and semantic error pair are retained.

[Dark mobile retained draft](../design/evidence/summary-draft-error-mobile-dark.png)

This is implementation/rendered evidence, not a usability-study claim. All35 local checks pass.
T06/T07 and final-head remote CI remain before M53 publication.

```yaml
findings: []
```
