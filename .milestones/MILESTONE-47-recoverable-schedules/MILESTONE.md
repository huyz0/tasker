---
id: M47
title: Recoverable Schedules
status: todo
goal: Every claimed scheduled occurrence can be inspected and safely resumed after a crash without duplicating its work.
depends_on: [M45, M46]
surfaces: [backend, specs]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M47 — Recoverable Schedules

## 1. Goal

Every claimed scheduled occurrence can be inspected and safely resumed after a crash without duplicating its work.

## 2. Why Now

Advancing the next time is not evidence that the occurrence ran; scheduling needs its own durable identity.

## 3. Exit Criteria

- [ ] Advancing a schedule cannot silently lose its claimed occurrence.
- [ ] Restarting after work creation reuses the original task or workflow.
- [ ] One failed occurrence cannot abort processing of other due schedules.
- [ ] History distinguishes created, skipped, failed and interrupted work without changing the UTC cadence contract.

## 4. Scope

In scope: the tasks below and their regression tests, migrations, compatibility checks and operating documentation.

Related work is owned explicitly: authorization M44, atomic operations M45, durable events M46, schedules M47, client recovery M48, integration/load evidence M49, documentation M50. No new task-execution engine, separate read store, microservice split, arbitrary cron support or attention-queue product redesign is introduced by this reliability program. Attention-center product delivery is owned by M55, whose first task defines its user flow; it is outside this reliability milestone.

## 5. Task Breakdown

- [ ] **M47-T01** — Design occurrence identity, lease recovery, manual runs and update/delete races.
  - **Files**: .specs/adr/ADR-0041-recoverable-schedules.md; .test-plans/TEST-PLAN-0047-recoverable-schedules/.
  - **Verify**: Define unique schedule-plus-slot identity, frozen execution inputs, lease owner/version, failed retry policy and intentional missed-slot semantics.

- [ ] **M47-T02** — Persist due occurrences atomically with advancing the schedule.
  - **Files**: apps/backend/src/modules/schedules/schedules.handler.ts; apps/backend/src/db/schema.*.ts; apps/backend/drizzle-*/.
  - **Verify**: Two sweepers create one occurrence; killing the winner after advancement leaves a resumable occurrence; editing/pausing a stale candidate cannot silently overwrite a new schedule.

- [ ] **M47-T03** — Execute leased occurrences through keyed task/workflow operations and durable run recording.
  - **Files**: apps/backend/src/modules/schedules/schedules.handler.ts; apps/backend/src/modules/tasks/taskOperations.ts.
  - **Verify**: Kill after task creation but before completion bookkeeping and recover the same task; enforce skip-if-open across manual and scheduled execution.

- [ ] **M47-T04** — Verify recovery, sweep isolation and schedule observability.
  - **Files**: apps/backend/src/modules/schedules/schedules.test.ts; docs/mcp.md; docs/standalone.md; .milestones/MILESTONE-47-recoverable-schedules/reviews/.
  - **Verify**: Inject one run-record write failure and prove other due schedules proceed; run two-process SQLite/MySQL recovery scenarios; full backend gates.

## 6. Verification

1. Reproduce the stated failure with an observable regression test before implementation.
2. Run the targeted tests against the required dialect/services.
3. Run affected full suites, typechecks and generated-artifact checks.
4. Run `moon check --all` and relevant explicit integration/E2E gates.
5. Record exact commands, outcomes and resource limits in the journal; review heavy tasks for correctness, test coverage, architecture and security. Never mark a task done on inferred success.

## 7. Risks

- SQLite async callbacks must not be passed to synchronous Drizzle transactions; the unit-of-work design must account for this before adopting it.
- Multi-instance tests must use separate processes/connections, not merely concurrent promises on one SQLite connection.
- Leases need fencing; a stalled worker must not overwrite a newer owner.
- Retries must retain event/occurrence identities and never weaken current authorization.
- Schema changes must preserve old data and both dialects; rollback is a compatible previous binary only where the recorded migration permits it.
- Environment or toolchain blockers are recorded as blocked, never accepted by disabling checks.
