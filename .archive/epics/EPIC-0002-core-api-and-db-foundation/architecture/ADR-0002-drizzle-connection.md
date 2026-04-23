# ADR 2: Modular Connection Pooling with Drizzle
- **Date**: 2026-03-30
- **Epic**: EPIC-0002

## Context
The Tasker application operates as a Modular Monolith in Bun, with future plans to extract specific high-load bound contexts independently into microservices. Implementing a massive, global database singleton across the entire monorepo risks cross-domain entanglement, hidden SQL relationship bleed, and makes future extraction efforts highly complex.

## Decision
We will utilize **Drizzle ORM** with explicitly bounded connection pools initialized uniquely per Domain Context (e.g., `apps/backend/src/health/db.ts`). Database access logic must remain strictly inside its module boundary and must never export schema definitions meant for internal transactional mutation.

## Rationale
Conforming to the Domain-Driven Design constraints specified in `architecture.md`, each module must maintain logical autonomy over its data layer. Drizzle allows localized, strongly-typed migrations via `drizzle-kit` ensuring changes locally in the "Health" domain don't accidentally trample the "Tasks" domain. By explicitly initializing smaller localized MySQL pools rather than a global singleton, we prove the module operates independently.

## Consequences
- **Positive:** Prevents "Spaghetti Database" syndrome; highly type-safe parameter validation thwarting SQL injection; facilitates immediate lift-and-shift extraction to Microservices when needed later.
- **Negative:** Slightly higher cumulative connection overhead on the MySQL database since Bun maintains parallel connection pools (one per context instance) instead of sharing a global pool; limits the ability to do massive `JOIN` operations across unassociated domains.
