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
- ALWAYS run relevant linting, type-checking, and tests after implementation.

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
   - Read `.specs/standards/index.yml` — identify applicable standards.
   - Read each applicable standard file for implementation rules.
   - Read dependency epics referenced in the epic's Dependencies section.
   - Verify dependency epics have `status: done` or `in-progress`. Flag blockers.
5. **Reconcile Task State Against Codebase:**
   - Before implementing anything, audit the current codebase against EVERY task in the Task Breakdown.
   - For each task (whether checked `- [x]` or unchecked `- [ ]`):
     a. Scan relevant directories, files, configs, and tests to determine actual implementation state.
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
6. **Update Status:**
   - Set epic frontmatter `status: in-progress`.
7. **Execute Task Breakdown:**
   - Process `not-started` and `partially-done` tasks. Where tasks are completely independent (e.g., disjoint backend vs frontend tasks), spawn concurrent sub-agents to implement them in parallel. Otherwise, process them sequentially to avoid merge conflicts.
   - Skip tasks already reconciled as `fully-done`.
   - For each task:
     a. Plan the implementation approach (for `partially-done`, plan only the remaining work).
     b. Identify target files and directories.
     c. Implement following coding standards and architecture patterns.
     d. Run linting and type-checking.
     e. Write or update tests per testing-standard.
     f. Mark task as complete (`- [x]`) in the EPIC.md. Remove any `<!-- partial -->` notes.
8. **Verification (Loop Check / Fix):**
   - Read the Epic's "Definition of Done".
   - Read the relevant `TEST-PLAN.md` for this epic.
   - Verify every task in the Task Breakdown is actually implemented fully in code.
   - Verify all test cases from the `TEST-PLAN.md` are completely covered by executable tests and actually pass.
   - You MUST run the full lint, type-check, and test suite physically in the terminal (e.g., `npx moon check --all`). Do not assume code works without running it.
   - **Workflow Consistency:** If you modified `.githooks/pre-commit` or `.specs/standards/git-workflow-standard.md`, strictly verify that the documented required checks perfectly match the executable shell script.
   - After local verification, you MUST execute the `.agents/skills/local-ci-run/SKILL.md` workflow to verify GitHub workflows pass locally.
   - **Loop Check**: If ANY of the above checks fail (missing DoD items, incomplete task breakdown tasks, missing test cases, or failing CI commands), DO NOT proceed to finalization. You MUST loop back to Step 7 (Execute Task Breakdown) to write the missing code/tests, fix the discrepancies, and then run this Verification step again. Loop continuously until the implementation is 100% complete and verified. 
9. **Finalize:**
   - ONLY if all tasks are implemented, DoD criteria are met, and CI passes → set `status: done`.
   - If any tasks remain hopelessly blocked → keep `status: in-progress` and document blockers.
10. **Summary:**
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
