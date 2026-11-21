---
timestamp: 2026-11-21
decision: approved
reviewed_head: 2e8b14b884fcaf62bc70c018883015cb4087b1e5
---

# M49-T03 bounded HTTP measurement review

Review by the implementation agent against actual hosted results and the
acceptance plan; no independent-agent or local-execution claim.

## Correctness

Bounded dimensions precede resource creation. Real scoped callers create,
replay through the other API and read canonical identity. Independent SQL,
producer and acknowledged audit observations detect lost/duplicate/unexpected
outcomes; unacknowledged commits remain distinct from absent writes.
Measured APIs, recovery API and projector stop, and all other owned-schema
SQL sessions quiesce before the final snapshot. Remaining producer work fails.

The actual late-commit test first exposed a false valid result, then fails the
corrected oracle on its unexpected row after a real commit. Bootstrap, timeout
and cleanup failures cannot satisfy that proof. Successful measurement validity
is distinct from acceptable service: the 1000-caller stage retains 2943 errors
and only 57 complete workflows, despite correct final reconciliation.

## Coverage

Seven public configuration/quantile/outcome cases first fail the scaffold,
then pass. Actual bypassed-input and late-SQL faults fail their intended
assertions and restore bytes. The normal smoke and real 4/100/1000-caller
stages execute; earlier incomplete stages remain disclosed, not explained away.
All 18 non-skipped source checks pass, including exact 37 in 7m23.324s,
backend 2430, GUI 1764, native services, E2E and rendered checks.

## Architecture and security

This is disposable measurement tooling, not a new production protocol or
execution engine. Generated schemas/labels/ports and real processes isolate
resources; cleanup attempts every owned step and restores ambient state.
Credentials and bodies stay out of aggregate evidence. Fixed phase diagnostics
name only timing/counts. Forced termination cannot guarantee cleanup and never
establishes valid evidence. No dependency or operational limiter is changed.

T04 owns the staged workflow, external watchdog and full published results.
T05 owns exact runtime selection/report retention. Final combined-head gates
remain required for publication.

```yaml
findings: []
```
