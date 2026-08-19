---
name: handoff-task
description: Record what you tried, what's blocked, and the concrete next step before your claim on a task ends, so whoever picks it up next - human or another agent - doesn't start from zero. Use whenever your session on a task is ending unfinished, your claim is about to be lost or reassigned, or you're stopping work on a task without having completed it.
---

# Role

Worker agent driving a Tasker task through the `tasker` CLI.

# Goal

Record a handoff note (M22, ADR-0017) before ending work on a task that
isn't done, so the next claimant - agent or human - gets the continuity a
locally-running session already has for free from its own disk, and
doesn't have to rediscover what you already tried. This does not modify
the codebase - it only writes one task note via the `tasker tasks` CLI.

# Constraints

- Every write is explicit. There is no background process that captures
  a handoff for you - if this skill isn't invoked before you stop,
  nothing is recorded and the next claimant starts from zero.
- A handoff note is task-scoped, ephemeral **execution state** - what you
  tried, what's blocked, what's next, for *this task specifically*. It is
  not durable knowledge (that belongs to the `capture-belief` skill
  instead) and not a routine status update (that's a plain `tasker tasks
  note-add` / `comment-add`, without `--type handoff`). If what you
  learned would still be true and useful after this task closes, run
  `capture-belief` too - the two are not mutually exclusive.
- Only an agent may record a handoff note. `createTaskNote` denies a
  human caller outright, unchanged by this milestone (ADR-0017) - the
  problem a handoff note solves (no local disk to fall back on) is a
  cloud agent's problem, not a human's, so this restriction is
  deliberate, not an oversight to route around.
- Never invent what you tried or why something is blocked. Describe your
  actual state, not a guess at what a reader wants to hear.

# Instructions

## Step 1: Recognize the moment

Ask this as your session winds down, not only when explicitly told to
stop. Triggers: the task is genuinely unfinished and you are about to
lose your claim (session ending, about to be reassigned, hitting a wall
you can't resolve this session); you are intentionally pausing on a task
with real partial progress worth preserving. Finished the task and
closed it out cleanly? Skip this skill - there's nothing to hand off.

## Step 2: Write the handoff note

```bash
tasker tasks note-add <task-id> --type handoff --content "\
Current understanding: <what you now believe is true about this task>. \
Tried: <what you attempted and why it didn't fully work>. \
Blocked on: <the specific obstacle, or 'nothing - just out of time'>. \
Next step: <the concrete action the next claimant should take first>."
```

Name the specific thing at each point - "the migration fails against
MySQL with a foreign-key error on `task_notes`" reads and resumes
correctly; "ran into some issues" does not. If a relevant belief already
exists (or one is worth recording from what you just learned), cite its
id or run `capture-belief` alongside this.

## Step 3: Leave your claim, if you still hold it

A handoff note does not itself release your claim. If you are stepping
away rather than being reassigned, say so in a task comment
(`tasker tasks comment-add`) or use `tasker tasks unassign` if a human
should pick the next claimant - `unassignTask` is human-only by design
(ADR-0008), so an agent names this in a comment rather than doing it
itself.

## Step 4: Never do this as an agent

Reassigning the task to someone specific, or forcing a particular next
claimant, is a human decision - `assignTask`/`unassignTask` have no
agent-token form. Say what should happen next in the note or a comment;
don't attempt to route around the refusal.

# Output Format

After acting, state plainly, in one or two sentences:

- **Recorded**: the task id and a one-line summary of what the handoff
  note says (`task-42: blocked on flaky MySQL migration test, next is
  rerunning with --verbose`).
- **Skipped**: why - the task was actually finished, or nothing new
  happened this session worth preserving.

Never claim a write happened without running the command and seeing its
success output - report a failed or skipped call as such, not as done.

# Worked example

Mid-task, you've spent the session on a migration that still fails
against live MySQL and you're out of time this session:

```bash
tasker tasks note-add task-891 --type handoff --content "\
Current understanding: the note_type column migration applies cleanly on \
SQLite but fails on MySQL with a foreign-key constraint error. Tried: \
reordering the ALTER TABLE statements, no change. Blocked on: haven't \
isolated which existing row violates the new constraint - the error \
message doesn't name it. Next step: run the migration against a copy of \
the seeded dev DB with binary log tracing on to find the offending row."
```

# See also

- `docs/agent-integration.md` §10 - the same guidance for an agent
  driving the CLI directly, outside a skill-aware harness.
- `.agents/skills/capture-belief/SKILL.md` - the sibling skill for
  durable, cross-task knowledge; not what this skill is for.
- `.specs/adr/ADR-0017-handoff-notes-are-a-typed-tasknote-distinction.md`
  - the design decision behind task handoff notes.
