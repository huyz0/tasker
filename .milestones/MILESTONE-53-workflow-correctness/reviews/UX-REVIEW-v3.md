---
timestamp: 2026-11-09T15:51:00Z
decision: rejected
---

# M53-T04 initial pending/history source review

Independent human-workflow review accepts independent bounded pages, local cursor
retry, deduplication and the History disclosure. Three state/reconciliation
findings block closure. This records the initial candidate, before corrections;
browser/rendered/full verification remains pending.

```yaml
findings:
  - file: apps/gui/src/features/Tasks/WorkPages.tsx
    line: 50
    severity: medium
    comment: Cached forms remain actionable after known permission/authentication/not-found failures. Disable actions until a fresh authorized response; retain typed intent across transient verification failures.
  - file: apps/gui/src/features/Tasks/InputRequests.tsx
    line: 154
    severity: medium
    comment: Organization queues include other projects outside the selected live feed. Add bounded visible refresh and a remote-resolution regression without another project frame; the same applies to approvals.
  - file: apps/gui/src/features/Tasks/WorkPages.tsx
    line: 26
    severity: medium
    comment: A late previous-scope mutation notice can overwrite and hide the current scope error. Ignore obsolete callbacks or preserve notices by scope, and exercise overlapping failures.
```
