---
timestamp: 2026-11-09T06:43:00Z
decision: rejected
---

# M46-T05 — Recovery and operating review

Independent read-only review approved the process isolation, custom consumer
DB_PATH fix, native Moon bootstrap and upgrade boundaries. It rejected the
safe-inspection claim because relay retry diagnostics still retained raw
exception text.

```yaml
findings:
  - file: apps/backend/src/lib/domainEventRelay.ts
    line: 76
    severity: High
    comment: Raw exception messages may contain Drizzle SQL parameters and event bodies. The operating query selects last_error as a safe diagnostic. Persist a fixed classification and validated code instead, and verify payload exclusion.
```

Fixture robustness findings from the preliminary pass were already corrected:
bounded HTTP checkpoint with early-exit detection, cleanup after a failed Docker
start, environment restoration before cleanup and independent schema teardown.
