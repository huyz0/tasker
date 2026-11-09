---
timestamp: 2026-11-09T06:59:00Z
decision: approved
---

# M46-T07 — Real provider fixture

Correctness: real GitHub reads use a seeded managed in-memory database. Sync
enters the production transaction instead of bypassing it. Repeated reads may
discover new PRs, but existing local identities stay stable and remote IDs remain
unique. Current seeded permissions are exercised through the actual policy code.

Coverage: CI's unmanaged-handle failure is reproduced in job 129021858085.
Actual restored GitHub job 129023803194 and NATS job 129023803614 pass. Full 35
local gates pass. An empty sandbox can exercise sync without inserting a PR;
the suite does not claim otherwise, or claim a deployments round trip when the
sandbox has no workflow run. The unchanged production transaction regressions
cover storage rollback separately.

Architecture: the existing shared fixture and encryption helper replace a fake
query builder and duplicated encryption code. No production exception for mock
databases was introduced.

Security: only an owned in-memory database changes. Removed unused sandbox
PATCH cleanup; provider tests perform reads only. The token stays in CI secrets
and encrypted SQL, never output. Database closure and environment restoration
remain in teardown. No new authorization or public contract.

```yaml
findings: []
```
