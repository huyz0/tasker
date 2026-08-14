---
status: draft
title: "Core API & Database Foundation Validation"
epic_link: EPIC-0002
author: Auto
created_at: 2026-03-30
---

# Core API & Database Foundation Validation

## Context & Objective
Validates that the fundamental architecture connectivity across CLI, Frontend, Backend, and Database is successfully bridged using Connect-RPC and Drizzle ORM.

## Scope of Testing
### In Scope
- Drizzle ORM MySQL Migration executions.
- Connect-RPC generation scripts (TypeSpec to Go/TS).
- Health ping resolution from GUI (React Query) and CLI (Cobra).

### Out of Scope
- OAuth login or User DB models.
- Event-bus streaming test coverage.

## Test Strategy & Environment
- **Unit/Integration**: Backend DB integration tests hitting a test MySQL database. TypeSpec generation validation.
- **E2E Critical Path**: End-to-end Go CLI execution and a Playwright test loading the GUI to verify the health ping.
- **Data/Mocking Needs**: A standard MySQL container must be running. No mock data is needed; `SELECT 1` is sufficient.

## Test Cases

### TC-001: Generate TypeSpec Contracts
- **Type**: Unit
- **Given**: The TypeSpec compiler configuration is clean.
- **When**: Running the contract generation script in `packages/shared-contract`.
- **Then**: It outputs syntactically valid TypeScript and Go Connect-RPC server stubs and clients with a `ping` method.

### TC-002: Backend DB Connection Pool Validity
- **Type**: Integration
- **Given**: A test-instance MySQL database running on `localhost:3306`.
- **When**: The Bun backend executes `drizzle-kit push` or runs a test script connecting via the `drizzle-orm` pool.
- **Then**: It connects successfully and creates the `schema_migrations_test` safely without dropping tables.

### TC-003: Backend RPC Health Ping
- **Type**: Integration
- **Given**: A running Bun backend mapped to a live MySQL database.
- **When**: Attempting a `POST /health.v1.HealthService/Ping` request manually.
- **Then**: It returns `HTTP 200` with the correct JSON envelope signaling health.

### TC-004: CLI Ping E2E Test
- **Type**: E2E
- **Given**: The Go CLI binary is built via `go build` and the backend is running.
- **When**: A user runs `cli ping`.
- **Then**: It connects to `http://localhost:port`, fires the RPC query, and outputs a success (or structured JSON via `--json`).

### TC-005: GUI React Query Health Feed
- **Type**: E2E
- **Given**: The React SPA is running connected to the default local backend.
- **When**: A user navigates to the root `/` page.
- **Then**: The `@connectrpc/connect-query` hook attempts the ping and resolves, displaying the `Healthy` indicator in the DOM.

### TC-006: Backend Handling Dead DB (Negative Case)
- **Type**: Integration
- **Given**: The backend is running but the MySQL connection string is intentionally invalid/shut down.
- **When**: The `HealthService.ping()` method is triggered.
- **Then**: The backend safely captures the standard library database error and returns an RPC error mapped to `Unavailable` or `Internal`.
