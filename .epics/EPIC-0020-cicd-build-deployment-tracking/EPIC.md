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
created_at: 2026-04-27
---

# CI/CD Build and Deployment Tracking

## Context & Objective
Following the successful integration of external repositories (EPIC-0015), the system must now track CI/CD builds and deployments at the repository level. This capability is critical for completing Phase 2 of the product roadmap, providing AI agents and human users with real-time visibility into the status of code changes. By surfacing build and deployment metrics directly within the Tasker interface, teams can monitor the full software delivery lifecycle without disruptive context switching.

## Scope
### In Scope
- ConnectRPC endpoints for tracking build statuses (Pending, Success, Failure) and deployment environments (Staging, Production).
- Stateless API Proxy to fetch real-time CI/CD data directly from GitHub Actions and Bitbucket Pipelines using existing OAuth tokens.
- Frontend React components to display build and deployment statuses on Task and Project pages.
- CLI commands to query build and deployment statuses seamlessly.

### Out of Scope
- Triggering, restarting, or modifying external CI/CD pipelines (Read-only access is maintained in this phase).
- Integrations with third-party CI/CD tools outside of GitHub Actions and Bitbucket Pipelines (e.g., Jenkins, GitLab CI).

## Dependencies
- External Repository Integration (EPIC-0015) infrastructure.

## Technical Approach
Stateless Proxy Architecture. No database tables will be created for builds or deployments. The backend will use stored OAuth tokens from `repository_links` to query GitHub/Bitbucket APIs on-the-fly when requested by the frontend, mapping the JSON responses into our ConnectRPC Protobuf formats.

## Definition of Done
- [x] ConnectRPC API endpoints for listing and viewing build and deployment statuses are implemented and tested.
- [x] Backend stateless proxy reliably fetches and standardizes payload data from external CI/CD APIs without persistence.
- [x] The React frontend (using TanStack Query) displays real-time build and deployment indicators accurately on Task and Project dashboards.
- [x] The CLI supports querying build and deployment statuses via dedicated commands in both Human and Agent (JSON) modes.
- [x] Implementations MUST be fully working, end-to-end logic. Hardcoded mocked responses or fake data layers are strictly forbidden.

## Task Breakdown
- [x] Define TypeSpec contracts for Build and Deployment entities.
- [x] Implement backend gRPC handlers (`BuildService` / `DeploymentService`).
- [x] Implement stateless API fetchers (acting as a proxy) for GitHub Actions and Bitbucket Pipelines.
- [x] Build React UI components for deployment badges and build logs.
- [x] Integrate React TanStack Query hooks to consume the new API.
- [x] Update the CLI to include build and deployment querying capabilities.
- [x] Write integration and E2E tests for the new features.
