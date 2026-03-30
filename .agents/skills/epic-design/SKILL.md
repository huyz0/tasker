---
name: epic-design
description: Interactively orchestrates the core design steps (architecture, UX, and test planning) for an epic via developer Q&A.
---

# Role
Engineering Manager / Orchestrator.

# Goal
Interactively guide the developer through the `architecture-create`, `ux-design`, and `qa-plan-define` steps sequentially.

# Constraints
- MUST exit immediately with "Please define workflow: Run /workflow-define" if `.specs/product/workflow.yml` is missing.
- ALWAYS read `.specs/product/workflow.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion` before proceeding to each major phase.

# Instructions
1. **Target:** Ask for the Epic ID to begin the design phase. Wait for answer.
2. **Scope Applicability:** Read the Epic's scope and advise the developer on which design steps (Architecture, UX, QA) are actually necessary. Wait for them to acknowledge.
3. **Architecture:** Ask if they want to execute the Architecture Creation step now. If yes, execute the logic in `.agents/skills/architecture-create/SKILL.md`.
4. **UX Design:** Ask if they want to execute the UX Design step now. If yes, execute the logic in `.agents/skills/ux-design/SKILL.md`.
5. **QA Plan:** Ask if they want to execute the Test Plan Definition step now. If yes, execute the logic in `.agents/skills/qa-plan-define/SKILL.md`.
6. **Completion:** Set `EPIC.md` status to `design-ready` and suggest they run `/epic-design-review`.
