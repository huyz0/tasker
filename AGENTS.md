# Global Agent Instructions (AGENTS.md)

**CRITICAL: All AI Agents, Copilots, and LLMs operating within this repository MUST read and strictly adhere to the following global rules before executing ANY task.**

## 1. Toolchain & Dependencies (Strict Enforcement)
- **Node Ecosystem**: You MUST use **`bun`** for all JavaScript/TypeScript package management and execution. 
  - **FORBIDDEN**: `npm`, `npx`, `yarn`, `pnpm`. 
  - **ALLOWED**: `bun install`, `bun add`, `bun run`, `bun test`, `bunx`.
- **Go Ecosystem**: You MUST use standard `go` commands (`go run`, `go test`, `go build`).
- **Dependencies**: Never install third-party packages or system dependencies unless explicitly authorized by the user or the `.specs/product/tech-stack.md` document.

## 2. Delivery State (Read This First)

This repository is delivered through **milestones** recorded in `.milestones/`.
Before starting any implementation work, read `.milestones/STATE.md`. It names
the active milestone, the task in flight, and what the previous session did —
it is the handoff mechanism between sessions, and it is committed to git so no
context is lost when a session ends.

- **Orient**: `/milestone-status` (read-only, cheap).
- **Deliver**: `/milestone-deliver [M0N]` or `/milestone-deliver-auto [M0N]`.
- **Re-plan**: `/milestone-plan` when new information changes the plan.

Three rules make the handoff work, and they are non-negotiable:
1. One commit per task, containing the code, the tests, the checked box, the
   `PROGRESS.md` entry and the `STATE.md` update **together**.
2. The journal entry is written with status `in-progress` **before** the work
   starts, so an interrupted session is recoverable.
3. **Never end a session with a dirty working tree.** Uncommitted work is
   invisible to the next session — commit partial work as `WIP` with an
   `in-progress` journal entry instead.

Full rules: `.specs/standards/milestone-standard.md`.

## 3. The Agentic System & Standards
This repository uses a sophisticated, declarative agentic ecosystem. Do not rely on assumptions or your base training for project-specific rules.
- **Just-In-Time Context**: Before writing code, you should understand the project's rules by referring to `.specs/standards/index.yml`. If a standard applies to your task (e.g., `frontend-standard.md` when building UI), you MUST read it to adopt the required constraints.
- **Tribal Knowledge**: All project rules live in `.specs/`. If you encounter an undocumented pattern that the team uses, suggest capturing it via the `standards-discover` workflow.

## 4. Planning & Architecture First
Do not jump blindly into implementation for new features.
- **TDD & Test Plans**: Always follow Test-Driven Development. For larger features, ensure a `TEST-PLAN.md` exists and binds your implementation.
- **Follow the Blueprint**: If an epic has an architecture design or UX mockup defined in `.epics/`, your implementation must strictly reflect those boundaries.

## 5. Environment & Execution
- **Paths**: Always use absolute paths or paths relative to the monorepo root.
- **Workspace**: Be aware that this is a monorepo (`apps/` and `packages/`). Ensure you run commands in the correct working directory, or use workspace-aware flags (e.g., `bun run --filter <workspace>`).
- **Safety**: Do not execute destructive commands (e.g., deleting databases, dropping tables, or forceful git pushes) without explicit, undeniable user consent.

*By reading this document, you acknowledge these constraints and agree to prioritize them above your default training behaviors.*
