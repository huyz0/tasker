# ADR 0001: Polymorphic Comments vs Distinct Tables
- **Date**: 2026-04-05
- **Epic**: EPIC-0014

## Context
Comments need to be attached to both Tasks and Artifacts. Should we use a single polymorphic table (`comments` with `target_type` and `target_id`) or distinct tables (`task_comments` and `artifact_comments`)?

## Decision
We will use a single polymorphic table (`comments`).

## Rationale
Since comments structurally share the same fields (author_id, content, created_at, updated_at) regardless of what they are attached to, a single table simplifies pagination, unified search queries (e.g. "show all comments by user X"), and the GraphQL/TypeSpec API surface.

## Consequences
- **Positive:** Simpler API and shared ORM entities. Easy point-in-time full-text search sync to OpenSearch.
- **Negative:** No built-in foreign key constraints bridging the `target_id` to its parent table implicitly; referential integrity must be manually managed at the application / event level.
