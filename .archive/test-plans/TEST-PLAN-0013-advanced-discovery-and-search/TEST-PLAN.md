---
status: draft
title: "Advanced Discovery and Search Validation"
epic_link: EPIC-0013
author: Auto
created_at: 2026-04-03
---

# Advanced Discovery and Search Validation

## Context & Objective
Tests the implementation of standard cursor-based pagination, multi-field filtering, and dynamic sorting functionality introduced in EPIC-0013 to ensure it handles high data loads securely across bounded contexts.

## Scope of Testing
### In Scope
- Standardized API Contracts (ListRequest/ListResponse)
- Reusable Query Builder Logic
- Refactored List Handlers for Organizations, Projects, Tasks, Artifacts, Comments
- CLI Flags for discovery
- GUI Integration for paging controls

### Out of Scope
- Full-text global search (OpenSearch)
- Complex Boolean OR logic

## Test Strategy & Environment
- **Unit/Integration**: Query builder test with Drizzle SQL mocking and true DB roundtrips. API Handler response shapes and status codes.
- **E2E Critical Path**: Ensure CLI outputs cursor details correctly.

## Test Cases

### TC-001: Cursor Pagination Retrieval
- **Type**: Integration
- **Given**: A project list seeded with 40 active items.
- **When**: The API `/api/v1/projects?limit=25` is called.
- **Then**: 25 items are returned with a valid `nextCursor`. When called again with `?cursor=[nextCursor]`, the remaining 15 items are returned and `nextCursor` is null.

### TC-002: Multi-field Filtering Execution
- **Type**: Integration
- **Given**: A task list seeded with various statuses and priorities.
- **When**: The API `/api/v1/tasks?filter[status]=active&filter[priority]=high` is called.
- **Then**: Only tasks that match BOTH conditions are returned.

### TC-003: Dynamic Sorting Validation
- **Type**: Integration
- **Given**: An artifact list seeded with varying created_at timestamps.
- **When**: The API `/api/v1/artifacts?sort=-created_at` is called.
- **Then**: The most recently created artifacts are returned first.

### TC-004: Invalid Filter Protection
- **Type**: Integration
- **Given**: A list handler attached to the Drizzle Query builder.
- **When**: The API is called with a filter for a non-existent standard column `?filter[secret_hash]=foo`.
- **Then**: A 400 Bad Request error is thrown by the Zod query validation.
