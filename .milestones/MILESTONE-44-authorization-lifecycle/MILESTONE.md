---
id: M44
title: Authorization Lifecycle
status: in-progress
goal: Current permissions govern every cached response and every long-lived subscription.
depends_on: []
surfaces: [backend, specs]
exit_criteria_met: false
started_at: 2026-11-08
completed_at: null
---

# M44 — Authorization Lifecycle

## 1. Goal

Current permissions govern every cached response and every long-lived subscription.

## 2. Why Now

Revocation must take effect even when a request reuses an old idempotency key or holds an existing stream.

## 3. Exit Criteria

- [ ] Removed or demoted users cannot retrieve a cached mutating RPC response.
- [ ] A narrower replacement agent token cannot reuse a broader credential's authorization.
- [ ] Revoked or expired credentials stop receiving event metadata within the documented revalidation bound.
- [ ] Existing authorized subscriptions and same-key retries continue to work.

## 4. Scope

In scope: the tasks below and their regression tests, migrations, compatibility checks and operating documentation.

Related work is owned explicitly: authorization M44, atomic operations M45, durable events M46, schedules M47, client recovery M48, integration/load evidence M49, documentation M50. No new task-execution engine, separate read store, microservice split, arbitrary cron support or attention-queue product redesign is introduced by this reliability program. The attention queue from the review is a later product proposal requiring its own user-flow design.

## 5. Task Breakdown

- [x] **M44-T01** — Record the authorization and recovery design, acceptance scenarios, and delivery sequence.
  - **Files**: .specs/adr/ADR-0037-authorization-lifecycle.md; .test-plans/TEST-PLAN-0044-authorization-lifecycle/TEST-PLAN.md; .milestones/STATE.md.
  - **Verify**: bun run scripts/doc-drift.ts; review acceptance scenarios against the affected call sites.

- [ ] **M44-T02** — Authorize keyed task mutations before both cache replay and execution.
  - **Files**: apps/backend/src/modules/tasks/tasks.handler.ts; apps/backend/src/lib/idempotency.test.ts.
  - **Verify**: Regression tests deny replay after membership removal, role reduction, or replacement with a narrower agent token; legitimate same-key replay still succeeds.

- [ ] **M44-T03** — Revalidate credentials and membership on bounded intervals for event subscribers.
  - **Files**: apps/backend/src/modules/events/events.handler.ts; apps/backend/src/modules/auth/session.ts; apps/backend/src/index.ts.
  - **Verify**: Tests revoke an agent token and a human session while their streams remain open; subsequent events are refused, including under continuous event traffic.

- [ ] **M44-T04** — Verify authorization lifecycle behavior and record the security review.
  - **Files**: apps/backend/src/modules/events/events.handler.test.ts; .milestones/MILESTONE-44-authorization-lifecycle/reviews/.
  - **Verify**: Run the full backend suite and typecheck; review correctness, coverage, architecture and security; record exact failures rather than weakening checks.

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
