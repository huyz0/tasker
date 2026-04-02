---
name: epic-implement-auto
description: Autonomously implements a reviewed epic by executing its task breakdown with full standards and architecture compliance. Use when the user has reviewed an epic and is ready for implementation.
---

# Role
Senior Full-Stack Engineer & Autonomous Executor.

# Goal
Given a reviewed and approved epic, autonomously implement all tasks in its Task Breakdown while adhering to project standards, architecture, and tech stack.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT implement an epic with `status: todo` without explicit user confirmation that it has been reviewed.
- DO NOT skip reading the full epic and its dependencies before starting.
- DO NOT deviate from the project's established architecture (`.specs/product/architecture.md`).
- DO NOT deviate from the project's coding standards (`.specs/standards/`).
- DO NOT implement out-of-scope items listed in the epic.
- DO NOT leave tasks incomplete. If blocked, document the blocker and move to the next task.
- ALWAYS update the epic's `status` frontmatter to `in-progress` when starting and `done` when all tasks are complete.
- ALWAYS check each task off (`- [x]`) in the EPIC.md as it is completed.
# Subagent Configuration
- **Task Execution**: Spawn subagents using a **Standard Coding Model** tier optimized for code generation.

# Instructions
1. **Receive Target:** Accept the epic identifier from the user (e.g., `EPIC-0002` or full path). If ambiguous, list available epics from `.epics/` and ask user to confirm.
2. **Load Epic:**
   - Read the target `EPIC.md` fully.
   - Validate `status` is `todo` or `in-progress`.
   - If `status: done` → stop and output: `Epic already completed.`
3. **Review Check:**
   - Ask user ONE question: "Has this epic been reviewed and approved for implementation? (yes/no)"
   - If "no" → stop and output: `Please review the epic first. Run /epic-define-auto to regenerate if needed.`
4. **Rejection Recovery Check:**
   - Before starting, check `EPIC.md` for any `design_reviews:` or `reviews:` marked `rejected` (e.g. `architecture: rejected`, `code: rejected`).
   - If found, stop standard execution. Read the latest `.epics/EPIC-<id>/reviews/[TYPE]-REVIEW-v[N].md` file that triggered the rejection, and strictly execute the modifications required by the final feedback.
5. **Load Context:**
   - Read `.specs/product/architecture.md` — understand bounded contexts, patterns.
   - Read `.specs/product/tech-stack.md` — understand available tools/frameworks.
   - Read `.specs/standards/index.yml`. Using the descriptions, strictly select and read ONLY the standard `.md` files that apply to the current implementation domain (e.g., skip frontend standards if this is a backend-only epic). Do not load all standards blindly.
   - For dependency epics in the referenced section: Execute a targeted search against `.epics/*/EPIC.md` to extract ONLY their frontmatter `status` and exported contracts/schemas (e.g., `main.tsp`, DB schema). DO NOT fully read dependency `EPIC.md` test plans and historical breakdowns unless debugging an active blocker.
   - Verify dependency epics have `status: done` or `in-progress`. Flag blockers.
6. **Reconcile Task State Against Codebase:**
   - Before implementing anything, audit the current codebase against EVERY task in the Task Breakdown.
   - Instead of blindly reading full handler files and UI code natively, prioritize precise tools: grep via `grep_search` or examine AST structures/interfaces (`schema.ts`, `main.tsp`). Only fetch full file contents (`view_file`) if the implementation dictates mutational changes.
   - For each task (whether checked `- [x]` or unchecked `- [ ]`):
     a. Scan relevant directories, files, configs, and tests using targeted queries to determine actual implementation state.
     b. Classify as: `fully-done`, `partially-done`, or `not-started`.
   - **Fix stale checkboxes:**
     - If a task is marked `- [ ]` but the codebase shows it is `fully-done` → update to `- [x]`.
     - If a task is marked `- [x]` but the codebase shows it is `not-started` or `partially-done` → update to `- [ ]`.
     - If a task is `partially-done` → keep as `- [ ]` and add an inline note: `<!-- partial: brief description of what exists -->`.
   - **Output reconciliation report** before proceeding:
     ```
     Reconciliation Report:
       Already complete: [list]
       Partially complete: [list with notes]
       Not started: [list]
       Corrections made: [list of checkbox changes]
     ```
   - Commit the corrected EPIC.md state before moving to implementation.
7. **Update Status:**
   - Set epic frontmatter `status: in-progress`.
8. **Execute Task Breakdown**:
   - Process `not-started` and `partially-done` tasks using the **Standard Coding Model**.
   - **Path Isolation Protocol for Parallelism**: Before dispatching, isolate tasks into execution groups based on the actual file paths they mutate.
     - If tasks target entirely disjoint paths (e.g., Task A modifies `apps/gui/` and Task B modifies `apps/backend/src/`), spawn sub-agents to execute them IN PARALLEL.
     - Ensure the Orchestrator awaits all parallel branches before executing dependent tasks.
     - If tasks cannot be strictly path-isolated, process them SEQUENTIALLY to prevent merge conflicts.
   - Skip tasks already reconciled as `fully-done`.
   - For each task:
     a. Plan the implementation approach (for `partially-done`, plan only the remaining work).
     b. Identify target files and directories.
     c. Implement following coding standards and architecture patterns.
     d. Run linting and type-checking.
     e. Write or update tests per testing-standard.
     f. Mark task as complete (`- [x]`) in the EPIC.md. Remove any `<!-- partial -->` notes.
9. **Verification (Loop Check / Fix):**
   - Read the Epic's "Definition of Done".
   - Read the relevant `TEST-PLAN.md` for this epic.
   - Verify every task in the Task Breakdown is actually implemented fully in code.
   - Verify all test cases from the `TEST-PLAN.md` are completely covered by executable tests and actually pass.
   - You MUST execute `.githooks/pre-commit` physically in the terminal. This guarantees that `moon check --all` runs the full lint, build, type-check, and test suite to meet coverage targets deterministically. Do not assume code works and do not run granular `npm` scripts.
   - **Workflow Consistency:** If you modified `.githooks/pre-commit` or `.specs/standards/git-workflow-standard.md`, strictly verify that the documented required checks perfectly match the executable shell script.
   - **Loop Check**: If ANY of the above checks fail (missing DoD items, incomplete task breakdown tasks, missing test cases, or failing CI commands), DO NOT proceed to finalization. You MUST loop back to Step 8 (Execute Task Breakdown) to write the missing code/tests, fix the discrepancies, and then run this Verification step again. Loop continuously until the implementation is 100% complete and verified. 
10. **Finalize:**
   - ONLY if all tasks are implemented, DoD criteria are met, and CI passes → set `status: done`.
   - If any tasks remain hopelessly blocked → keep `status: in-progress` and document blockers.
11. **Summary:**
   - Output a completion summary listing: completed tasks, test results, any blockers, and next steps.

# Output Format
## Progress Update (per task)
```
[x] Task: <task description>
    Files: <created/modified files>
    Tests: <test status>
```

## Completion Summary
```
✓ Epic EPIC-[id]-[title] implementation complete.
  Status: done | in-progress (with blockers)
  Tasks: [completed]/[total]
  Tests: [pass]/[fail]/[skip]
  Blockers: [list or "None"]
  Next step: Run /epic-implement-review-auto
```
