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

# Task Types & State Machines Management

## Context & Objective
As Tasker seeks to seamlessly integrate AI agents and humans scaling up to 20K teams and 2K active projects, flexible and verifiable task management is critical. The objective of this epic is to lay the foundation for highly customizable Task Types, Status Enums, and precise State Machines. This allows different projects/teams to define their own task lifecycle (e.g., "To Do -> In Progress -> Code Review -> Done") while maintaining strict constraints to guide both AI agents and human users. This satisfies a core Phase 1 (MVP) requirement.

## Scope
### In Scope
- Setup `task_types` and `task_statuses` database schemas via Drizzle ORM to allow custom type definition and customization at both the Organization and Project levels.
- Establish `state_machine_rules` schema to govern allowed transitions between `task_statuses`, supporting org-level defaults and project-level overrides.
- Initialize predefined core task types representing the standard hierarchy: `Epic`, `Task`.
- Initialize predefined status enums for the core types (e.g., `Todo`, `In Progress`, `Done`) and default state machine transition paths for them.
- Define TypeSpec contracts in `packages/shared-contract/main.tsp` for creating, reading, updating, and deleting task types and statuses.
- Implement Zod runtime validation logic in the Bun backend to enforce State Machine transition rules when a Task update is requested.
- Create CLI commands for agents to query allowed statuses for a given task type and attempt status transitions safely.

### Out of Scope
- Interactive GUI visual editors (React Flow) and dual-support textual language definition for State Machines (moved to EPIC-0006).
- Advanced dynamic condition-based transitions (e.g., transition allowed only if 'reviewers' > 1) – simple state-to-state mapping only for now.
- Custom fields associated with task types (deferred to a later Phase 1/Phase 2 epic).
- Implementation of actual tasks; this epic strictly sets up the *definitions* and *validations* for when tasks are eventually created.

## Dependencies
- EPIC-0004 (Authentication and Organization Management) - Required for multi-tenant isolation of task types.

## Technical Approach
- **Database**: Add `task_types` (linked to `org_id` and nullable `project_id`), `task_statuses` (linked to `task_type_id`), and `task_status_transitions` (linked to `task_type_id` mapping `from_status_id` to `to_status_id`) via Drizzle. A null `project_id` indicates an org-level definition; if a project redefines a type, it gets its own record linked to the `project_id`. Add seed data for the predefined `Epic` and `Task` types.
- **Backend (Bun)**: Implement the core CQRS pathways. Expose Connect-RPC endpoints for type management. Create a strict Zod-based validation pipeline that queries the DB for allowed transitions before mutating task state. When definitions change, emit NATS events to notify other domains.
- **Client (CLI)**: Implement dual-surface CLI tooling (human-readable tables vs. JSON) to introspect task schemas (`cli schema task-type [ID]`), conforming to Agent DX predictability requirements.

## Definition of Done
- `task_types`, `task_statuses`, and `task_status_transitions` schemas are successfully migrated.
- Backend API endpoints for CRUD operations on types and transitions at both the Org and Project levels are deployed and type-checked via TypeSpec.
- Database seeding successfully populates the default `Epic` and `Task` types, their default statuses, and their allowed transitions.
- A human admin or agent can create a new Task Type and map valid state transitions via the CLI (GUI deferred to next epic).
- CLI user or Agent can fetch a task type's allowed statuses and transitions via JSON `tasker type view [ID] --json`.
- State transitions are strictly enforced at the backend: attempting an invalid transition returns a structured HTTP Problem Detail error (as per observability standard).
- End-to-end tests demonstrate validation enforcement and successful schema migrations.

## Task Breakdown
- [x] Define `task_types`, `task_statuses`, and `task_status_transitions` Drizzle schemas in `apps/backend` supporting both org-level and project-level relationships.
- [x] Implement database seed scripts to pre-populate `Epic` and `Task` schemas with default statuses and transition mappings.
- [x] Update `main.tsp` in `packages/shared-contract` with types and service definitions for the new domain.
- [x] Implement backend Connect-RPC handler functions for creating and updating Task Types.
- [x] Implement backend State Machine transition validation logic (Zod + DB query helper).
- [x] Expose `tasker type view` and `tasker type create` commands in `apps/cli`.
- [x] Plumb NATS event emission for `TaskTypeUpdated` and `TaskTypeCreated` domain events.
- [x] Write integration tests verifying behavior of invalid state transitions.
