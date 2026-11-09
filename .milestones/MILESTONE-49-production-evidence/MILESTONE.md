---
id: M49
title: Production Evidence
status: todo
goal: CI exercises production dependencies and reproducible multi-instance measurements describe the capacity actually demonstrated.
depends_on: [M46, M47, M48]
surfaces: [backend, infra, specs]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M49 — Production Evidence

## 1. Goal

CI exercises production dependencies and reproducible multi-instance measurements describe the capacity actually demonstrated.

## 2. Why Now

SQLite unit tests do not establish MySQL concurrency correctness or broker outage recovery. `.github/workflows/integration.yml` already provisions JetStream for realtime tests; extend that coverage rather than claiming NATS CI is absent.

## 3. Exit Criteria

- [ ] Pull requests exercise real MySQL concurrency and real NATS delivery.
- [ ] Two-instance recovery tests fail on duplicate or lost outcomes.
- [ ] A documented command reproduces load runs and emits machine-readable evidence.
- [ ] Published capacity claims name measured caller count, data volume, hardware and limitations.

## 4. Scope

In scope: the tasks below and their regression tests, migrations, compatibility checks and operating documentation.

Related work is owned explicitly: authorization M44, atomic operations M45, durable events M46, schedules M47, client recovery M48, integration/load evidence M49, documentation M50. No new task-execution engine, separate read store, microservice split, arbitrary cron support or attention-queue product redesign is introduced by this reliability program. Attention-center product delivery is owned by M55, whose first task defines its user flow; it is outside this reliability milestone.

## 5. Task Breakdown

- [ ] **M49-T01** — Add isolated MySQL coverage and extend the existing JetStream integration job to the recovery paths.
  - **Files**: .github/workflows/ci.yml; apps/backend/moon.yml; apps/backend/src/modules/tasks/tasks.mysql.test.ts.
  - **Verify**: Run the jobs against real services with readiness probes and unique databases; deliberately break a MySQL claim assertion and prove the job fails.

- [ ] **M49-T02** — Add cross-process integration scenarios for retries, schedules, audit and events.
  - **Files**: apps/backend/src/test/wire/; apps/backend/src/modules/events/realtime.integration.test.ts.
  - **Verify**: Two instances share one MySQL database and broker; assert unique claims, occurrence recovery, deduplication and permission revocation after reconnect.

- [ ] **M49-T03** — Build a bounded load harness using existing tooling and machine-readable results.
  - **Files**: apps/backend/scripts/measure-concurrency.ts; apps/backend/package.json; docs/performance.md.
  - **Verify**: Parameterize concurrency, duration, fixture, instance count and seed; report p50/p95/p99, errors, throughput, memory, queue depth, duplicate/lost outcomes and runtime versions; fail correctness violations.

- [ ] **M49-T04** — Run staged load and failure experiments and record honest capacity limits.
  - **Files**: .milestones/MILESTONE-49-production-evidence/PROGRESS.md; docs/performance.md.
  - **Verify**: Run small correctness smoke then 100 and 1000 callers where resources permit; report saturation and resource limits explicitly; no claim of 20000-client validation without such a run.

- [ ] **M49-T05** — Pin CI runtime selection and verify all release gates.
  - **Files**: .github/workflows/ci.yml; .prototools; .milestones/MILESTONE-49-production-evidence/reviews/.
  - **Verify**: CI uses repository-pinned toolchains; run moon check --all, integration jobs, E2E and standalone smoke; retain reports as artifacts.

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
