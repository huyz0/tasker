# ADR 0001: Standardized Cursor Pagination
- **Date**: 2026-04-03
- **Epic**: EPIC-0013

## Context
As resource counts increase (e.g. thousands of tasks per project), simple offset-based pagination (`offset`, `limit`) becomes inefficient and error-prone when concurrent inserts/deletes occur, leading to missed or duplicated items on subsequent pages.

## Decision
We will standardize on Cursor-Based Pagination for all core list endpoints. Clients will pass an opaque `cursor` string and receive `nextCursor` in the response. Sorting will determine exactly what the cursor represents (primary key ID vs a combination of sorted columns + ID to break ties).

## Rationale
Cursor pagination guarantees stability of results during concurrent modifications, eliminating standard problems found in typical offset pagination implementations for fast-growing data series like Artifacts or Comments.

## Consequences
- **Positive:** High performance on deep pages and stable rendering.
- **Negative:** Harder to implement UI features like "Jump to Page X". Complex edge cases when sorting by non-unique fields.
