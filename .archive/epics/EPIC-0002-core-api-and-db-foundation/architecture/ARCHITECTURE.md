---
epic: EPIC-0002
title: "Architecture Design — Core API & Database Foundation"
status: draft
created_at: 2026-03-30
---

# Architecture Design — Core API & Database Foundation

## System Context & Approach
This epic introduces the core data plumbing linking the Tasker CLI, React GUI, and Bun backend in the bounded `Health` context, acting as a vertical slice tracer bullet to validate our communication stack.

## Key Component Changes
- **API (TypeSpec):** Defines the `HealthService` with a `ping()` method inside `packages/shared-contract`, emitting strictly typed `.ts` and `.go` Connect-RPC clients.
- **Database (MySQL/Drizzle):** Establishes the `apps/backend/db` connection pool and sets up the foundational `schema_migrations_test` to verify drizzle-kit connectivity against a local `docker-compose` MySQL edge.
- **Messaging (NATS):** Out of scope for this foundation slice.
- **Search (OpenSearch):** Out of scope.

## Data Flow Diagram
```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant GUI
    participant API Gateway (Bun)
    participant Database (MySQL)

    User->>CLI: Run `npx cli ping`
    CLI->>API Gateway (Bun): gRPC/Connect `ping()`
    API Gateway (Bun)->>Database (MySQL): SELECT 1
    Database (MySQL)-->>API Gateway (Bun): Ok
    API Gateway (Bun)-->>CLI: Ok
    CLI-->>User: Outputs Healthy Status

    User->>GUI: Load Web App Dashboard
    GUI->>API Gateway (Bun): TanStack Query hooks `ping()`
    API Gateway (Bun)->>Database (MySQL): SELECT 1
    Database (MySQL)-->>API Gateway (Bun): Ok
    API Gateway (Bun)-->>GUI: Ok
    GUI-->>User: Renders Green Health Indicator
```

## Architecture Decision Records (ADRs)
- [ADR-0001: Adopting Connect-RPC over Standard REST](ADR-0001-connect-rpc.md)
- [ADR-0002: Modular Connection Pooling with Drizzle](ADR-0002-drizzle-connection.md)

## Migration & Deployment Impact
Requires DevOps/local developers to spin up a basic MySQL 8.x Docker container mapping port `3306` before running integration tests.
