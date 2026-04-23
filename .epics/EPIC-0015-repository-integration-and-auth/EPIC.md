---
status: todo
designs:
  architecture: pending
  ux: pending
  qa_plan: pending
design_reviews:
  architecture: pending
  ux: pending
  qa_plan: pending
reviews:
  code: pending
  security: pending
  qa_implement: pending
  architecture_code: pending
created_at: 2026-04-23
title: Repository Integration and Auth
---

# Repository Integration and Auth

## Context & Objective
Tasker acts as the authoritative task-and-knowledge infrastructure for autonomous AI and human collaboration. Phase 1 (MVP) successfully delivered the core task management capabilities, internal commenting, and artifact systems. The system must now kick off Phase 2 of the product roadmap by integrating deeply with external version control platforms (GitHub and Bitbucket Cloud). 

This integration will explicitly grant read-only access to Pull Requests (PRs) and remote tasks/issues, allowing teams to link their internal Tasker projects to remote repositories. By bringing external VCS state directly into Tasker, AI agents will have full context on codebase deployments and PR statuses when processing their internal tickets, and human users can seamlessly track developments without toggling contexts.

## Scope
### In Scope
- **Repository Entities**: Implement Database and Domain logic to create and manage Repository records linked to Projects.
- **Provider Authentication**: Support OAuth handshakes granting Tasker read-only token authorization to GitHub and Bitbucket Cloud.
- **Pull Request Mapping**: Automatically sync and display remote PRs linked to specific Tasker Tasks.
- **API & RPC Integration**: Define new Connect-RPC service endpoints for Repository operations (`AddRepository`, `ListRepositories`, `SyncPullRequests`).
- **User Interface**: Implement React dashboard settings under "Projects" to configure the Repository links. Render linked PR statuses directly within the Task Workbench view.
- **CLI Commands**: CLI sub-commands to list and link external repositories (`tasker repo list`, `tasker repo link`).

### Out of Scope
- Creating or editing code automatically in external repositories. (We maintain Read-Only access in this phase).
- Webhook endpoints listening for remote pushed events (Polling or manual sync will be used initially).
- GitLab or SVN integrations (Strictly scoped to GitHub and Bitbucket Cloud per roadmap).

## Dependencies
- `EPIC-0004-authentication-and-org-management`: Used as the foundation for the secondary OAuth flow.
- `EPIC-0007-project-management-e2e`: Project linking constraints.

## Technical Approach
Following our Domain-Driven Design (DDD) principles, we will establish a `Repositories` Bounded Context. 
- **Backend (Bun/gRPC/TypeSpec)**: A new worker/schema handling periodic fetching of state via the provider's REST/GraphQL APIs based on configured tokens. Zod validation secures input inputs against Server-Side Request Forgery (SSRF) and credential exhaustion.
- **Auth**: The OAuth callback will securely store the access token against the Organization or Project utilizing AES encryption via SQLite/MySQL Drizzle interfaces.
- **Frontend (React)**: Integrate a seamless OAuth popup or redirection flow. Tasks assigned to a connected project will fetch and show live Remote PR status badges via TanStack Query. 
- **CLI**: Implements `--json` accessible and Terminal UI wrappers displaying PR integration states.

## Definition of Done
- [ ] Users can link an external GitHub or Bitbucket Cloud repository to a Project.
- [ ] Pull Requests mentioning a Tasker ID are retrieved and displayed on the Task details interface.
- [ ] Implementations MUST be fully working, end-to-end logic. Hardcoded mocked responses or fake data layers are strictly forbidden.
- [ ] API endpoints are fully secured against unauthorized cross-tenant data requests.
- [ ] All new backend handlers are thoroughly tested via Vitest with mocked external OAuth APIs.
- [ ] The CLI matches the web capabilities natively.

## Task Breakdown
- [ ] Scaffold `Repositories` bounded context in the backend and define Drizzle MySQL schema (`repositories`, `repository_links`).
- [ ] Define TypeSpec contracts and gRPC schemas for `Repositories`.
- [ ] Implement secure Provider OAuth callback handlers for GitHub and Bitbucket Cloud.
- [ ] Build CQRS commands for `CreateRepositoryLink` and `SyncTaskPullRequests`.
- [ ] Implement external HTTP fetchers to query remote GitHub/Bitbucket PR APIs.
- [ ] Create Storybook implementations for the `RepositorySettingsForm` and `PullRequestBadge` components.
- [ ] Integrate React TanStack Query hooks to consume new `Repositories` API in GUI.
- [ ] Implement CLI grouping for `repo` and corresponding Go integration functions.
- [ ] Write integration test coverage for the repository synchronization cycle.
