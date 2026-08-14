# Delivery Milestones

This directory holds the plan that takes Tasker to completion, and the
committed state of that work.

## Why this exists

Milestones describe **the state of the product**, and
they carry the progress record that lets a brand-new agent session — with no
memory of any prior conversation — pick up exactly where the last one stopped.
Everything needed to resume is a file in git.

## The three files

| File | Purpose |
|------|---------|
| `STATE.md` | The entry point. Which milestone and task are active, the ledger, the handoff notes. **Read this first.** |
| `MILESTONE-NN-*/MILESTONE.md` | The plan for one milestone: goal, exit criteria, task breakdown with stable ids. |
| `MILESTONE-NN-*/PROGRESS.md` | Append-only journal. One entry per task attempt, written *before* work starts and completed in the same commit. |

The format rules live in `.specs/standards/milestone-standard.md`.

## Commands

| Command | What it does |
|---------|--------------|
| `/milestone-status` | Where are we? Reads state, verifies it against the repo, reports drift. Cheap and read-only. |
| `/milestone-deliver [M0N]` | Deliver the next task, asking before each step. Defaults to the active milestone. |
| `/milestone-deliver-auto [M0N]` | Same, autonomously — implements, tests, commits, continues until the milestone is done or something blocks. |
| `/milestone-plan` | Add, split, re-scope or re-sequence milestones after new information. |

These are available in **Claude Code** (via `.claude/commands/`) and in
**Antigravity** (via `.agents/workflows/`). Both forward to the same playbooks
in `.agents/skills/` — see the Host Adapters section of `AGENTIC_SYSTEM.md`.
If a command is not offered by your host, check that the adapter file for that
host exists; the playbook itself is host-agnostic.

## The resume contract

Three rules make handoff work. The `milestone-deliver` skill enforces them:

1. **A task's commit contains everything about that task** — the code, the
   tests, the checked box, the journal entry, and the updated `STATE.md`.
   Never split them.
2. **The journal entry is written before the work starts**, with status
   `in-progress`. If a session dies mid-task, the next one reads the journal
   and knows precisely what was underway and why.
3. **A session never ends with a dirty working tree.** Uncommitted work is
   invisible to the next session, so partial work is committed as `WIP` with an
   `in-progress` journal entry rather than left on disk.

## Starting a fresh session

```
/milestone-status
```

That is the whole handoff. It reports the active milestone, the task in flight,
what the last session did, and what to run next.
