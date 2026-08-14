---
status: draft
title: "Single-Bundle Portable Deployment Validation"
epic_link: EPIC-0003
author: Auto
created_at: 2026-04-01
---

# Single-Bundle Portable Deployment Validation

## Context & Objective
This test plan explicitly targets the validation of the Single-Bundle Portable Deployment implementation. It verifies that the backend abstractions effectively swap MySQL/OpenSearch for embedded SQLite features, confirming the successful generation and zero-config execution of the resulting single-binary executable artifact. 

## Scope of Testing
### In Scope
- Verification of the Data Storage Abstraction layer and Drizzle ORM dialects (`drizzle-orm/mysql2` and `drizzle-orm/bun-sqlite`).
- Verification of SQLite FTS5 (Full-Text Search) implementation vs standard SQL queries.
- Connect-RPC Custom Transport executing without network interfaces.
- `bun build --compile` artifact generation.
- Automated local execution of SQLite schema migrations on startup.

### Out of Scope
- Advanced NATS event bus clustering behaviors.
- Validation of actual OpenSearch cluster infrastructure capabilities.
- Testing newly created feature domains unrelated to the deployment pipeline.

## Test Strategy & Environment
- **Unit/Integration**: Dedicated integration tests validating the custom Connect-RPC transport and swapping mechanisms inside the Data Adapter logic. E2E execution utilizing Vitest against the local SQLite database to confirm FTS5 matches vs standard OpenSearch outputs.
- **E2E Critical Path**: An automated E2E shell script validation verifying `tasker-standalone` launches correctly and dynamically serves the React SPA using embedded build outputs.
- **Data/Mocking Needs**: A clean ephemeral SQLite database configured for the test execution phase verifying initialization rules upon cold startup.

## Test Cases

### TC-001: Data Abstraction Layer Instantiation
- **Type**: Integration
- **Given**: The backend is configured for standard (MySQL) vs standalone (`bun:sqlite`) environments.
- **When**: The data application context initializes.
- **Then**: The system dynamically loads either `mysql2` or `bun:sqlite` Drizzle ORM drivers successfully based strictly on configuration flags.

### TC-002: SQLite Schema Migrations on Startup 
- **Type**: E2E
- **Given**: A newly compiled `tasker-standalone` binary is executed in a clean directory.
- **When**: The application launches.
- **Then**: A new `.sqlite` database file is automatically correctly created, and Drizzle migrations execute without errors establishing the initial table structures.

### TC-003: SQLite FTS5 Search Execution
- **Type**: Integration
- **Given**: The Data Abstraction layer is utilizing `bun:sqlite` and data is successfully inserted.
- **When**: A text search query targeting specific keywords is executed against the API.
- **Then**: The Data Abstraction layer translates the request natively into an SQLite FTS5 `MATCH` statement natively returning corresponding results.

### TC-004: In-Process Connect-RPC Overrides Network Stack
- **Type**: Integration
- **Given**: The `tasker-standalone` application is running.
- **When**: A frontend query or mutation via the Connect-RPC client is initiated.
- **Then**: The request executes via the custom in-process transport directly invoking the target handler and returns valid data without ever opening a TCP port.

### TC-005: Standalone Execution Asset Serving
- **Type**: E2E
- **Given**: The single-compiled binary is executed successfully.
- **When**: Evaluating localhost rendering.
- **Then**: The backend successfully serves the embedded Vite frontend asset files directly without reliance on external file systems.
