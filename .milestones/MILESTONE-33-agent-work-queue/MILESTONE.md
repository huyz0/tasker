---
id: M33
title: Agent Work Queue
status: done
goal: An agent can take the next piece of work in one call, give back work it claimed (with a handoff note) without a human, see everything it holds across the organization, and ask who it is — so a fleet can run the claim/work/handoff loop unattended.
depends_on: [M30, M31]
surfaces: [backend, contract, cli, specs]
exit_criteria_met: true
started_at: 2026-10-02
completed_at: 2026-10-02
---

# M33 — Agent Work Queue

## 1. Goal

`ClaimNextTask` atomically claims the oldest open, unassigned task in a
project (optionally of one type), so agents racing for work never collide on
list-then-claim. `ReleaseTask` gives back a task the caller claimed —
optionally recording a handoff note first — and refuses an assignment a human
made (ADR-0027). `ListMyTasks` returns what the caller holds across every
project in its organization. `GetIdentity` answers for an agent token, so
`tasker auth whoami` works for agents. Each has a CLI command.

## 2. Why Now

The 2026-10-02 backend review named these as the gaps between the agent API
and the mission ("agents create, track and update work with minimal
friction; humans off the loop"):

1. **No claim-next.** Agents list unassigned tasks and race to claim the same
   ones; at fleet scale most claims lose with `FailedPrecondition`.
2. **No release.** ADR-0017's handoff flow ends with the task still assigned
   to the agent that handed it off; the next claim fails until a human
   unassigns it.
3. **No cross-project "my work".** `ListTasks` requires a project, so an agent
   cannot ask what it holds without walking every project.
4. **`whoami` fails for agents** — `GetIdentity` is human-only (found in
   M31-T05).

M30 made "open" mean the type's non-terminal statuses and M31 made the CLI
scriptable; both are prerequisites.

## 3. Exit Criteria

- [x] N concurrent `ClaimNextTask` calls on a project with N open tasks claim
  N distinct tasks; with none left the response carries no task.
- [x] `ReleaseTask` releases the caller's own claim (recording a handoff note
  when given) and is `PermissionDenied` on an assignment a human made.
- [x] `ListMyTasks` returns the caller's open tasks across projects, paginated,
  and only the caller's.
- [x] `GetIdentity` with an agent token returns the agent's id, name, org and
  scopes.
- [x] `tasker tasks claim-next`, `tasker tasks release`, `tasker tasks mine`
  exist; `tasker auth whoami` works with an agent token.
- [x] The agent-scope sweep covers the new methods; docs describe the loop;
  CI green on `main`.

## 4. Scope

**In scope:** the four RPCs, the `task_assignments.source` column
(ADR-0027), CLI commands, docs and the handoff skill.

**Out of scope:**

- Claim leases / TTL expiry — still foreclosed by ADR-0017.
- Task priority and dependencies — a data-model change of its own.
- A GUI for any of this — humans already assign and unassign.

## 5. Task Breakdown

- [x] **M33-T01** — Contract and schema: the four RPC shapes, `task_assignments.source`.
  - **Files**: `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}`,
    generated code, `apps/backend/src/db/schema.*.ts`, migrations
- [x] **M33-T02** — `ClaimNextTask`.
  - **Files**: `apps/backend/src/modules/tasks/tasks.handler.ts`, `lib/scopes.ts`
- [x] **M33-T03** — `ReleaseTask` (ADR-0027).
  - **Files**: as T02
- [x] **M33-T04** — `ListMyTasks`.
  - **Files**: as T02
- [x] **M33-T05** — `GetIdentity` for agents.
  - **Files**: `apps/backend/src/modules/auth/auth.handler.ts`, `lib/scopes.ts`
- [x] **M33-T06** — CLI: `claim-next`, `release`, `mine`, agent `whoami`.
  - **Files**: `apps/cli/cmd/{tasks,auth}.go`, `docs/cli-reference.md`
- [x] **M33-T07** — Documentation, skill and close.
  - **Files**: `docs/agent-integration.md`, `.agents/skills/handoff-task/SKILL.md`,
    `.specs/product/architecture.md`, `.milestones/STATE.md`

## 6. Verification

```
moon run backend:typecheck backend:test cli:test cli:docs-check :knip
moon run :skills-check :docs-lint :doc-drift :spec-drift
```

## 7. Risks

- **Migration on a hot table.** Adding a defaulted column to
  `task_assignments` is metadata-only on MySQL 8 (instant ADD COLUMN); the
  backfill touches only agent-held rows with a `claimed` activity.
- **Claim-next fairness.** Oldest-first means every agent contends for the
  same head of queue; the implementation tries a small window of candidates
  so a lost race moves on instead of failing.
