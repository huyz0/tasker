---
timestamp: 2026-11-21
decision: rejected
reviewed_head: 1d47090c067a320e0346a7270fca88ffdf84785a
---

# M49-T02 observed-result review

The source design retains the accepted distinct-PID, owned-resource, stable
receipt and acknowledged audit oracles, but actual verification has two blockers.

```yaml
findings:
  - file: apps/backend/src/test/ownedCleanup.test.ts
    line: 18
    severity: Medium
    comment: "Actual backend job136823295114 rejects the object-wrapper matcher with TS2769. The earlier environment assignment narrows the observed marker to string while previous may be undefined. Preserve exact identity while making the assertion type-correct."
  - file: apps/backend/src/test/wire/domainEventRecovery.integration.test.ts
    line: 170
    severity: High
    comment: "Actual MySQL8.4 job136823295126 loses the capture worker before its first checkpoint, with empty stderr. Nine recovery cases pass and one fails. Capture exit/signal and fixed stage diagnostics, establish the outcome on a new run, and retain the failure before closure; do not infer an environmental cause."
```

All19 native MySQL8.4 cases, the native claim proof and the new two-API case
pass on this source. Both separate integration jobs, audit and workspace also
pass. Other jobs remain queued. GitHub403 rejected a retry while the overall
run is active, so no retry result exists.

Four lenses: correctness/outcome verification blocks closure; coverage retains
the declared real-service scenarios and explicit fault oracles; no production
architecture changes or authorization broadening is present; resources and
credential handling retain v5's ownership/security corrections. This is a
read-only review of source and actual hosted logs by the implementation agent.
No local execution is claimed. T02 remains unchecked.
