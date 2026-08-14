---
description: Deliver a milestone autonomously - implement, verify, record, commit, repeat
argument-hint: "[milestone id, e.g. M01] (defaults to active_milestone)"
---

Read `.agents/skills/milestone-deliver/SKILL.md` and execute its instructions
exactly in **AUTONOMOUS** mode: do not ask questions. Implement, verify, record
and commit each task in sequence until the milestone closes or a task blocks.

Target milestone: $ARGUMENTS

If no milestone id was given above, use `active_milestone` from
`.milestones/STATE.md`.

Honour the skill's stopping rules: never check off a task whose **Verify** line
has not actually passed, and stop with `blocked: true` after two consecutive
verification failures on the same task rather than continuing.
