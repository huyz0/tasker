---
id: M50
title: Operational Truth
status: todo
goal: Architecture, roadmap, agent guidance and operations documentation match verified behavior and recovery guarantees.
depends_on: [M49]
surfaces: [specs, backend]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M50 — Operational Truth

## 1. Goal

Architecture, roadmap, agent guidance and operations documentation match verified behavior and recovery guarantees.

## 2. Why Now

Documents repeatedly inject obsolete assumptions into development, and new reliability guarantees need operational instructions.

## 3. Exit Criteria

- [ ] Architecture no longer contradicts delivered consumers, MCP, pagination or deployment artifacts.
- [ ] Operators can inspect and recover pending events and interrupted scheduled work.
- [ ] Roadmap and milestone ledger agree with task checkboxes and verification evidence.
- [ ] Documentation states the actual tested reliability and capacity boundaries.

## 4. Scope

In scope: the tasks below and their regression tests, migrations, compatibility checks and operating documentation.

Related work is owned explicitly: authorization M44, atomic operations M45, durable events M46, schedules M47, client recovery M48, integration/load evidence M49, documentation M50. No new task-execution engine, separate read store, microservice split, arbitrary cron support or attention-queue product redesign is introduced by this reliability program. Attention-center product delivery is owned by M55, whose first task defines its user flow; it is outside this reliability milestone.

## 5. Task Breakdown

- [ ] **M50-T01** — Reconcile architecture and standards with code and current decisions.
  - **Files**: .specs/product/architecture.md; .specs/standards/api-standard.md; .specs/standards/security-standard.md.
  - **Verify**: Check all present-tense claims against source: consumers, streams, MCP, CLI pagination, Radix, deployment manifests, measured scale and remaining gaps; doc-drift passes.

- [ ] **M50-T02** — Update roadmap, delivery index and integration documentation.
  - **Files**: .specs/product/roadmap.md; README.md; docs/agent-integration.md; docs/webhooks.md; docs/cli-reference.md.
  - **Verify**: Roadmap includes M30–M58 with truthful status; retry/processing errors, event duplicates, stream revalidation, CLI timeout and schedule recovery are documented.

- [ ] **M50-T03** — Add a recovery runbook and close with an evidence-backed review.
  - **Files**: docs/recovery.md; .milestones/STATE.md; .milestones/MILESTONE-50-operational-truth/reviews/.
  - **Verify**: Exercise documented procedures for pending events, expired leases, interrupted occurrences, backup/restore and broker recovery against a disposable deployment; final gates and clean working tree.

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
