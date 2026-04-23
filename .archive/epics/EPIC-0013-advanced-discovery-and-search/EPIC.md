---
status: done
designs:
  architecture: completed
  ux: completed
  qa_plan: completed
design_reviews:
  architecture: completed
  ux: completed
  qa_plan: completed
reviews:
  code: completed
  security: completed
  qa_implement: completed
  architecture_code: completed
created_at: 2026-04-03
---

# Advanced Discovery and Search

## Context & Objective

As Tasker scales toward its mission-critical targets (20K agents/users, 2K concurrent projects), simple list endpoints are no longer sufficient. Both AI agents and human users require efficient ways to navigate, filter, and discover specific resources without loading massive datasets into memory or context windows.

This epic completes the **Phase 1 (MVP) Roadmap** by standardizing and implementing advanced discovery capabilities—including cursor-based pagination, multi-field filtering, and dynamic sorting—across all core bounded contexts.

## Scope

### In Scope

- **Standardized API Contracts**: Define unified `ListRequest` and `ListResponse` structures in TypeSpec (`main.tsp`) following `api-standard.md`.
- **Reusable Query Logic**: Implement shared backend utilities to transform standard filter/sort requests into type-safe Drizzle SQL clauses.
- **Bounded Context Refactoring**: Update the following modules to support the new discovery features:
  - **Organizations & Teams**
  - **Projects & Templates**
  - **Tasks & Agent Management**
  - **Artifacts & Folders**
  - **Comments**
- **CLI Discovery Surface**: Expose `--limit`, `--cursor`, and `--filter` flags across all listing commands.
- **GUI Integration**: Update the React SPA with paging controls and basic filtering headers.

### Out of Scope

- **Universal Global Search**: OpenSearch-based cross-entity search (deferred to Phase 2).
- **Full-Text Artifact Search**: Searching inside the contents of text/image artifacts (Phase 2).
- **Complex Boolean Filters**: Support for nested AND/OR/NOT logic in filter parameters.

## Dependencies

- **EPIC-0011**: Task and Agent Management (Existing core entities).
- **EPIC-0012**: Artifact Management (Existing core entities).

## Technical Approach

- **API Design**: strictly adhere to cursor-based pagination (`?cursor=xyz&limit=20`) to ensure deterministic results as new items are added.
- **Database Layer**: Leverage Drizzle's relational filters. Create a `QueryBuilder` utility in `src/infrastructure/database/` to prevent logic duplication.
- **Validation**: Use **Zod** to strictly type and sanitize incoming filter parameters at the handler boundary.
- **CQRS Compliance**: Ensure discovery queries are isolated from command logic to allow for future read-side scaling (as outlined in `architecture.md`).

## Definition of Done

- [x] All primary entity `list` endpoints support cursor-based paging, multi-field filtering, and sorting.
- [x] Connect-RPC API contracts are updated and validated.
- [x] CLI supports discovery flags for all primary entities.
- [x] GUI display list results with functional paging controls.
- [x] Integration tests verify paging consistency and filter accuracy across all modules.
- [x] Documentation updated to reflect the new search and discovery capabilities.

## Task Breakdown

- [x] Define reusable `ListRequest` and `ListResponse` in `main.tsp`.
- [x] Create `src/infrastructure/database/query-builder.ts` utility.
- [x] Refactor `Organizations/Teams` list handlers.
- [x] Refactor `Projects` list handlers.
- [x] Refactor `Tasks` list handlers.
- [x] Refactor `Artifacts/Folders` list handlers.
- [x] Refactor `Comments` list handlers.
- [x] Update CLI command definitions and logic.
- [x] Implement GUI paging and filter UI components.
- [x] Final end-to-end verification and performance check.
