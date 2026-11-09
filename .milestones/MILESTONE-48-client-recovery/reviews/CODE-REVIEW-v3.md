---
timestamp: 2026-11-09T07:27:00Z
decision: rejected
---

# M48-T02 — Initial overflow control review

Independent read-only review ran 39 backend tests (86 assertions) and 43 GUI
tests successfully, then reproduced a tenant-isolation gap with only a fake
subscription/database. Two foreign membership events filled a size-one queue
and generated an unrelated client-visible resync/refetch.

```yaml
findings:
  - file: apps/backend/src/modules/events/events.handler.ts
    line: 290
    severity: High
    comment: Membership-invalidating events from unauthorized organizations occupy the domain queue. Their overflow exposes an unrelated activity indication and amplifies active-query refetch. Track scope refresh in separate coalesced internal state; emit resync only for authorized data loss or an actual authorization-set change. Preserve discovery of newly authorized organizations.
```

Other lenses pass: the overflow flag coalesces/re-arms, membership refresh occurs
before queued data, credential checks remain intact and GUI recovery reuses the
reviewed active-read cancellation/lifecycle guards.
