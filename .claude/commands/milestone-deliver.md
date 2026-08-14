---
description: Deliver the next task of a milestone, with confirmation before each step
argument-hint: "[milestone id, e.g. M01] (defaults to active_milestone)"
---

Read `.agents/skills/milestone-deliver/SKILL.md` and execute its instructions
exactly in **INTERACTIVE** mode: use AskUserQuestion to confirm before starting
each task and before each commit. Never check off a task without confirmation.

Target milestone: $ARGUMENTS

If no milestone id was given above, use `active_milestone` from
`.milestones/STATE.md`.
