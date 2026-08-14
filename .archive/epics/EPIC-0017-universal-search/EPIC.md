---
status: done
designs:
  architecture: completed
  ux: completed
  qa_plan: completed
design_reviews:
  architecture: approved
  ux: approved
  qa_plan: approved
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: approved
created_at: 2026-04-24
---

# Universal Search Functionality

## Context & Objective
The product roadmap (Phase 2) requires a universal/global search functionality across all artifacts and tasks. This feature is crucial for allowing users and AI agents to quickly discover relevant context, old tasks, and specific documentation without manually navigating hierarchical folders or project structures. 

## Scope
### In Scope
- A new `UniversalSearch` RPC endpoint in the Connect-RPC contract.
- Backend implementation of full-text search leveraging SQLite FTS5 for local/embedded execution.
- React frontend global search UI (e.g., a command palette or global search bar) integrated with TanStack Query.
- Support for searching `Task` titles/descriptions/comments and `Artifact` titles/content.

### Out of Scope
- OpenSearch integration for cloud deployments (defer to a later cloud-specific Epic).
- Advanced semantic/vector search (only keyword/FTS search for now).

## Dependencies
- Tasks and Artifacts entities must be fully stabilized (already done in Phase 1).

## Technical Approach
To be determined during technical planning (epic-design phase).

## Definition of Done
- [x] Connect-RPC API contract for Universal Search is defined and validated.
- [x] Backend implements SQLite FTS5 queries against Tasks and Artifacts.
- [x] Frontend command palette/search UI is implemented, rendering results with type-specific icons and links.
- [x] E2E and Unit Tests pass for the new search functionality.
- [x] Implementation is fully working end-to-end, without mocked responses or fake data layers.

## Task Breakdown
- [x] Update TypeSpec and Connect-RPC contracts with `UniversalSearch` service and types.
- [x] Implement backend FTS5 queries using Drizzle ORM for SQLite.
- [x] Add backend RPC handler for `UniversalSearch` tying to the FTS5 queries.
- [x] Create Storybook UI components for the Global Search / Command Palette.
- [x] Integrate React TanStack Query in the frontend to call the `UniversalSearch` endpoint.
- [x] Add Playwright E2E tests validating the search functionality.
