---
timestamp: 2026-11-21
decision: rejected
reviewed_head: d0f38d5116b9dcf2f0b73eceaaf5ced1229ab92a
---

# M49 final large-caller regression review

Review by the implementation agent using the actual final-head gate.

```yaml
findings:
  - file: apps/backend/scripts/measure-concurrency.ts
    line: 115
    severity: High
    comment: "Final job136866898054 stalls in the1000-caller measurement phase. Five-second RPC defaults do not settle the command; its240s watchdog and45s graceful allowance end in exit137 without settlement/cancellation/cleanup markers. Earlier valid source2e8b14b evidence is retained but does not establish reliability. Correct the controller HTTP path, prove real stalled-request deadline/cancellation and require repeated full1000-caller outcomes before publication."
```

Reopen T03/T04 and the final T05 gate. Keep previous successful measurements,
reviews and incomplete runs. No production pool/server or Bun root cause is
invented from the observed phase boundary. No assertion, operational timeout
or required service may be weakened. No main merge occurred.
