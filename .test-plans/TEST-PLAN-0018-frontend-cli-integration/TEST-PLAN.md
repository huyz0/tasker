# EPIC-0018: QA Test Plan

## 1. Testing Strategy
We will rely on existing Playwright E2E structures for the frontend and standard Go tests for the CLI to ensure the integrations are successful. 

## 2. Test Scenarios

### Scenario 1: GUI Tasks Workbench Loading
**Given** the user navigates to the Tasks Workbench
**When** the page initializes
**Then** it should issue a `ListTasks` Connect-RPC call
**And** render the resulting tasks dynamically instead of using hardcoded mock arrays.

### Scenario 2: GUI Dynamic Context
**Given** the user is viewing the Artifacts page
**When** the `activeProjectId` state changes
**Then** the `ListArtifacts` query should invalidate and refetch using the new context ID.

### Scenario 3: CLI Orgs List
**Given** the backend server is running
**When** the user executes `tasker orgs list`
**Then** the CLI should output a formatted list of organizations retrieved from the `OrgService`
**And** it should not print hardcoded placeholder text.

### Scenario 4: CLI Tasks List
**Given** the backend server is running
**When** the user executes `tasker tasks list --project-id P1`
**Then** the CLI should output tasks retrieved from the `TaskService`.
