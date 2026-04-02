# QA Plan: Project Management E2E

## Scenarios
1. **Scenario: Create Template**
   - **Given** a valid `orgId`, `name`, and `description`,
   - **When** calling `createTemplate`,
   - **Then** the database must commit the entry exactly, and `domain.project_template.created` must be published.

2. **Scenario: Fetch Template**
   - **Given** a valid existing template `id`,
   - **When** fetching via `getTemplate`,
   - **Then** the exact matching structured template should be retrieved; else, it throws authentication/not-found error.

3. **Scenario: Create Project**
   - **Given** a valid template ID and owner ID,
   - **When** inserting via `createProject`,
   - **Then** it validates the template ID exists and generates the project record, broadcasting `domain.project.created`.

## Local Automation
- Integration tests have been defined inside `apps/backend/src/projects.test.ts` to assert end-to-end functionality utilizing Vitest against the built-in SQLite engine.
