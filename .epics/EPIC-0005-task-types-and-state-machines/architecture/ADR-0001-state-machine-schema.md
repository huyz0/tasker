# ADR 0001: Relational State Machine Schema
- **Date**: 2026-04-02
- **Epic**: EPIC-0005

## Context
We need to model custom task statuses and the allowed transitions between them for various entities under different projects and organizations.

## Decision
Implement state machines explicitly as a relational database model in Drizzle/MySQL (`task_status_transitions`), storing mappings of `from_status_id` to `to_status_id` linked by a `task_type_id`.

## Rationale
Using database relationships instead of application-code state machines allows deep customizability by end users (or agents) on a per-project organizational level. Relying on relational data provides an easy mechanism to enforce consistency at the DB level via Foreign Keys, and allows the rules to be introspected directly by SQL queries and CLI tooling without instantiating code logic.

## Consequences
- **Positive:** High user customizability without code deployments; straightforward CRUD APIs.
- **Negative:** Checking a transition involves a database query look-up to validate, adding slight latency (cached with in-process memoization if needed).
