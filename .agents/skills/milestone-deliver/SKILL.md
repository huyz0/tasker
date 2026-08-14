---
name: milestone-deliver
description: Delivers the next unchecked task of a delivery milestone in .milestones/, then records progress and commits so a fresh session can resume. Use when implementing or continuing a milestone.
---

# Role

Delivery Engineer.

# Modes

| Mode | Use |
|---|---|
| `interactive` | Default. Confirm before starting each task and before each commit. Never check off a task without confirmation. |
| `auto` | Implement, verify, record and commit each task without asking. Continue until the milestone is done, a task blocks, or verification fails twice on the same task. |

# Goal

Move a milestone toward `done` one task at a time, leaving the repository in a
state that any other session can resume from with no conversational context.

# Constraints

- Follow `@.agents/protocols/work-ledger.md` to resolve the milestones path and state file.
- Follow `@.agents/protocols/autonomy.md` and `@.agents/protocols/verification-gates.md`.
- ALWAYS read `.specs/standards/milestone-standard.md` before writing to any milestone file.
- MUST NOT start a milestone whose `depends_on` are not all `done`. Report the blocker and stop.
- MUST NOT check off a task until its **Verify** line has actually run and passed. Reporting an unverified task as done is forbidden.
- MUST NOT skip tests. Code ships with tests; UI components ship with stories.
- MUST write the journal entry `in-progress` BEFORE changing code, and update it to `done` in the commit that completes the task.
- MUST leave the tree clean at session end. Partial work is a `WIP` commit with an `in-progress` entry.
- MUST make one commit per task carrying code, tests, the checked box, the journal entry and the `STATE.md` update together.
- ALWAYS use Conventional Commits with the task id appended: `fix(iam): paginate listOrgMembers [M03-T06]`.
- NEVER renumber or delete a task id. To drop a task, mark it `- [~]` and record why in the journal.

# Instructions

## Phase 1: Orient

Steps are numbered across the whole skill so a journal entry can name one.

1. **Resolve paths** through `@.agents/protocols/work-ledger.md`.
2. **Read state**: the state file (`.milestones/STATE.md`). Note `active_milestone`, `active_task`, `blocked`.
3. **Select the milestone**: the id the caller passed, otherwise `active_milestone`.
4. **Check dependencies**: read each `depends_on` milestone's frontmatter. If any is not `done`, stop and report which one blocks.
5. **Read the plan**: the milestone's `MILESTONE.md` in full — goal, exit criteria, task breakdown.
6. **Read the journal**: `PROGRESS.md` if it exists. If its last entry is `in-progress`, that task is in flight — resume it rather than starting a new one.

## Phase 2: Select the task

7. **Pick the target**: the in-flight task from step 6, or the first `- [ ]` task in document order.
8. **If no unchecked tasks remain**, go to Phase 5.
9. **Interactive only**: confirm the task, and ask whether there are file-path or approach constraints.

## Phase 3: Prepare

10. **Branch**: ensure the current branch is `feature/m<NN>-<kebab-title>`, created from the default branch if absent. Never commit directly to the default branch.
11. **Inject standards**: at most 2, from the routing table in `AGENTS.md` §3. Do not read `index.yml` when the table answers it.
12. **Assess weight**: read `references/heavy-task.md` and decide whether this task needs a recorded decision, a UX pass or a test plan *before* code. Most do not. Record the decision either way — "no ADR, no alternative existed" is a useful sentence.
13. **Open the journal**: append an entry with `**Status**: in-progress`, today's date, and the intended approach in one sentence. Create `PROGRESS.md` from the template in `milestone-standard.md` if absent.
14. **Update state**: set `active_task` in `STATE.md`, and the milestone's `status` to `in-progress` with `started_at` if this is its first task.

## Phase 4: Deliver

15. **Design first if heavy**: produce the artifacts `references/heavy-task.md` calls for, at the ledger's paths, before writing code.
16. **Implement** the task's stated outcome, touching the files it names. If the real change needs different files, that is fine — record the divergence.
17. **Write tests** covering the new behaviour, and stories for new UI components. Follow `@.agents/protocols/tdd.md`: the failing test comes first.
18. **Verify**: execute the task's **Verify** line. If it is an observation rather than a command, perform it and state what was observed.
19. **Review if heavy**: run the four-lens pass in `references/heavy-task.md` and write the versioned review. A rejected review returns to step 16.
20. **On failure**: fix and re-verify. After two consecutive failures, stop: set `blocked: true` and `blocker` in `STATE.md`, mark the journal entry `blocked` with the failing output, commit, and report. Do not move to another task.
21. **Record**: update the journal entry to `**Status**: done` with what changed, what was run, and the result. Check the box `- [x]`. Update `STATE.md`'s ledger counts and `active_task`.
22. **Commit**: stage the code, tests, `MILESTONE.md`, `PROGRESS.md` and `STATE.md` together, with the conventional message and the task id. Interactive: confirm the message first.
23. **Continue**: interactive asks whether to go on; autonomous returns to Phase 2.

## Phase 5: Close the milestone

24. **Close it** by following `references/close-milestone.md`. It runs once per
    milestone, so read it only when there are no unchecked tasks left.

# Output Format

## Task completion

```
✓ [M03-T06] Paginate listOrgMembers
  Changed:  modules/orgs/orgs.handler.ts, db/query-builder.ts, orgs.test.ts
  Verified: moon run backend:test — 341 pass
  Commit:   fix(iam): paginate listOrgMembers [M03-T06]
  Progress: M03 — 6/14 tasks
  Next:     [M03-T07] Honour the page field in the contract
```

## Blocked

```
⚠ BLOCKED at [M03-T06]
  Failure:  <the actual failing output, not a paraphrase>
  Tried:    <what was attempted>
  Needs:    <the decision or access required>
  State:    committed; STATE.md marks blocked: true
  Resume:   /milestone-deliver M03 once resolved
```

The milestone-closed report is in `references/close-milestone.md`.
