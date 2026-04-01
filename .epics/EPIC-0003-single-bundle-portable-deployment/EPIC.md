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
created_at: 2026-04-01
---

# Single-Bundle Portable Deployment

## Context & Objective
To maximize developer experience and enable users to run the Tasker system locally without complex server-side setup, the architecture demands a single-bundle portable packaging option. This epic fulfills a critical Phase 1 MVP roadmap requirement. It will abstract our current MySQL/OpenSearch data layer to allow seamlessly swapping to a native, embedded `bun:sqlite` database equipped with the FTS5 extension for transactions and full-text search. Furthermore, it will adapt the Connect-RPC protocol to utilize lightweight, in-process function calls instead of network HTTP requests, culminating in a single executable compiled via `bun build --compile`.

## Scope
### In Scope
- Implement a Data Storage Abstraction layer to seamlessly switch between the MySQL driver and the `bun:sqlite` local driver using Drizzle ORM.
- Implement the FTS5 (Full-Text Search) virtual table schemas within the SQLite dialect to mimic OpenSearch search capability for local instances.
- Modify the API Gateway to detect single-bundle mode, bypassing the `Bun.serve` network stack to fulfill TypeSpec/Connect-RPC contracts via direct in-process function invocation.
- Create a build script (`bun build --compile`) that bundles the Vite frontend assets, the Bun backend logic, and the SQLite engine into a singular cross-platform binary.
- Ensure automated database migrations run seamlessly against the local SQLite file on startup in embedded mode.

### Out of Scope
- Advanced NATS event bus clustering (the embedded option runs in a single process).
- Setup or deployment of actual OpenSearch infrastructure (this epic focuses solely on the embedded SQLite fallback).
- Adding new feature domains (managing tasks, users, etc.) beyond proving the DB abstraction and compilation pipeline.

## Dependencies
- EPIC-0002-core-api-and-db-foundation

## Technical Approach
- **Database Abstraction:** We will leverage Drizzle ORM's multi-dialect support (`drizzle-orm/mysql2` vs `drizzle-orm/bun-sqlite`). A config-driven adapter factory will inject the correct database instance into our bounded contexts.
- **Search Abstraction:** For queries requiring complex text searches, the adapter will route to standard SQL matching for SQLite FTS5 (`MATCH`) instead of OpenSearch DSL.
- **In-Process Communication:** The frontend/CLI API clients will be configured with a custom Connect-RPC transport that directly executes the backend handler functions when running in standalone mode, avoiding `fetch` overhead.
- **Bundling:** The Vite build output will be injected or served via a virtual file system within Bun, allowing `bun build --compile` to pack all HTML/JS/CSS alongside the backend code.

## Definition of Done
- A multi-dialect Drizzle ORM setup is verified, supporting both MySQL and `bun:sqlite`.
- An integration test successfully executes FTS5 `MATCH` queries alongside standard transactional inserts.
- A custom Connect-RPC transport successfully routes a frontend query to a backend handler strictly in-process (no network port opened).
- Running a specific build script produces a single binary executable (`tasker-standalone`) using `bun build --compile`.
- Executing the `tasker-standalone` binary starts the app, automatically migrates a local `.sqlite` file, and successfully serves the React SPA from memory.

## Task Breakdown
- [x] Refactor the current `apps/backend` database connection to an abstract adapter pattern supporting both `mysql2` and `bun:sqlite`.
- [x] Update Drizzle configuration to output migrations for both MySQL and SQLite dialects.
- [x] Implement an initialization script that runs SQLite migrations automatically on application start when in embedded mode.
- [x] Create a proof-of-concept FTS5 virtual table schema and test full-text inserts/queries using `bun:sqlite`.
- [x] Build a custom Connect-RPC transport for in-process execution, ensuring identical message contract validation.
- [x] Inject the Vite production build (`dist`) into the Bun backend server to serve static assets directly.
- [x] Create the `build:standalone` Moonrepo task utilizing `bun build --compile`.
- [x] Add E2E tests executing the newly compiled standalone binary to verify zero-config startup and data persistence capability.
