---
status: done
designs:
  architecture: completed
  ux: n/a
  qa_plan: completed
design_reviews:
  architecture: approved
  ux: n/a
  qa_plan: approved
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: approved
created_at: 2026-04-02
---

# Real Task Types Implementation

## Context & Objective
Tasker needs real persistence for its foundational elements. Currently, the `TaskTypeService` in the backend provides mocked, hardcoded data. To support the objective of building robust Task Management for AI agents, we must replace this mocked implementation with real database-backed operations using Drizzle ORM, integrating with our CQRS architecture.

## Scope
### In Scope
- Modify `apps/backend/index.ts` to replace mock `TaskTypeService` handlers (`getTaskType`, `createTaskType`, etc.) with real queries using Drizzle ORM.
- Emit Domain Events to NATS upon TaskType creation/updates.
- Implement tests verifying the real DB pathways.

### Out of Scope
- Modifying the Task Types schemas (already done in EPIC-0005).
- UI/UX changes (Task Types creation is purely backend and CLI right now).

## Dependencies
- EPIC-0005 (Completed) - Provided the `task_types` schemas and contracts.

## Technical Approach
- Leverage `drizzle-orm` in the backend router for the `TaskTypeService`.
- Check `isStandalone` to query either `schemaSqlite.taskTypes` or `schemaMysql.taskTypes`.
- Ensure NATS events such as `domain.task_type.created` are published.

## Definition of Done
- `TaskTypeService` methods hit the actual database and return real records.
- Integration tests or unit tests pass against the real implementation.
- No mocked implementations remain in `TaskTypeService`.

## Task Breakdown
- [x] Remove mock responses from `TaskTypeService` in `apps/backend/index.ts`.
- [x] Implement `getTaskType` using Drizzle ORM.
- [x] Implement `createTaskType` using Drizzle ORM and emit NATS event.
- [x] Write integration or unit tests for the updated service.
