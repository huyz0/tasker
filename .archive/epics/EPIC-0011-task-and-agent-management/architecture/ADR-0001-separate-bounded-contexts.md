# ADR 0001: Separate Bounded Contexts for Tasks and Agents
- **Date**: 2026-04-02
- **Epic**: EPIC-0011

## Context
With the introduction of actual database integrations for `tasks` and `agents`, we need an architectural home for the handlers, queries, and mutators related to these entities. Tasker is growing beyond the god-class paradigm.

## Decision
Create distinct bounded contexts located in `apps/backend/src/modules/tasks/` and `apps/backend/src/modules/agents/`.

## Rationale
Adhering to Domain-Driven Design (DDD), this structure guarantees strong boundaries between differing domain responsibilities. As we prepare to scale to 20K AI Agents, decoupling the task progression logic from the agent system prompting logic ensures each can evolve and, if necessary, be cleanly extracted into independent microservices.

## Consequences
- **Positive:** Cleaner pull requests, explicit boundaries, no god-class mutations, aligned with the recent `src` modular directory structure.
- **Negative:** Increased initial scaffolding overhead. Service-to-service communication might need to leverage NATS rather than direct object references if boundaries tighten further.
