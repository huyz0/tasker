---
id: M42
title: Workflow Templates
status: in-progress
goal: A team defines a repeatable piece of work once - its steps and which step waits on which - and anyone, person or agent, stamps out a live copy in one call, so agents work through the steps in dependency order without anyone wiring blockers by hand.
depends_on: [M35]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M42 — Workflow Templates

## 1. Goal

A **workflow template** belongs to an organization (optionally a project): a
name, a description and up to 50 steps, each with a key, title, description,
priority, optional task type and the keys of steps it waits on. Instantiating
it in a project creates a parent task and one subtask per step, with
`blocked_by` links between steps, atomically; claim-next then hands steps out
only when their blockers finish.

## 2. Why Now

Second landscape pass: Beads pours "formulas" into live "molecules"; Linear's
Loops run the same multi-step job repeatedly. M35 gave Tasker the graph, but
building one is still a call per task and per link. M43's schedules need
something to instantiate.

## 3. Exit Criteria

- [ ] Templates are validated on save: unique keys, known keys, no cycles,
  at most 50 steps; CRUD needs `tasktype:write`, reading `tasks:read`.
- [ ] `InstantiateWorkflow` creates the parent, the steps and their blockers
  in one transaction, idempotent by key; agents may call it (`tasks:write`).
- [ ] Ready-work and claim-next respect step order (a step with an open
  blocker is not ready).
- [ ] CLI, MCP tools, GUI template editor and "Start workflow"; CI green on
  `main`.

## 4. Scope

**Out of scope:** variables/substitution beyond the run title, branching or
conditional steps, editing a running instance through its template (an
instance is ordinary tasks once created).

## 5. Task Breakdown

- [x] **M42-T01** — ADR-0035, contract and schema.
- [ ] **M42-T02** — Template CRUD with graph validation.
- [ ] **M42-T03** — InstantiateWorkflow.
- [ ] **M42-T04** — CLI and MCP.
- [ ] **M42-T05** — GUI.
- [ ] **M42-T06** — Docs and close.

## 6. Verification

Backend tests per RPC (validation, auth, gates sweeps), an instantiate test
that drives claim-next through the steps in order, CLI tests, GUI unit tests
and a live smoke; CI green on `main`.

## 7. Risks

- **Partial instances.** Mitigated by one transaction for parent, steps and
  links; a failure leaves nothing.
