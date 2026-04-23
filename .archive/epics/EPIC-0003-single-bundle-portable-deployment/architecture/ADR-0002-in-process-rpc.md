# ADR 0002: In-Process Connect-RPC Transport for Standalone Mode
- **Date**: 2026-04-01
- **Epic**: EPIC-0003

## Context
When running as a single-bundle binary consisting of the frontend and backend, forcing the frontend API client within the standalone process to execute network-based logic via mapped localhost HTTP requests adds unnecessary overhead and potential port-conflict issues.

## Decision
We will implement a custom Connect-RPC transport that bypasses `Bun.serve` and HTTP network interfaces, and instead routes Connect-RPC commands directly into strictly typed, in-process function invocations of the backend handlers.

## Rationale
- Connect-RPC provides a well-defined protocol capability that allows us to specify custom transports beyond the baseline Fetch/HTTP transports.
- This maintains completely identical message contract validation enforced by TypeSpec/Connect-RPC without altering the core business logic.
- Eliminates potential host machine issues with opening specific ports and limits latency footprint strictly to in-memory serialization and logic handling.

## Consequences
- **Positive:** Zero port configuration is needed, avoiding "port already in use" issues locally. Maximizes execution speed by cutting out network stacks.
- **Negative:** Transport implementation must meticulously handle errors, status codes, and context mapping to ensure perfectly identical behavior as the standard gRPC/HTTP transports for the developers avoiding conditional UI logic.
