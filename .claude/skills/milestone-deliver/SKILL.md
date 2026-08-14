---
name: milestone-deliver
description: Delivers the next unchecked task of a delivery milestone in .milestones/, verifies it, records progress in the journal, and commits so a fresh session can resume. Use when asked to deliver, continue, work on, or implement a milestone or its next task.
---

The full instructions live at `.agents/skills/milestone-deliver/SKILL.md` — the
portable, agent-agnostic source of truth for this repository.

Read that file and execute it exactly.

Default to INTERACTIVE mode (confirm before each task and each commit) unless
the caller explicitly asked for autonomous execution.

Non-negotiable rules from that skill:
- One commit per task, carrying code, tests, the checked box, the `PROGRESS.md`
  entry and the `STATE.md` update together.
- Write the journal entry with status `in-progress` BEFORE starting work.
- Never check off a task whose **Verify** line has not actually been run and passed.
- Never end a session with a dirty working tree.
