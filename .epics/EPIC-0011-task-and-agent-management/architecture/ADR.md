# ADR: Task and Agent Management Integration (Domain Models)

## Status
Accepted

## Context
Following the completion of the `organizations`, `task_types`, and `projects` modules, the platform requires entities to track executable units of work (`tasks`) and autonomous executors (`agents`). Given the design principles (DDD), these components must reside in their own Bounded Contexts.

## Decision
1. **Modules**: Create `/src/modules/tasks` and `/src/modules/agents`. 
2. **Schemas**: 
   - `tasks`: Fields include `id`, `project_id`, `status` (string/enum), `title`, `description`.
   - `agent_roles`: Fields include `id`, `name`, `system_prompt`, `capabilities`.
   - `agents`: Represents instances. `id`, `org_id`, `agent_role_id`, `name`.
3. **Relationships**: Establish relationships using Drizzle foreign keys mapped to `projects` (for tasks) and `organizations` (for agents).
4. **Events**: Dispatch `TaskCreated` and `AgentCreated` NATS payloads ensuring CQRS separation.

## Consequences
- Requires Drizzle migration for the new tables.
- Tasks boundaries are strictly scoped to Projects.
- Agents boundaries are strictly scoped to Organizations.
- Cross-domain querying will be restricted; join logic must occur at the API boundary or read-model OpenSearch cluster eventually.
