---
status: done
designs:
  architecture: n/a
  ux: completed
  qa_plan: completed
design_reviews:
  architecture: n/a
  ux: approved
  qa_plan: approved
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: n/a
created_at: 2026-04-05
---

# Core Application UI/UX Implementation

## Context & Objective
Tasker is designed to be the foundational task-and-knowledge infrastructure for autonomous AI and human collaboration. Currently, while the Bun backend logic and Connect-RPC TypeSpec contracts for core domains (Organizations, Projects, Tasks, Agents, Artifacts) are largely established, the graphical user interface (`apps/gui`) consists primarily of static `GenericPlaceholder` components. Additionally, the Go CLI lacks the commands corresponding to these advanced domains. 

The objective of this epic is to replace these placeholders with fully functional, end-to-end graphical user interfaces and equivalent CLI tooling. This will achieve MVP parity by enabling humans to monitor, intercept, and collaborate with AI Agents via real-time React web dashboards and terminal interfaces.

## Scope
### In Scope
- **GUI (Frontend)**: Real React components, TanStack Query integrations, and routing flows for:
    - Organizations & Members
    - Projects & Project Templates
    - Tasks (Kanban/List views, creation, assignment, comment threads)
    - Agents (Roles, instantiation, and capabilities configuration)
    - Artifacts (Nested folder browsing, creation, Markdown reading/writing)
    - Settings
- **Interactive Editors**: Implement React Flow for structural visualization (e.g. state machine transitions for Task Types).
- **CLI (Go)**: Implementation of missing dual-surface (Human TUI & Agent JSON) commands for `projects`, `tasks`, `agents`, and `artifacts`.
- **Testing**: Storybook stories for all new UI components and Vitest coverage.

### Out of Scope
- Backend schema rewrites or new Connect-RPC service additions (assume backend is functionally complete).
- External Repository Integrations (GitHub/Bitbucket) - Covered by `EPIC-0015-repository-integration-and-auth`.

## Dependencies
- `EPIC-0004-authentication-and-org-management` (Provides Auth token prerequisites).
- `EPIC-0005` to `EPIC-0014` (Provides the underlying Backend routing and Drizzle ORM handlers).

## Technical Approach
- **Frontend Architecture**: Enforce strict Container/Presentational design separated by Domain-Driven Design (DDD) boundaries (e.g., `apps/gui/src/features/Tasks`). 
- **State Management**: Utilize `@connectrpc/connect-query` combined with `@tanstack/react-query` for all server interactions. Strictly avoid `useEffect` for data fetching.
- **Styling**: strictly utilize Tailwind CSS referencing HSL semantic tokens defined in Shadcn. 
- **Storybook**: Document all new visual states in isolated `.stories.tsx` files.
- **CLI Design**: Construct Cobra commands integrating Charmbracelet UI for human discovery, and rigid JSON payloads handling for deterministic AI interaction.

## Definition of Done
- [x] No `GenericPlaceholder` components remain in the primary `App.tsx` router.
- [x] The CLI has working CRUD actions for `projects`, `tasks`, `agents`, and `artifacts`.
- [x] GUI implementations MUST be fully working end-to-end logic connected to the backend. Hardcoded mock states are strictly forbidden in production endpoints.
- [x] All new macroscopic layout segments have corresponding Storybook documentation.
- [x] Verified responsiveness matching the bounds `320px` to `desktop`.

## Task Breakdown
- [x] Scaffold `apps/gui/src/features` directories representing Bounded Contexts (Orgs, Projects, Tasks, Agents, Artifacts).
- [x] Implement UI: Organizations & Settings (manage orgs, list members, general UI layout).
- [x] Implement UI: Project Templates & Projects (wizards to instantiate projects from templates).
- [x] Implement UI: Tasks Workbench (List/Kanban views, task details, assignment logic, markdown rendering integration).
- [x] Implement UI: Agents (Define agent roles, configure system prompts, monitor active agent instances).
- [x] Implement UI: Artifacts (Navigate folder hierarchy, view/write markdown files).
- [x] Implement UI: React Flow visual graph for Task Type state transitions.
- [x] Update `apps/gui/src/App.tsx` routes to replace placeholders with production Container components.
- [x] Implement CLI: `projects` command group (list, get, create).
- [x] Implement CLI: `tasks` command group (list, assign, create).
- [x] Implement CLI: `agents` command group (roles listing, creation).
- [x] Implement CLI: `artifacts` command group (listing folders, reading items).
- [x] Generate comprehensive `.stories.tsx` for all developed GUI components.
