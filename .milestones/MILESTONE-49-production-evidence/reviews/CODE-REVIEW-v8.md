---
timestamp: 2026-11-21
decision: rejected
reviewed_head: 52d468038941ca531d6947780109075e5d3c2e1f
---

# M49-T02 final-result review

```yaml
findings:
  - file: apps/backend/src/test/wire/domainEventRecovery.integration.test.ts
    line: 246
    severity: High
    comment: "Final MySQL8.4 job136843138595 again loses the ack-pause checkpoint. New diagnostics prove exit0, signal none, stage ready. The worker is a one-shot sweep even though the scenario must wait for an asynchronous ACK. It can legitimately finish without reaching that pause. Use the existing recurring relay and test deferred source eligibility; preserve the real ACK callback as the only checkpoint writer."
```

Earlier source3410e39's all-green12 checks remain valid historical evidence;
they do not establish that the final result is stable. Reopen T02 and its
criterion. The actual exit is not an OOM signal or unexplained process crash.
The exact reason that individual sweep did not publish is not invented.

Correctness/test coverage block closure; no production architecture or security
boundary change is needed to correct the test worker lifecycle. No assertion,
watchdog, service requirement or fault oracle may be weakened. Review by the
implementation agent using source and actual hosted logs; no local execution.
