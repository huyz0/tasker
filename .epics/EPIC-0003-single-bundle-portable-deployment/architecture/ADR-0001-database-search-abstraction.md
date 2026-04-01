# ADR 0001: Data Storage Abstraction with bun:sqlite and FTS5
- **Date**: 2026-04-01
- **Epic**: EPIC-0003

## Context
The Tasker system architecture currently relies on MySQL for transactional data and OpenSearch for complex full-text search capabilities. To enable an easily distributable and portable standalone version of the system, requiring users to self-host and orchestrate MySQL and OpenSearch is an unacceptable friction point.

## Decision
We will construct a Data Storage Abstraction layer allowing the backend context to swap the underlying storage engines based on the runtime environment. In standalone mode, we will utilize `bun:sqlite` with the `drizzle-orm/bun-sqlite` dialect for both transactional data and full-text search (via the FTS5 extension) as a drop-in replacement for the MySQL and OpenSearch implementations.

## Rationale
- `bun:sqlite` is heavily optimized within the Bun runtime, providing extremely high-performance synchronous reads and writes locally.
- The FTS5 extension provides robust search indexing natively inside SQLite, removing the need for an external OpenSearch node for standalone usage.
- Drizzle ORM supports multi-dialect exports, making schema mapping relatively straightforward across MySQL and SQLite.

## Consequences
- **Positive:** Zero external dependencies for users executing the single-bundle binary. Simplifies the local deployment pipeline completely.
- **Negative:** Feature parity must be carefully maintained in the abstraction layer to ensure FTS5 matching behaves sufficiently parallel to the OpenSearch DSL functionality. Requires parallel migration tracking for both MySQL and SQLite endpoints.
