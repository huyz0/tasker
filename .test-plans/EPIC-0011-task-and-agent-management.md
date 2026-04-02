# Test Plan: EPIC-0011 Task and Agent Management

## Suite
Integration & Unit Tests (Backend Bun + Drizzle)

## Test Cases

### 1. Agent Management
- **Given** an authenticated user within an organization
- **When** calling `AgentService.createAgentRole` and `createAgent`
- **Then** the database successfully inserts the records
- **And** NATS emits an `AgentCreated` event
- **And** the endpoints return the created schemas with correct relationships

### 2. Task Management
- **Given** an authenticated user with a valid `projectId`
- **When** calling `TaskService.createTask` with a valid subset payload
- **Then** the record is persisted under the target project
- **And** the status falls back to defaults if unprovided
- **And** NATS emits a `TaskCreated` event

### 3. Tenant Boundary Verification
- **Given** a cross-tenant user query attempt
- **When** attempting to fetch a task or agent outside their token's `orgId`
- **Then** the `getTask` or `getAgent` query filters perfectly and returns an error or null.

## Strategy
Maintain >80% coverage on `bun test` by strictly placing testing logics inside `agents.test.ts` and `tasks.test.ts`. Use the in-memory SQLite setup established in `test/setup.ts`.
