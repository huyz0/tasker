---
timestamp: 2026-11-10T12:14:42Z
decision: rejected
---

# M57-T01 initial ownership-lifecycle review

Independent source-backed static review finds the receipt identity, managed
atomicity, optional owner-bound association, legacy omission and exact release
fence coherent. Current claim/release/idempotency/note/usage/artifact/purge code
was inspected. Initial design missed a real ownership removal outside Release/
Unassign: retentionSweep calls purgeAgentCascade, which deletes assignments on
surviving live tasks. Preserving receipt snapshots alone would leave their
ownership-ending fields unset after the assignment disappears.

```yaml
findings:
  - severity: P2
    confidence: high
    paths:
      - apps/backend/src/lib/retentionSweep.ts:197
      - apps/backend/src/lib/cascadePurge.ts:115
    problem: Initial receipt lifecycle omitted retention owner-purge assignment removal.
    required: Atomically close exactly removed receipt IDs while retaining owner snapshots on surviving tasks, with an honest purge reason/system actor and rollback coverage.
```

This records the initial finding before the already-prepared design amendment;
ARCH-v2 reviews that correction separately. No runtime implementation, tests,
source/design edits or service operations were performed by this reviewer.
