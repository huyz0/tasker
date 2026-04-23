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

# Artifact Management and Nested Folders

## Context & Objective
As Tasker bridges Human Users and AI Agents, a robust artifact management system is crucial. Agents generate output artifacts (text files, images, logs), and humans need to review, comment on, and organize them into nested folders. Furthermore, tasks need to link directly to related artifacts to maintain context. Flexible commenting systems for tasks and artifacts will streamline asynchronous communication loops between Agents and Humans.

## Scope
### In Scope
- Define `folders` schema for managing nested hierarchical directories.
- Define `artifacts` schema (name, description, label, url) within folders.
- Define `task_artifact_links` schema to associate tasks with relevant artifacts.
- Define `comments` schema with markdown support for Tasks and Artifacts.
- Update Connect-RPC `main.tsp` to feature folders, artifacts, links, and API methods.
- Implement transactional Drizzle creation/read endpoints in `src/modules/artifacts` and `src/modules/comments`.

### Out of Scope
- Full-text universal global search across all artifacts (deferred to Phase 2).
- Version history or complex diffs of modified artifacts (deferred).
- External repositories linking.

## Dependencies
- EPIC-0011 (Task and Agent Management)

## Technical Approach
- Utilizing **Domain-Driven Design (DDD)**, encapsulate schemas inside a new `Artifacts` and `Comments` bounded context.
- Leverage **Drizzle ORM** for type-safe relational queries.
- Update the **Connect-RPC TypeSpec** (`main.tsp`) for the API boundary.
- **CQRS Path**: Ensure write paths trigger NATS events (`ArtifactCreated`, `CommentCreated`) where applicable.

## Definition of Done
- Database schemas for folders, artifacts, links, and comments are active.
- Backend gRPC endpoints are handling creation and assignment transactionally.
- Zod validation enforces required fields on bounded context handlers.
- Thorough unit and integration tests passing locally maintaining > 70% coverage.

## Task Breakdown
- [x] Draft schemas in `src/db/schema.mysql.ts` for folders, artifacts, links, and comments.
- [x] Connect-RPC definitions in `main.tsp` for Artifacts and Comments handling.
- [x] Build backend routes (`src/modules/artifacts/artifacts.handler.ts` & `src/modules/comments/comments.handler.ts`).
- [x] Add Bun test implementations (`artifacts.test.ts` & `comments.test.ts`).
- [x] Mark tests passing and finalize Epic checking to done.
