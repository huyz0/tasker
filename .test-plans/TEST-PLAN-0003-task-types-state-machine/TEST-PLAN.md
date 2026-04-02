---
status: draft
title: "Task Types & State Machines Management Validation"
epic_link: EPIC-0005
author: Auto
created_at: 2026-04-02
---

# Task Types & State Machines Management Validation

## Context & Objective
This test plan explicitly targets the core definitions and backend enforcement of dynamic Task Types, Statuses, and transition state machines.

## Scope of Testing
### In Scope
- Setup `task_types`, `task_statuses`, and `state_machine_rules`.
- Seed logic verifying default `Epic` and `Task` types.
- Strict Zod validation for State Machine transition rules.
- CLI commands for querying and executing transitions.

### Out of Scope
- Visual state machine editor validation via UI.
- Advanced condition-based (e.g., specific assignees needed) states.

## Test Strategy & Environment
- **Unit/Integration**: Database schemas generation, DB seeding validity, API Gateway rules and Connect-RPC endpoints for validating Zod pipeline.
- **E2E Critical Path**: Agent CLI invocation simulating human/agent testing transitions via JSON flags.

## Test Cases

### TC-001: Valid Transition Enforced
- **Type**: Integration
- **Given**: A task currently in `Todo` status and a rule allowing `Todo` -> `In Progress`.
- **When**: The backend receives a type status update command to transition to `In Progress`.
- **Then**: The validation succeeds, state is updated to `In Progress`, and `TaskStatusUpdated` is emitted.

### TC-002: Invalid Transition Rejected
- **Type**: Integration
- **Given**: A task currently in `Todo` status and no rule exists for `Todo` -> `Done`.
- **When**: The backend receives a transition request to `Done`.
- **Then**: Zod pipeline rejects it, and an HTTP Problem Detail error is returned preventing the db state update.

### TC-003: Fetching Allowed Valid Transitions
- **Type**: Integration
- **Given**: A CLI command `tasker type view [ID] --json`
- **When**: Fetched by agent
- **Then**: The backend accurately returns the current JSON schema of allowed outgoing transitions from a given status id.

### TC-004: Org and Project Level Separation
- **Type**: Unit
- **Given**: A project specific overridden transition configuration.
- **When**: Transitions are requested.
- **Then**: Project-level rules are respected over the generic org baseline defaults.
