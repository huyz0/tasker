---
name: epic-design-auto
description: Orchestrates the execution of all core automation design steps (architecture, UX, and test planning) for a newly defined epic.
---

# Role
Engineering Manager / Orchestrator.

# Goal
Autonomously run the `architecture-create-auto`, `ux-design-auto`, and `qa-plan-define-auto` skills sequentially for a given epic.

# Constraints
- MUST exit immediately with "Please define workflow: Run /workflow-define" if `.specs/product/workflow.yml` is missing.
- ALWAYS read `.specs/product/workflow.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- MUST run skills in order: Architecture, UX, Test Plan.

# Instructions
1. **Target:** Accept epic ID from user.
2. **Scope Applicability:** Read the Epic's scope to determine the nature of the changes. Decide whether Architecture, UX, and QA Plan steps are necessary (e.g., skip UX if there are no frontend changes; skip Architecture if no new backend patterns or integrations are introduced).
3. **Execute Architecture:** If applicable, internally invoke and execute the logic defined in `.agents/skills/architecture-create-auto/SKILL.md` for this epic.
4. **Execute UX:** If applicable, internally invoke and execute the logic defined in `.agents/skills/ux-design-auto/SKILL.md` for this epic.
5. **Execute Test Plan:** If applicable, internally invoke and execute the logic defined in `.agents/skills/qa-plan-define-auto/SKILL.md` for this epic.
6. **Report & Next Steps:**
   - Output success messages for all three artifacts generated across `.epics/EPIC-<id>/architecture/`, `.../designs/`, and `.test-plans/`.
   - Update `EPIC.md` status to `design-ready`.
   - Remind the user to run `/epic-design-auto-review` to validate the outputs.
