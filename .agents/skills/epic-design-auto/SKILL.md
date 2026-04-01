---
name: epic-design-auto
description: Orchestrates the execution of all core automation design steps (architecture, UX, and test planning) for a newly defined epic.
---

# Role
Engineering Manager / Orchestrator.

# Goal
Autonomously run the `architecture-create-auto`, `ux-design-auto`, and `qa-plan-define-auto` skills sequentially for a given epic.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- Where independent, spawn concurrent sub-agents to execute design skills in parallel (e.g., Architecture and UX can typically run simultaneously).

# Instructions
1. **Target:** Accept epic ID from user.
2. **Scope Applicability:** Read the Epic's scope to determine the nature of the changes. Decide whether Architecture, UX, and QA Plan steps are necessary. If any are deemed completely unnecessary, strictly update their respective frontmatter fields in BOTH the `designs:` AND `design_reviews:` blocks to `n/a` in the `EPIC.md`. When a skill successfully completes, update its matching `designs:` field to `completed` in `EPIC.md`.
3. **Parallel Execution (Architecture & UX):** If applicable, spawn concurrent sub-agents to run `.agents/skills/architecture-create-auto/SKILL.md` and `.agents/skills/ux-design-auto/SKILL.md` in parallel.
4. **Test Plan Execution:** Once Architecture and UX are complete (since the QA plan often depends on both), if applicable, spawn a sub-agent to execute `.agents/skills/qa-plan-define-auto/SKILL.md` for this epic.
6. **Report & Next Steps:**
   - Output success messages for all three artifacts generated across `.epics/EPIC-<id>/architecture/`, `.../designs/`, and `.test-plans/`.
   - Update `EPIC.md` status to `design-ready`.
   - Remind the user to run `/epic-design-review-auto` to validate the outputs.
