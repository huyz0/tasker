---
timestamp: 2026-11-21
decision: approved
reviewed_head: df71b14da555aab09fd9951084441d6077bbd09b
---

# M50-T03 lifecycle, recovery and publication review

Implementation-agent four-lens review with actual hosted evidence; no
independent-agent/local execution or production recovery claim.

## Correctness

A real signal probe and killed consumer both record exitCode null,
SIGKILL and awaited exit137 on pinned Bun1.3.11. The fixture previously
mistook the nullable getter for liveness. It now registers .exited
settlement/result for every owned child before any kill. Checkpoints,
observer and teardown use that lifecycle. Bun's public API distinguishes
nullable exit/signal getters from completion:
<https://bun.sh/docs/runtime/child-process#exit-handling>.

The controlled consumer kill reaches complete diagnostics with source4/
audit3 and exit1, without watchdog or cleanup failure. It restores source.
All canonical identity, ACK, webhook, audit and70-second assertions remain.
The observer covers both initial projection and broker-restart projection.

## Coverage and evidence limits

All15 applicable source checks pass: CI44924969637, Integration44924969560
and staged/separate recovery44924969538. Exact37 (7 cached) completes in
6m3.175s; backend2432/GUI1764/contract1158, generated CLI reference, real
browser103/three existing skips, rendered388-story accessibility/mobile
and standalone pass. Both MySQL versions execute native19/recovery10 with
zero required skips plus empty-backup, consumer-death, claim/audit faults.
Five isolated SQLite recovery runs pass; their loop stops on the first fail.

Retain rejected CODE-v5 and the original70-second SQLite timeout. Its cause
is unproven; neither a signal exit nor SQLite contention is retrospectively
asserted. It does not recur in current required/isolated/separate runs.
The earlier Bun panic and one diagnostic retry also remain documented.
Current source is tested after a concrete lifecycle-observation correction,
not an unchanged retry-to-green loop. The fresh assembled candidate still
requires all15 checks before publication.

## Architecture

Verification-only fixture/proof/config and source-backed runbook changes.
No production retry, database pool, limiter, runtime or dependency changes.
Packaging selectors are unchanged and production binaries were verified
with the published M49 dependency. Manual consumers and supervised services
have explicit different restart responsibilities.

## Security

Private logs/backups remain in owned temporary directories and are removed.
Only bounded log content is classified into fixed error categories; emitted
observations contain counts, lifecycle and broker ACK state, not bodies,
raw SQL or credentials. Private dump/import stderr remains suppressed.
Cleanup tracks actual completion after signal exits and only owned resources.
No local clean-tree assertion. Final publication uses three atomic task
commits from main654c222, no force push, and exact tested/published tree.

```yaml
findings: []
```
