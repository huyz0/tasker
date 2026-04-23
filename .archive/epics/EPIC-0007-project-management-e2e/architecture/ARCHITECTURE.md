# Architecture: Project Management E2E

## System Context
Implements the core Bounded Context for Projects and Project Templates in the `backend`. Exposes real data through the previously defined Connect-RPC controllers.

## Component Design
1. **API Endpoints**: Unchanged Connect-RPC structure in `index.ts`.
2. **Database Schema**: Utilizes `schema.mysql.ts` and `schema.sqlite.ts`.
3. **Database Client**: Drizzle ORM instantiated via `setupDatabase()`.
4. **Event Bus**: NATS injected globally to broadcast `domain.project.created` for downstream ingestion (CQRS syncing).

## Technical Approach
Using conditional schema selection at runtime depending on the `STANDALONE` environment variable to ensure native `bun:sqlite` support with FTS5. Data isolation relies on extracting `orgId` payload and injecting it into Drizzle validations.
