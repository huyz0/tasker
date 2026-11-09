---
timestamp: 2026-11-08T08:29:52Z
decision: approved
---

# M45 workflow ownership review (T04)

## Correctness and coverage

Workflow preflight, authorization and keyed replay now share one outer unit.
Parent and step creation reuse it. Compensating deletes are removed: failure
rolls back counters, task rows, activity, links, saved response and queued events.
Tests fail each of three untyped step positions through actual task-domain
validation, after template shape validation has succeeded. With the old outer
unit deliberately disabled, the regression shows two leaked task-created events
and a counter of three despite zero remaining task rows. Restored code passes.

Two racing identical workflow keys return the same parent and every same step
ID, with one complete graph. Deliberately bypassing keyed replay makes that test
fail with different parent IDs. Existing state-machine, work-graph, permissions
and template scenarios remain green. Full local gate: 35 completed, no failures.

## Architecture and security

ADR-0038 owns atomicity; ADR-0035 now explicitly records that amendment while
preserving the graph and permission decisions. Workflow current authorization
runs inside the unit before saved responses can be replayed. Task validation
and scopes are still enforced by the shared task operation; no second graph
creation path or raw credential access was introduced. Durable post-commit
publication remains M46 and process-kill evidence remains T05.

## Findings

```yaml
findings: []
```
