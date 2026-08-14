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

## 3. The Agent Harness & Standards

This repository uses a declarative agentic ecosystem. Do not rely on assumptions or your base training for project-specific rules.

- **Just-In-Time Context**: load at most **two** standards, chosen from the table below, before writing code. The table is here rather than in a skill so routing costs nothing — you do not need to read `index.yml`, and you do not need to invoke anything. Use `/context-inject` only when the surface is genuinely ambiguous. Loading everything degrades compliance rather than improving it.

  | You are touching | Read |
  |---|---|
  | `apps/backend/**` handlers, RPC, DB | `api-standard`, `observability-standard` |
  | `apps/gui/**` components, layout | `frontend-standard`, `ui-ux-standard` |
  | `apps/cli/**` | `coding-standard` |
  | anything authz, tenancy, tokens, secrets | `security-standard` (always one of the two) |
  | tests, fixtures, coverage | `testing-standard`, `ui-testing-standard` |
  | `packages/shared-contract/**`, TypeSpec | `api-standard` |
  | commits, branches, PRs | `git-workflow-standard` |
  | `.milestones/**` | `milestone-standard` |
  | `package.json`, `go.mod`, lockfiles | `dependency-standard` |
  | `.agents/**` | `.agents/protocols/skill-authoring.md` |
  | implementing anything at all | `.agents/protocols/tdd.md` (always, and it does not count toward the two) |

  Everything lives in `.specs/standards/<id>.md`. If nothing in the table matches, the task probably needs no standard — do not load one to feel thorough.

- **Scope what you load.** Relevance is per *task*, not per session or per repository:
  - **Task**: two standards, dropped when the task ends. A standard loaded for the previous task does not bind the next one — re-select.
  - **Session**: only `AGENTS.md` and `.milestones/STATE.md` persist. Do not accumulate.
  - **Subagent**: give it *paths*, never pasted content, and only the protocols its own job needs. A subagent has its own context window; filling it from yours wastes both.
- **Tribal Knowledge**: All project rules live in `.specs/`. If you encounter an undocumented pattern the team relies on, capture it via `/standards-manage`.
- **The harness itself** lives in `.agents/` — skills, thin workflow forwarders, and the shared protocols in `.agents/protocols/`. `.claude/` is **generated** from it; never hand-edit that directory. Run `/skill-forge` to add, compress, audit or re-sync anything in the harness. Full map: `AGENTIC_SYSTEM.md`.
- **Response style**: follow `.agents/protocols/response-style.md` by default — compressed text, full accuracy, plain English for anything destructive or ambiguous. The user can cancel it with "normal mode".

## 4. Planning & Architecture First

Do not jump blindly into implementation for new features.

- **TDD**: the failing test comes first, always. Full rules: `.agents/protocols/tdd.md`. For a task that needs a design before code, `.agents/skills/milestone-deliver/references/heavy-task.md` says what to produce and what gate it passes.
- **Follow the Blueprint**: if a decision is recorded in `.specs/adr/` or a UX design exists for the milestone, the implementation reflects those boundaries. Deviating is allowed; deviating silently is not.

## 5. Environment & Execution

- **Paths**: Always use absolute paths or paths relative to the monorepo root.
- **Workspace**: Be aware that this is a monorepo (`apps/` and `packages/`). Ensure you run commands in the correct working directory, or use workspace-aware flags (e.g., `bun run --filter <workspace>`).
- **Safety**: Do not execute destructive commands (e.g., deleting databases, dropping tables, or forceful git pushes) without explicit, undeniable user consent.

*By reading this document, you acknowledge these constraints and agree to prioritize them above your default training behaviors.*
