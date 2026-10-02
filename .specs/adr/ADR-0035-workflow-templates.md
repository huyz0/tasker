---
id: ADR-0035
status: accepted
date: 2026-10-02
milestone: M42
---

# A workflow template is a stored step graph, instantiated as ordinary tasks

## Context

Teams repeat the same multi-step work: a release, a security review, a
customer onboarding. M35 gave Tasker the pieces - subtasks and `blocked_by`
links that claim-next honours - but assembling them is one call per task and
per link, every time. Beads "pours" a formula into a live molecule of issues;
Linear's Loops run the same job repeatedly (second landscape pass,
2026-10-02). M43's schedules need something to instantiate.

## Options

- **(a) A template stores the graph; instantiating creates ordinary tasks.**
  The instance is just tasks and links - every screen, query, claim and
  webhook already understands it. Editing the template later does not touch
  running instances.
- **(b) A "workflow run" entity that owns its steps.** A second model of
  work alongside tasks, with its own state machine and screens.
- **(c) Copy an existing task tree.** No place to keep the definition apart
  from a live (and changing) instance.

**Atomicity.** A single database transaction across the creation path is not
available on SQLite (drizzle's bun:sqlite transactions must be synchronous,
and `CreateTask` is async - see the note in `tasks.handler.ts`). The
alternative is to validate everything up front and remove what was created if
a later step still fails.

## Decision

**(a)**, all or nothing by validation plus compensation.

- `workflow_templates`: org, optional project, name, description, and
  `steps` - up to 50 of {key, title, description, priority, task type,
  status, dependsOn keys}. Saved only if keys are unique and well formed,
  every dependency names a step of the template, the graph is acyclic, and
  each typed step's type belongs to the org (and its status, if given, to the
  type). CRUD needs `tasktype:write` (people); reading needs `tasks:read`.
- `InstantiateWorkflow(templateId, projectId, title?)` (`tasks:write`, so
  agents may start one) re-validates against the current types, then creates
  the parent and the steps in dependency order through `CreateTask` itself -
  same numbering, activity, search index and events as any task - each step
  a subtask of the parent and `blocked_by` its dependencies. If any create
  fails, everything created so far is purged. Idempotent by key.

## Consequences

- Claim-next works through an instance in dependency order with no new code.
- An instance drifts from its template by design; there is no "sync".
- A failed instantiate briefly shows tasks that then disappear (and emits
  their `task.created` events); validation up front makes this rare.
