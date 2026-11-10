---
timestamp: 2026-11-09T23:17:07Z
decision: approved
---

# Amended source projection and authority lifetime

Independent review approves ADR0048 and TC001–012 with no design blockers. The
four sources retain their exact drain conditions, live parent policy, configured
terminal rules, stable source-row identities and honest age basis. Current-count/
bound-cursor/SQL-limit requirements exclude capped panels and unbounded stalled
hydration. A human-only task-read selector adds no permission or inbox state.

Shared read loss is fenced by verified account+organization across groups and
projects, including pre-denial sibling responses arriving after denial. Only a
new post-denial explicit Retry can reauthorize; a response counter or canceled
cached success alone cannot. Project NotFound is local unavailability, preserving
other allowed projects. No source may revive another scope's accepted metadata.

Active organization/task/project policy and archive/restore acceptance are
explicit. Existing source writes remain authoritative and no old-row hold release
or invented review approval is introduced. Real both-dialect source/row-bound/
cursor/authority tests and all runtime/full gates remain future work.

```yaml
findings: []
```
