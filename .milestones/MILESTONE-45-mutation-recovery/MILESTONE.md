---
id: M45
title: Mutation Recovery
status: in-progress
goal: Concurrent and interrupted keyed mutations produce one committed outcome and a retry can recover that outcome.
depends_on: [M44]
surfaces: [backend, specs]
exit_criteria_met: false
started_at: 2026-11-08
completed_at: null
---

# M45 — Mutation Recovery

## 1. Goal

Concurrent and interrupted keyed mutations produce one committed outcome and a retry can recover that outcome.

## 2. Why Now

Agent retries are normal operation; a response cache written after the mutation cannot supply the required guarantee.

## 3. Exit Criteria

- [ ] Overlapping identical create, claim and workflow requests cannot create duplicate outcomes.
- [ ] A crash cannot commit the mutation without its recoverable keyed response.
- [ ] Failed workflows leave no partial graph or externally delivered task events.
- [ ] Preexisting completed idempotency records remain readable under current authorization.

## 4. Scope

In scope: the tasks below and their regression tests, migrations, compatibility checks and operating documentation.

Related work is owned explicitly: authorization M44, atomic operations M45, durable events M46, schedules M47, client recovery M48, integration/load evidence M49, documentation M50. No new task-execution engine, separate read store, microservice split, arbitrary cron support or attention-queue product redesign is introduced by this reliability program. The attention queue from the review is a later product proposal requiring its own user-flow design.

## 5. Task Breakdown

- [x] **M45-T01** — Design a dialect-aware unit of work with idempotency reservation and nested operation semantics.
  - **Files**: .specs/adr/ADR-0038-atomic-mutations.md; apps/backend/src/lib/idempotency.ts; apps/backend/src/db/db.ts.
  - **Verify**: Document SQLite synchronous transaction constraints, MySQL connection ownership, crash recovery, legacy rows and request-hash conflicts before code.

- [ ] **M45-T02** — Introduce transaction-owned database access shared by task creation, claiming and workflow operations.
  - **Files**: apps/backend/src/db/access.ts; apps/backend/src/db/db.ts; apps/backend/src/modules/tasks/tasks.handler.ts.
  - **Verify**: Existing task and queue tests pass; injected mid-operation failure leaves no partial task, assignment or counter update.

- [ ] **M45-T03** — Reserve idempotency keys and commit the mutation plus response atomically.
  - **Files**: apps/backend/src/lib/idempotency.ts; apps/backend/src/db/schema.*.ts; apps/backend/drizzle-*/; apps/backend/scripts/generate-embedded-migrations.ts.
  - **Verify**: Concurrent identical keys return one outcome or an explicit processing response; differing payloads fail; storage failure cannot silently discard retry protection; run against SQLite and MySQL.

- [ ] **M45-T04** — Make workflow instantiation reuse the transaction rather than compensating published tasks.
  - **Files**: apps/backend/src/modules/workflows/workflows.handler.ts; apps/backend/src/modules/workflows/*.test.ts.
  - **Verify**: Fail each step in a multi-step workflow and prove no visible partial graph; race identical instantiation keys and prove one graph.

- [ ] **M45-T05** — Verify interrupted and concurrent mutation recovery and record the review.
  - **Files**: .test-plans/TEST-PLAN-0045-mutation-recovery/; .milestones/MILESTONE-45-mutation-recovery/reviews/.
  - **Verify**: Use two processes against the same database, kill one at defined boundaries, retry and assert a single durable outcome; full backend suite and typecheck.

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
