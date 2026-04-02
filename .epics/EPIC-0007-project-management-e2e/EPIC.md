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

# Project Management Business Logic

## Context & Objective
Following the database schema creation for Auth, Organizations, Task Types, and Projects, the current Bun backend API continues to serve hardcoded mock data for `ProjectService` and `ProjectTemplateService`. In order to drive the autonomous task management system forward into Phase 1 (MVP) production, we need to bridge these RPC handlers with real Drizzle ORM transactions. This epic aims to provide actual end-to-end business logic for the Project Bounded Context, allowing the CLI and GUI to fully query and mutate project instances.

## Scope
### In Scope
- Replace mocked responses in `ProjectTemplateService` (`getTemplate`, `createTemplate`) with transactional Drizzle commands.
- Replace mocked responses in `ProjectService` (`getProject`, `createProject`) with transactional Drizzle commands.
- Enforce strict cross-tenant logical isolation (ensure authenticated users can only query/create projects within their associated `orgId`.
- Publish `ProjectCreated` and `TemplateCreated` domain events to NATS.
- Implement comprehensive backend unit testing for the defined endpoints.

### Out of Scope
- Building out actual front-end React views (assume UI integrates via React Query).
- Transitioning Read queries to OpenSearch materialized views. For this MVP iteration, data will be read straight from MySQL.
- Providing E2E implementation for Organizations, Auth or Task Types (they belong to separate specific implementations).

## Dependencies
- EPIC-0004 (Authentication and Org Management)
- EPIC-0006 (Project Templates Schemas)

## Technical Approach
Following our modular architecture, `ProjectTemplateService` and `ProjectService` handlers defined in `apps/backend/index.ts` will be updated to inject the database connection pool securely. Write Operations (`createProject`) will sequentially: validate input via Zod/TypeSpec contracts, insert transactional rows using Drizzle ORM configured for SQLite/MySQL agnostically, and instantly publish a Domain Event payload to NATS. Read Operations (`getProject`) will utilize simple Drizzle `select` wrappers with explicit `WHERE orgId = ?` clauses for boundary safety. 

## Definition of Done
- `ProjectService` and `ProjectTemplateService` no longer contain mocked hardcoded outputs in `index.ts`.
- Creation endpoints successfully store records in the active database.
- Read endpoints filter correctly by providing strict Org isolation checks based on user auth token values.
- NATS client gracefully publishes events when records are successfully committed.
- Standalone local testing executing `bun test` passes validation logic.

## Task Breakdown
- [x] Connect `ProjectTemplateService.createTemplate` to Drizzle `insert` statements and handle Zod validation.
- [x] Connect `ProjectTemplateService.getTemplate` to Drizzle `select` statements applying tenant filtering.
- [x] Connect `ProjectService.createProject` to Drizzle `insert` statements ensuring valid nested template IDs.
- [x] Connect `ProjectService.getProject` to Drizzle `select` statements applying tenant filtering.
- [x] Integrate user session authorization to ensure the `orgId` is resolved accurately from current token scopes within handlers.
- [x] Initialize NATS event logging block inside successful create operations, logging no-ops nicely when in Standalone execution.
- [x] Write integration test functions to validate the CRUD pipelines against `apps/backend`.
