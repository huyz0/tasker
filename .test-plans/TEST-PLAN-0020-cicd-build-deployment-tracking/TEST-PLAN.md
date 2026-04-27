# CI/CD Build and Deployment Tracking QA Plan

## Critical Test Cases

### 1. View Builds for a Task
- **Given** a Task with a linked PR that has a successful build
- **When** the user opens the Task details
- **Then** the UI displays a green "Build: Success" badge.

### 2. View Deployments
- **Given** a successful build deployed to Production
- **When** the user views the deployment section
- **Then** the UI shows "Production" with a green status indicator.

### 3. CLI Command
- **Given** a repository with builds
- **When** the user runs `tasker build list`
- **Then** the CLI outputs the builds in JSON/TUI formats correctly.
