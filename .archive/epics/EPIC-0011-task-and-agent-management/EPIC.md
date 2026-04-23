---
status: done
designs:
  architecture: completed
  ux: n/a
  qa_plan: completed
design_reviews:
  architecture: completed
  ux: n/a
  qa_plan: completed
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: approved
created_at: 2026-04-02
---

# Task and Agent Management

## Context & Objective
Tasker functions as a foundational Task Management System explicitly bridging Human Users and AI Agents (acting autonomously across organizations and projects). Following the completion of the Core Database Schemas, Authentication, Projects, and Task Types, the core runtime now needs genuine Task and Agent entities. Defining Tasks and linking them to Agents (via Configurations) enables the foundational MVP interaction model: tracking the state transitions of work assignments across different roles in real-time.

## Scope
### In Scope
- Define `tasks` schema with support for IDs derived from project, titles, statuses, descriptions, and comments.
- Define `agent_roles` schema (including system prompts, skills, MCP configuration).
- Define `agents` (instances) schema that links to `agent_roles`.
- Establish relationship junction schemas between `tasks`, `agents`, and `users` (e.g. `task_assignments`, `task_reviewers`).
- Update Connect-RPC `main.tsp` contracts for the new schemas.
- Implement transactional Drizzle creation/read endpoints.

### Out of Scope
- Custom UI for manipulating complex MCP JSON configs directly (assumed standard UI controls or API submission initially).
- Task-to-Artifact links (will be handled alongside the Artifacts epic).
- AI Text Notes specifically optimized context features.

## Dependencies
- EPIC-0004 (Auth & Orgs)
- EPIC-0005, EPIC-0008 (Task Types)
- EPIC-0006, EPIC-0007 (Projects)

## Technical Approach
- Utilizing **Domain-Driven Design (DDD)**, encapsulate schemas inside new `Tasks` and `Agents` bounded context folders `/src/modules/tasks` and `/src/modules/agents`. 
- Leverage **Drizzle ORM** for Type-safe relational references between Projects and Tasks, and Orgs and Agents.
- Update the **Connect-RPC TypeSpec** (`main.tsp`) to reflect the new API boundary.
- **CQRS Path**: Ensure write paths trigger NATS `TaskCreated`/`AgentCreated` events for asynchronous downstream indexing.

## Definition of Done
- DB schemas migrated successfully on Drizzle.
- Backend gRPC endpoints deployed via local standalone executing transactions locally end-to-end.
- Thorough isolated Zod payload validation in handlers.
- CI/CD build passing locally (coverage preserved >= 80%).

## Task Breakdown
- [x] Draft Drizzle schema for `agent_roles` and `agents` (instances).
- [x] Draft Drizzle schema for `tasks` and relational bindings (`task_assignments`).
- [x] Define backend API models and Service contracts in `main.tsp` for Tasks and Agents RPC.
- [x] Add Bun CRUD routes in `src/modules/agents/agents.handler.ts` connecting Zod validation and Drizzle inserts.
- [x] Add Bun CRUD routes in `src/modules/tasks/tasks.handler.ts` extending existing structure for task assignment and progression.
- [x] Dispatch NATS `AgentCreated` and `TaskCreated` events securely upon database commital.
- [x] Update frontend proxy clients/queries if applicable or provide full backend suite via standalone test assertions.
- [x] Write integration test assertions for `agents.test.ts` to ensure coverage metrics remain over the 80% threshold.
