---
id: M46
title: Durable Domain Events
status: in-progress
goal: Domain changes and their emitted events commit together, and persisted events reach audit and matching webhooks despite process or broker failure.
depends_on: [M45]
surfaces: [backend, infra, specs]
exit_criteria_met: false
started_at: 2026-11-08
completed_at: null
---

# M46 — Durable Domain Events

## 1. Goal

Domain changes and their emitted events commit together, and persisted events reach audit and matching webhooks despite process or broker failure.

## 2. Why Now

A durable consumer cannot restore an event lost before publication; the durable boundary belongs with the mutation.

## 3. Exit Criteria

- [ ] Committed mutations survive a crash before event publication.
- [ ] Audit and webhook consumers deduplicate repeated delivery of the same event.
- [ ] Two backend instances safely recover expired relay leases.
- [ ] Standalone webhooks function without a broker, and shutdown preserves pending work.

## 4. Scope

In scope: the tasks below and their regression tests, migrations, compatibility checks and operating documentation.

Related work is owned explicitly: authorization M44, atomic operations M45, durable events M46, schedules M47, client recovery M48, integration/load evidence M49, documentation M50. No new task-execution engine, separate read store, microservice split, arbitrary cron support or attention-queue product redesign is introduced by this reliability program. Attention-center product delivery is owned by M55, whose first task defines its user flow; it is outside this reliability milestone.

## 5. Task Breakdown

- [x] **M46-T01** — Specify event identity, transactional capture, relay leases and retention.
  - **Files**: .specs/adr/ADR-0040-transactional-domain-events.md; .test-plans/TEST-PLAN-0046-durable-domain-events/.
  - **Verify**: Define at-least-once delivery and consumer deduplication; choose acknowledged JetStream publication over fire-and-forget and document brokerless standalone behavior.

- [x] **M46-T02** — Add event storage in both dialects and capture events in the mutation unit of work.
  - **Files**: apps/backend/src/lib/natsCorrelation.ts; apps/backend/src/db/schema.*.ts; apps/backend/src/modules/**; apps/backend/drizzle-*/.
  - **Verify**: Mutation rollback produces no event; commit produces an event with stable ID, occurredAt, tenant, actor and trace metadata; migrate old databases and build the standalone binary.

- [ ] **M46-T03** — Capture webhook delivery rows atomically and relay persisted events to the broker with retryable fenced leases.
  - **Files**: apps/backend/src/modules/webhooks/outbox.ts; apps/backend/src/lib/domainEventRelay.ts; apps/backend/src/lib/domainEventOutbox.ts; apps/backend/src/index.ts.
  - **Verify**: Crash after sending but before acknowledgement retries the same event ID; two relays do not lose events; brokerless webhooks still work; matching delivery rows deduplicate.

- [ ] **M46-T04** — Make audit projection idempotent by producer event identity and drain background workers.
  - **Files**: apps/backend/src/consumers/auditProjector.ts; apps/backend/src/index.ts; apps/backend/src/lib/lifecycle.ts.
  - **Verify**: Repeated event delivery yields one audit row; shutdown stops new leases and awaits in-flight enqueue/relay work; restart resumes leases.

- [ ] **M46-T05** — Verify crash boundaries and publish operating procedures.
  - **Files**: docs/webhooks.md; docs/standalone.md; .milestones/MILESTONE-46-durable-domain-events/reviews/.
  - **Verify**: Run real NATS outage/recovery and process-kill scenarios, both-dialect tests and full backend gates; document backlog inspection, retention and replay.

- [ ] **M46-T06** — Fence webhook delivery completion/retry and enforce a total outbound attempt deadline.
  - **Files**: apps/backend/src/modules/webhooks/delivery.ts; apps/backend/src/modules/webhooks/httpSender.ts; apps/backend/src/db/schema.*.ts; apps/backend/drizzle-*/.
  - **Verify**: Reproduce an expired owner failing after its successor delivered; stale success/failure cannot change delivery or endpoint counters; trickling response bodies hit a bounded total deadline; both dialect migrations and real HTTP tests pass. Deliver before T05 closure; retain existing task IDs.

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
