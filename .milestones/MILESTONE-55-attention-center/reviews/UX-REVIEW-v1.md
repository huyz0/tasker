---
timestamp: 2026-11-09T23:15:45Z
decision: rejected
---

# Contextual action wording

Independent review approves source grouping, existing type/tokens, canonical Open
task links and honest review/silence labels. Current GUI InputRequests mounts an
Answer form but has no cancelInputRequest consumer. Do not promise a Cancel
question action in task detail. Cover cancellation by authorized CLI/RPC/another
client, while GUI acceptance is Open task → Answer. A draft-cancel button is a
different action and must not be confused with closing the stored question.

```yaml
findings:
  - severity: P2
    problem: GUI answer/cancel wording promised a nonexistent question-cancel action.
    required: State the existing Answer path and other-client cancellation reconciliation separately.
```
