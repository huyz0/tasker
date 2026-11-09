---
timestamp: 2026-11-09T11:02:40Z
decision: rejected
---

# M47-T04 background edit preservation

Independent source review found one material regression: off-feed detail polling
continues while editing, and the error branch preceded the editor branch. A
background read failure unmounted ScheduleForm and discarded its local draft;
recovery remounted server values. The new browser-like clock/RPC regression
reproduces the missing Name field before the correction.

```yaml
findings:
  - file: apps/gui/src/features/Schedules/index.tsx
    line: 193
    severity: High
    comment: Keep a mounted editor and its draft through background failures, or pause fallback while editing. Show a clear error and verify failure/recovery preserve the typed draft.
```

Other source conditions matched the approved flow: bounded off-feed and pending
polling, schedule-owned links, accepted feedback/reset, semantic tones, wrapping
rows and grouped action help. Actual browser/story/narrow checks remain pending.
