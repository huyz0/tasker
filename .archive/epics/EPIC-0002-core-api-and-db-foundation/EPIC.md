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
created_at: 2026-03-30
---

# Core API & Database Foundation

## Context & Objective
A foundational pillar for Tasker as an autonomous task management system is a highly scalable, strongly-typed API and data storage backbone. Currently, the project structure is bootstrapped (from EPIC-0001), but the individual components (GUI, CLI, Backend) do not communicate. The objective of this epic is to establish the core data and API plumbing that everything else (Authentication, CLI logic, Task management) will rely on. This proves vertical connectivity across the tech stack by establishing database migrations (Drizzle/MySQL), setting up Connect-RPC over HTTPS on the Bun backend, compiling TypeSpec shared contracts, and verifying connectivity from the React GUI and Go CLI.

## Scope
### In Scope
- Setup of Drizzle ORM with MySQL connection in the `apps/backend`, including migration script capabilities.
- Establishment of the Connect-RPC backend server using Bun.
- Definition of a minimal `Health` or `Ping` contract in `packages/shared-contract` using TypeSpec, strictly generating TS and Go bindings.
- Setup of the Connect-RPC client in the React `apps/gui` mapped with TanStack React Query.
- Setup of the Connect-Go client in the Go `apps/cli`.
- End-to-end ping functionality (CLI -> Backend -> Database, and GUI -> Backend -> Database) to verify full-stack connectivity.

### Out of Scope
- Implementation of Authentication (Google OAuth 2.1) and user schemas (reserved for subsequent epics).
- Implementation of the Task/Project domain models.
- Implementation of OpenSearch sync or NATS event bus.
- Refinement of the TUI/Charmbracelet CLI aesthetic.

## Dependencies
- EPIC-0001 (Completed)

## Technical Approach
Following standard modular architecture and the defined tech stack:
- **Database Access (Backend):** We will utilize Drizzle ORM for type-safe query building and schema migrations against MySQL. The module boundary will expose a generic database connection utility.
- **Contract & Protocol (API Strategy):** The boundary interactions between CLI, GUI, and Backend will be strictly defined in `packages/shared-contract` using TypeSpec. This will be compiled to Connect-RPC (over HTTP) bindings for both Typescript (Connect-ES) and Go (Connect-Go).
- **Backend (Bun):** The backend will wrap the Connect-RPC handlers using Bun's native HTTP server (`Bun.serve`) for optimal performance.
- **Frontend (GUI):** The React SPA will leverage `@connectrpc/connect-query` explicitly tied into `@tanstack/react-query` to provide standard hooks for data fetching.
- **Client (CLI):** The Go CLI will use `connect-go` to perform an RPC call against the backend securely.

## Definition of Done
- `apps/backend` can successfully run Drizzle migrations against a local MySQL instance.
- `packages/shared-contract` contains an automated script that compiles TypeSpec to both Go and TS out-directories.
- A functional `HealthService` with a `ping` method is served on the Bun backend that confirms a successful DB `SELECT 1`.
- The `apps/cli` has a `ping` command that queries the backend (`npx cli ping`) and surfaces the result.
- The `apps/gui` homepage displays a live health indicator proving the React Query -> Connect-RPC stack is working.
- Continuous Integration strictly typechecks all generated bindings without linting errors.

## Task Breakdown
- [x] Configure `drizzle-orm` and `drizzle-kit` dependencies in `apps/backend`.
- [x] Create database connection module and a basic `schema_migrations_test` placeholder in `apps/backend`.
- [x] Provide a `docker-compose.yml` locally for spinning up MySQL for development, or document connection to a live dev instance.
- [x] Define `HealthService.ping` in `packages/shared-contract` using TypeSpec (`main.tsp`).
- [x] Setup code generation scripts in `packages/shared-contract` for TS (Connect-ES) and Go (Connect-Go).
- [x] Implement the `HealthService` backend handler parsing Connect-RPC over `Bun.serve` in `apps/backend`.
- [x] Configure global `@tanstack/react-query` and Connect-RPC client providers in `apps/gui`.
- [x] Create a basic React component displaying API health in `apps/gui`.
- [x] Add the `ping` command in `apps/cli` connecting via Cobra/Viper to the Go Connect client.
- [x] Add integration testing hooks to verify that `/api/v1` routes successfully resolve.
