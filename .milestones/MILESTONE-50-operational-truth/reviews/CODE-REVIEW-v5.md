---
timestamp: 2026-11-21
decision: rejected
reviewed_head: 24a989339621385e524181518a91577583535901
---

# Final restored-SQLite recovery review

Implementation-agent review of actual job136898577466.

```yaml
findings:
  - file: apps/backend/src/test/wire/domainEventRecovery.integration.test.ts
    severity: Medium
    comment: "The restored SQLite broker-restart scenario times out waiting for auditCount===4 after70000ms. Nine other cases and both backup identity observations pass. Silent child logging and missing aggregate/process diagnostics prevent attribution. Preserve the oracle/time bound, report safe SQL/broker/worker state, prove the observer with an actual owned consumer kill, then investigate rather than retry to green."
```

Reopen only T03/operator recovery criterion. No product, SQL-lock, broker
readiness or runtime cause is inferred. Prior source approvals and observed
failures remain historical evidence. Main654c222 is unaffected.
