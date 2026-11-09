---
timestamp: 2026-11-09T07:36:00Z
decision: approved
---

# M48-T02 — Tenant-safe overflow recovery

Independent read-only review reran 42 backend tests (92 assertions) and 43 GUI
tests and approved the correction. No blocking findings remain.

Correctness: separate constant-size flags track a needed scope refresh and a
visible resync request. Foreign membership events do not occupy the domain
queue. Authorized overflow coalesces and re-arms; a membership change found by
periodic revalidation also requests resync. Flags set while an awaited refresh
is active remain pending for subsequent processing. Remaining domain data is
filtered against refreshed scope.

Coverage: initial red runs exposed missing overflow controls, dropped-entity
refresh, foreign membership amplification and silent periodic scope changes.
Tests cover coalescing/re-arming, newly authorized organizations, dropped
revocation, expired credentials before resync, foreign org/project traffic and
foreign membership bursts. Real QueryClient tests replace a pending initial read
on resync and refresh a task when only an artifact event survived. Existing
reconnect/unmount/scope-change cases remain green. Actual transport/browser
journeys remain T04, beyond these targeted checks.

Architecture: an additive control subject preserves the bounded ephemeral feed;
no durable cursor, extra queue, database table or dependency is introduced.
Frontend reconciliation reuses the reviewed T01 cancellation and lifecycle
guards. ADR-0045 records the rejected disconnect/replay alternatives and the
separate membership flag.

Security: unrelated membership activity cannot displace authorized data or
trigger visible resync. The control contains no tenant, event, count or body.
Credential checks still precede delivery; new membership discovery is retained.

```yaml
findings: []
```
