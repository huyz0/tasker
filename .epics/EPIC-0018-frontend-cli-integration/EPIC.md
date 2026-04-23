---
status: done
designs:
  architecture: completed
  ux: completed
  qa_plan: completed
design_reviews:
  architecture: approved
  ux: approved
  qa_plan: approved
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: approved
created_at: 2026-04-23
---

# Frontend and CLI Integration Refactoring

## Context & Objective
A comprehensive review of the Tasker codebase revealed a gap between the fully implemented Connect-RPC backend API and the frontend/CLI layers. The React UI features (`TasksWorkbench`, `OrganizationsDashboard`, `AgentsDashboard`) and the Go CLI commands (`tasker tasks list`, `tasker orgs list`) currently use hardcoded mock data and variables instead of consuming the real API endpoints. The objective of this Epic is to replace these mocked interfaces by integrating `@tanstack/react-query` and Connect-RPC clients across the UI and CLI respectively.

## Scope
### In Scope
- Refactoring `TasksWorkbench`, `OrganizationsDashboard`, and `AgentsDashboard` React components to fetch data dynamically via Connect-RPC.
- Implementing global state or dynamic routing parameters to replace `MOCK_ORG_ID` and `MOCK_PROJECT_ID` in UI features.
- Connecting the Go CLI commands (`orgs list`, `tasks list`) to the backend via the generated Connect-RPC Go client.

### Out of Scope
- Backend database schema changes or new feature implementation in the API layer.
- Complete visual UI/UX overhauls (the focus is exclusively on data binding and replacing mocks).
- Replacing the `reactflow` visualizer for agents (can be a separate UX epic).

## Dependencies
- The backend Connect-RPC server must remain stable during the frontend integrations.
- Shared-contract generated bindings must be up-to-date in both React and Go client configurations.

## Technical Approach
To be determined during technical planning.

## Definition of Done
- [x] The `TasksWorkbench` dynamically loads tasks, statuses, and details from the backend without hardcoded task arrays.
- [x] The `OrganizationsDashboard` correctly fetches and renders team members from the backend `OrgService`.
- [x] The `AgentsDashboard` queries the `AgentService` to fetch running instances and their statuses.
- [x] The UI securely passes global state contexts (e.g., Active Project ID, Active Org ID) instead of mock constants.
- [x] Go CLI commands (`tasks`, `orgs`) perform genuine RPC calls to the backend and output real data.
- [x] Implementation MUST BE fully end-to-end working.

## Task Breakdown
- [x] Design dynamic context routing or global layout store for active project and org states.
- [x] Refactor `apps/gui/src/features/Tasks/index.tsx` to utilize `@tanstack/react-query` and `TaskService`.
- [x] Refactor `apps/gui/src/features/Organizations/index.tsx` to fetch data from `OrgService`.
- [x] Refactor `apps/gui/src/features/Agents/index.tsx` to bind data from `AgentService`.
- [x] Modify `apps/gui/src/features/Projects/index.tsx` and `Artifacts/index.tsx` to use the dynamic context rather than `MOCK_PROJECT_ID` / `MOCK_ORG_ID`.
- [x] Update `apps/cli/cmd/orgs.go` to remove mock output and call `OrgService`.
- [x] Update `apps/cli/cmd/tasks.go` to query `TaskService` and parse the RPC response into terminal output.
