---
status: done
designs:
  architecture: approved
  ux: n/a
  qa_plan: n/a
design_reviews:
  architecture: n/a
  ux: n/a
  qa_plan: n/a
reviews:
  code: completed
  security: n/a
  qa_implement: n/a
  architecture_code: completed
created_at: 2026-04-02
---

# Backend DDD & CQRS Refactor

## Context & Objective
The `apps/backend` directory currently has several source files (`index.ts`, `db.ts`, `schema.*.ts`) sitting in the root folder rather than inside `src/`, leading to a God Class pattern and confusing separation of compiled output and sources. To adhere to our `architecture.md` (Domain-Driven Design and Command Query Responsibility Segregation), we must refactor the backend codebase into clear Bounded Contexts within `src/` and separate out the API Gateway, Event Bus, and Data Store responsibilities. This ensures a maintainable setup for M2M agent API usage.

## Scope
### In Scope
- Move `index.ts`, `db.ts`, and schema files into `apps/backend/src/`.
- Break down the current `index.ts` API into dedicated DDD boundary folders inside `src/domain/` or `src/features/` (e.g., `projects`, `tasks`, `teams`, `users`, `auth`).
- Introduce CQRS separation: separate API routes for Reads vs Writes if applicable, or at least separate service command handlers from query handlers.
- Update compiler configuration (`tsconfig.json`, `moon.yml`, `package.json`, `drizzle.config.ts`) to reflect the new `src/` structure and ensure output goes strictly to `dist/` or `build/`.
- Fix all failing imports and routing mapping.

### Out of Scope
- Adding new feature functionality.
- Changing frontend React files beyond any TS interface reference updates needed from backend.
- Changing database schema columns.

## Dependencies
None identified.

## Technical Approach
- Standardize on `apps/backend/src`.
- Reorganize `apps/backend/index.ts` into a fast Bun server router that delegates to handlers within `src/modules/{domain}`.
- Refactor the code to use CQRS handlers where commands and queries are isolated scripts/functions.
- Update `drizzle.config.ts` to look for schemas in `src/db/schema.mysql.ts` and `src/db/schema.sqlite.ts`.
- Ensure `bun run dev`, `moon run backend:build`, etc. all run perfectly without issue.

## Definition of Done
- No source code files exist in the `apps/backend` root except structural config (`package.json`, `tsconfig.json`, `bun.lock`, `drizzle*.config.ts`).
- `index.ts` is moved to `src/index.ts`.
- Code uses DDD and CQRS.
- All backend unit/integration tests pass.
- `moon ci` local passes fully.

## Task Breakdown
- [x] Create `apps/backend/src` structure.
- [x] Move `drizzle` schemas and DB connection (`db.ts`) into `src/infrastructure/database/` or similar. Update configs.
- [x] Extract DDD contexts (e.g. `auth`, `orgs`, `projects`, `tasks`) out of `apps/backend/index.ts` into `src/modules/*/`.
- [x] Introduce Command and Query Separation for handlers in each module.
- [x] Reconfigure `apps/backend/package.json` and `tsconfig.json` to properly compile `src/` out to `dist/`.
- [x] Connect the extracted modules into a new streamlined `src/index.ts` router.
- [x] Run typescript checks and tests across the backend, fixing broken cross-imports.
