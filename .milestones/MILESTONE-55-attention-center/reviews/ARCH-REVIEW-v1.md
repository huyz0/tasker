---
timestamp: 2026-11-09T23:15:45Z
decision: rejected
---

# Source-derived attention preflight

Independent review finds the bounded source projection, current archive policy,
source IDs, age precision and existing-context actions coherent. Before acceptance,
name shared authority races explicitly: group B already in flight before group A
denies cannot restore B on late success; denial in project A must fence cached
same-org project B/All projects. Task-read authority is organization-wide, while
data query keys include project. Canceled cached success is also insufficient.
Distinguish project NotFound/local unavailability from organization permission loss.

```yaml
findings:
  - severity: P2
    problem: Shared task-read lifetime cases could be satisfied by a weaker per-group or per-project latch.
    required: Explicit post-denial retry/epoch cases across in-flight groups and same-org projects.
```
