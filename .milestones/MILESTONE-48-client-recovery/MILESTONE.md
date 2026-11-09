---
id: M48
title: Client Recovery
status: done
goal: Browsers reconcile missed changes and CLI calls terminate predictably when the server stalls.
depends_on: [M44]
surfaces: [backend, gui, cli, specs]
exit_criteria_met: true
started_at: 2026-11-09
completed_at: 2026-11-09
---

# M48 — Client Recovery

## 1. Goal

Browsers reconcile missed changes and CLI calls terminate predictably when the server stalls.

## 2. Why Now

An apparently live screen can be stale after a brief outage, and an unbounded CLI call can stall an autonomous worker.

## 3. Exit Criteria

- [x] Short disconnects cannot leave active views indefinitely stale.
- [x] Queue overflow explicitly triggers reconciliation.
- [x] Reconnect jitter stays within a documented bound and can be deterministic in tests.
- [x] Unary CLI calls support deadlines and cancellation without breaking long-lived MCP operation.

## 4. Scope

In scope: the tasks below and their regression tests, migrations, compatibility checks and operating documentation.

Related work is owned explicitly: authorization M44, atomic operations M45, durable events M46, schedules M47, client recovery M48, integration/load evidence M49, documentation M50. No new task-execution engine, separate read store, microservice split, arbitrary cron support or attention-queue product redesign is introduced by this reliability program. Attention-center product delivery is owned by M55, whose first task defines its user flow; it is outside this reliability milestone.

## 5. Task Breakdown

- [x] **M48-T01** — Refresh active queries after reconnect and randomize bounded reconnect delays.
  - **Files**: apps/gui/src/hooks/useLiveEvents.ts; apps/gui/src/hooks/useLiveEvents.test.tsx.
  - **Verify**: Fake-timer tests miss a mutation during a one-drop outage then reconnect; active scoped data refetches; initial ready/heartbeat behavior and offline fallback remain correct.

- [x] **M48-T02** — Signal queue overflow and force browser reconciliation.
  - **Files**: apps/backend/src/modules/events/events.handler.ts; apps/gui/src/lib/eventQueryKeys.ts; apps/gui/src/hooks/useLiveEvents.ts.
  - **Verify**: A tiny queue drops an event for one entity while another survives; resync signal causes the dropped entity to refetch; no cross-tenant payload is exposed.

- [x] **M48-T03** — Use cancellable CLI command contexts and configurable unary deadlines.
  - **Files**: apps/cli/cmd/*.go; apps/cli/internal/backend/clients.go; apps/cli/cmd/root.go.
  - **Verify**: A server that accepts but never responds hits the configured deadline; command cancellation interrupts a call; MCP stdio and subscriptions retain appropriate long-lived semantics; generated docs match.

- [x] **M48-T04** — Verify reconnect, overflow and CLI timeout journeys.
  - **Files**: apps/gui/tests/e2e/; apps/cli/cmd/*_test.go; .milestones/MILESTONE-48-client-recovery/reviews/.
  - **Verify**: Full GUI and CLI suites, backend feed tests, browser reconnect journey, CLI reference generation and review.

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
