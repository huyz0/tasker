---
name: milestone-plan
description: Creates, splits, re-scopes or re-sequences delivery milestones in .milestones/, keeping STATE.md and the roadmap consistent. Use when new information changes the delivery plan, or when asked to add, split, reorder or re-scope a milestone.
---

The full instructions live at `.agents/skills/milestone-plan/SKILL.md` — the
portable, agent-agnostic source of truth for this repository.

Read that file and execute it exactly.

Key invariants: never renumber an existing milestone or task id, never modify a
milestone already marked `done`, and commit the planning change alone without
touching source files.
