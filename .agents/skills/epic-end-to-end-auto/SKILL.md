---
name: epic-end-to-end-auto
description: Autonomously carries an epic from definition to completion without user intervention. Orchestrates define, design, implement, and review phases sequentially, finalizing by marking the epic to done.
---

# Role
Autonomous Engineering Director & Executor.

# Goal
Execute the entire epic lifecycle autonomously given a topic or existing epic ID/path, without stopping for human reviews. This skill chains all core agentic workflows, resulting in a fully implemented, reviewed, and finalized epic.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask the user any questions. Run completely autonomously to completion.
- DO NOT stop for human review between phases. Treat the execution of `-auto` review skills as sufficient approval to proceed to the next stage. Bypass interactive user review checkpoints normally found in sub-skills.
- ALWAYS ensure the epic status is advanced properly and finalized as `done` (or `in-progress` with blockers documented explicitly if absolutely blocked).
- CRITICAL: DO NOT simulate or mock the implementation phase. You MUST generate, write, and execute genuine code. Checking off tasks without producing the corresponding functional code changes is strictly prohibited.

# Instructions
1. **Target Identification:** Accept epic topic (to define) or existing epic ID/path from the user.
2. **Define Phase:** 
   - If given a topic, execute `epic-define-auto` logic (refer to `.agents/skills/epic-define-auto/SKILL.md`).
   - Ensure the `EPIC.md` is generated and fully task-broken down.
3. **Design Phase:** 
   - Execute `epic-design-auto` logic (refer to `.agents/skills/epic-design-auto/SKILL.md`) for the defined epic.
   - Wait for Architecture, UX, and QA Plan generation to complete and populate.
4. **Design Review Phase:**
   - Execute `epic-design-review-auto` logic (`.agents/skills/epic-design-review-auto/SKILL.md`).
   - Automatically reconcile and fix any issues raised by the review without asking the user.
   - Set the epic's `status` to `design-ready` or `in-progress` depending on your determination.
5. **Implementation Phase:**
   - Execute the implementation sequence (`.agents/skills/epic-implement-auto/SKILL.md`).
   - **Crucial Deviation:** Bypass the interactive human review check. Assume automated approval from the Design Review Phase is granted.
   - Implement all tasks in the Task Breakdown, run tests, ensure local CI passes, and mark tasks as done (`- [x]`).
6. **Post-Implementation Review Phase:**
   - Execute `epic-implement-review-auto` logic (`.agents/skills/epic-implement-review-auto/SKILL.md`).
   - Automatically remediate any architecture mismatch, security flaw, or QA failure prior to finalizing.
7. **Finalization:**
   - Verify all epic frontmatter items (`designs`, `design_reviews`, `reviews`) reflect `completed`, `approved`, or `n/a` states.
   - Ensure all sub-tasks in `EPIC.md` are checked `- [x]`.
   - Update `EPIC.md` status to `done`.
8. **Summary Generation:**
   - Output an end-to-end delivery report summarizing the epic scope, artifacts created, task completion status, and CI/QA results.

# Output Format
## Completion Summary
```
✓ Epic EPIC-[id]-[title] end-to-end delivery complete.
  Status: done
  Phases executed: Define -> Design -> Design Review -> Implement -> Implement Review
  Tasks: [completed]/[total]
  Tests & CI: passing
```
