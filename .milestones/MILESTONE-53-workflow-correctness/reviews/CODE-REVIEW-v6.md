---
timestamp: 2026-11-09T16:48:00Z
decision: rejected
---

# M53-T05 initial lifetime/source review

Independent reliability inspection identifies three blockers before browser,
rendered and full verification. No reviewer edits or tests were performed.

```yaml
findings:
  - file: apps/gui/src/features/Auth/LoginForm.tsx
    line: 34
    severity: high
    comment: Password login only invalidates an inactive session query. After B logs in, cached A may be trusted through a held/failed lookup and expose A's draft. Establish the verified login identity synchronously and exercise the real login/query transition.
  - file: apps/gui/src/features/Tasks/summaryDrafts.ts
    line: 78
    severity: medium
    comment: Failed logout rotates generation while an old save may remain pending. Generation-bound admission can allow a second same-account/task write that the old request overwrites. Keep completion ownership generation-bound, but fence pending writes across those generations.
  - file: apps/gui/src/features/Tasks/TaskSummary.tsx
    line: 35
    severity: medium
    comment: Retained drafts use raw submitted text as baseline even though the server trims it. Compare against the canonical response text, preserving newer entry/revision intent.
```
