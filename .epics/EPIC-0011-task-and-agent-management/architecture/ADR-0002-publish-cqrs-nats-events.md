# ADR 0002: Publish CQRS NATS Events for Created Entities
- **Date**: 2026-04-02
- **Epic**: EPIC-0011

## Context
As Agents autonomously create and modify Tasks at incredibly high rates, dashboard queries for Humans will stutter if directly hitting the transactional database concurrently with extreme mutation surges.

## Decision
Adopt a Command Query Responsibility Segregation (CQRS) flow. Mutators (e.g., `CreateTask`, `CreateAgent`) will commit to the primary store (Drizzle + MySQL) synchronously, then emit `TaskCreated` / `AgentCreated` events consistently to NATS.

## Rationale
Referencing `architecture.md`, this pattern safely decouples the synchronous API response from full-text-search syncing, audit logging, and downstream workflow triggers. It hardens performance characteristics explicitly for Agent scale.

## Consequences
- **Positive:** UI querying remains unimpacted by AI Agent write-surges. Extensible downstream ecosystem integrations.
- **Negative:** Slight delay (eventual consistency) on read-sides. Testing requires spinning up NATS or mocking the publisher.
