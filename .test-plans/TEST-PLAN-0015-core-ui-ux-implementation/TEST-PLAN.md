---
status: draft
title: "Core Application UI/UX Implementation Validation"
epic_link: EPIC-0016
author: Auto
created_at: 2026-04-06
---

# Core Application UI/UX Implementation Validation

## Context & Objective
This test plan explicitly validates EPIC-0016, which aims to replace static `GenericPlaceholder` components across the `apps/gui` React application with full-featured UI layouts integrating live backend connections via TanStack Query. It also validates the missing Go CLI commands providing dual-surface human and agent interactions.

## Scope of Testing
### In Scope
- GUI (Frontend): React components, TanStack Query integrations, and routing flows for Organizations, Projects, Tasks, Agents, and Artifacts.
- Interactive Editors: React Flow for state machine transitions.
- CLI (Go): Missing dual-surface commands for projects, tasks, agents, and artifacts.
- Testing: Storybook stories for UI components and Vitest coverage.

### Out of Scope
- Backend schema rewrites or new Connect-RPC service additions.
- External Repository Integrations (GitHub/Bitbucket) - Covered by EPIC-0015.

## Test Strategy & Environment
- **Unit/Integration**: CLI parsing, command flags logic, and frontend utility hooks (Vitest, Go tests).
- **E2E Critical Path**: Playwright automation covering major browser navigation flows (Login -> Project -> Task -> Agent).
- **Data/Mocking Needs**: A live or deeply mocked Bun backend providing standard responses for Orgs, Projects, Tasks, and Agents to prevent test flakiness.

## Test Cases

### TC-001: GUI Navigation - Organizations
- **Type**: E2E
- **Given**: A logged-in human user on the initial dashboard.
- **When**: The user clicks "Organizations" in the sidebar.
- **Then**: The system navigates to `/organizations`, replaces the generic placeholder, and displays a populated list of team members and organization settings.

### TC-002: GUI Navigation - Fallback State
- **Type**: E2E
- **Given**: A logged-in user with network disconnected.
- **When**: The user attempts to load the Organizations view.
- **Then**: TanStack Query gracefully catches the error, displaying a Shadcn error state rather than a blank screen or unhandled generic placeholder.

### TC-003: Project Creation Flow (Happy Path)
- **Type**: E2E
- **Given**: The user is viewing the "Projects" wizard.
- **When**: The user selects the "Software Development" template and clicks "Use Template", proceeding through the creation step.
- **Then**: A new project is created via the backend API, and the UI redirects to the new project's dashboard.

### TC-004: Tasks Kanban Board - Manipulation
- **Type**: E2E
- **Given**: A project containing at least one task in the "Todo" column.
- **When**: The user drags a task card from "Todo" to "In Progress".
- **Then**: The UI updates optimistically, a backend mutation is dispatched, and the task detail slide-panel remains functional if clicked.

### TC-005: React Flow Visualization
- **Type**: E2E / Visual Regression
- **Given**: The user views an Agent mapped to a specific workflow definition.
- **When**: The "Agents" dashboard loads the state machine flow.
- **Then**: React flow renders nodes without console errors, and the active state is visually highlighted according to the backend status.

### TC-006: CLI - Artifacts command
- **Type**: Integration
- **Given**: A valid Go CLI binary and a running backend.
- **When**: The user executes `cli artifacts list --project <id>`.
- **Then**: The terminal outputs a structured TUI list or a strict JSON array (if `--json` is supplied) of the artifacts.

### TC-007: CLI - Agent predictability via strict JSON
- **Type**: Integration
- **Given**: An agent executing a CLI command.
- **When**: The agent executes `cli projects create --json --title "foo"` specifying random unsupported flags.
- **Then**: The CLI rejects the invalid flags with a hard error before contacting the backend, neutralizing hallucinations.

### TC-008: Storybook Completeness
- **Type**: Unit / Visual
- **Given**: The frontend repository.
- **When**: `npm run storybook:build` or `chromatic` is executed.
- **Then**: Distinct stories exist and render successfully without errors for `Organizations`, `Project Wizard`, `Tasks Kanban`, `Agents Dashboard`, and `Artifacts Browser`.
