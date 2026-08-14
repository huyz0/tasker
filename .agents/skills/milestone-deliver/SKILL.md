---
name: milestone-deliver
description: Delivers the next unchecked task of a delivery milestone in .milestones/, then records progress and commits so a fresh session can resume. Use when implementing or continuing a milestone.
---

# Role
Delivery Engineer.

# Execution Mode
- **Interactive**: Confirm with `AskUserQuestion` before starting each task and before committing. Never check off a task without confirmation.
- **Autonomous (`-auto`)**: Implement, verify, record and commit each task without asking. Continue until the milestone is done, a task is blocked, or verification fails twice on the same task.

# Goal
Move a milestone toward `done` one task at a time, leaving the repository in a
state that any other session can resume from with no conversational context.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to resolve the milestones path and state file.
- ALWAYS read `.specs/standards/milestone-standard.md` before writing to any milestone file.
- MUST NOT start a milestone whose `depends_on` milestones are not all `status: done`. Report the blocking milestone and stop.
- MUST NOT check off a task (`- [x]`) until its **Verify** line has actually been executed and passed. Reporting an unverified task as done is forbidden.
- MUST NOT skip tests. Per `testing-standard.md`, code changes ship with tests; UI components ship with stories.
- MUST write the `PROGRESS.md` entry with status `in-progress` BEFORE making code changes, and update it to `done` in the same commit that completes the task.
- MUST leave the working tree clean at the end of every session. Partial work is committed with a `WIP` subject and an `in-progress` journal entry.
- MUST make one commit per task containing code, tests, the checked box, the journal entry, and the `STATE.md` update together.
- ALWAYS use Conventional Commits with the task id appended: `fix(iam): paginate listOrgMembers [M03-T06]`.
- NEVER renumber or delete a task id. To drop a task, mark it `- [~]` and record why in the journal.
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.

# Instructions

## Phase 1: Orient

1. **Resolve paths**: Read `.specs/product/work-ledger.yml` → `milestones.config.project_files`.
2. **Read state**: Read the state file (`.milestones/STATE.md`). Note `active_milestone`, `active_task`, `blocked`.
3. **Select the milestone**:
   - If the caller passed an id (e.g. `M03`), use it.
   - Otherwise use `active_milestone`.
4. **Check dependencies**: Read each `depends_on` milestone's frontmatter. If any is not `done`, stop and report which one blocks.
5. **Read the plan**: Read the milestone's `MILESTONE.md` in full — goal, exit criteria, task breakdown.
6. **Read the journal**: Read `PROGRESS.md` if it exists. If its last entry is `in-progress`, that task is the one in flight — resume it rather than starting a new one.

## Phase 2: Select the task

7. **Pick the target**: the in-flight task from step 6, or the first `- [ ]` task in document order.
8. **If no unchecked tasks remain**, go to Phase 5 (Close the milestone).
9. **Interactive only**: Ask the user to confirm the task, and whether they have file-path or approach constraints.

## Phase 3: Prepare

10. **Branch**: Ensure the current branch is `feature/m<NN>-<kebab-title>`. Create it from the default branch if it does not exist. Never commit directly to the default branch.
11. **Inject standards**: Invoke `standards-inject` selecting at most 2 standards relevant to this task's surface, chosen from `.specs/standards/index.yml`. Backend work reads `api-standard`; UI reads `frontend-standard` or `ui-ux-standard`; anything touching authorization reads `security-standard`.
12. **Open the journal**: Append an entry for this task to `PROGRESS.md` with `**Status**: in-progress`, today's date, and the intended approach in one sentence. Create `PROGRESS.md` from the template in `milestone-standard.md` if it does not exist.
13. **Update state**: Set `active_task` in `STATE.md` and set the milestone's `status` to `in-progress` and `started_at` if this is its first task.

## Phase 4: Deliver

14. **Implement** the task's stated outcome, touching the files it names. If the real change needs different files, that is fine — record the divergence in the journal entry.
15. **Write tests** covering the new behaviour, and stories for new UI components.
16. **Verify**: Execute the task's **Verify** line. If it is an observation rather than a command, perform it and state what was observed.
17. **On failure**: fix and re-verify. After two consecutive failures, stop: set `blocked: true` and `blocker` in `STATE.md`, mark the journal entry `blocked` with the failing output, commit, and report. Do not proceed to another task.
18. **Record**: Update the journal entry to `**Status**: done` with what changed, what was run, and the result. Check the task box `- [x]`. Update `STATE.md`'s ledger counts and `active_task` to the next task.
19. **Commit**: Stage the code, tests, `MILESTONE.md`, `PROGRESS.md` and `STATE.md` together. Commit with the conventional message and the task id.
    - Interactive: confirm the message with the user first.
20. **Continue**:
    - Interactive: ask whether to continue to the next task or stop.
    - Autonomous: return to Phase 2.

## Phase 5: Close the milestone

21. **Verify exit criteria**: Run the milestone's **Verification** block. Check each exit-criteria box only when its condition is demonstrably met. If any cannot be met, add a new task (next free id) describing the remaining work and return to Phase 2.
22. **Run local CI**: `moon check --all`. It must pass.
23. **Finalize**: Set `status: done`, `exit_criteria_met: true`, `completed_at` in `MILESTONE.md`. Update the ledger row in `STATE.md`, set `active_milestone` to the next milestone whose dependencies are now satisfied, and write a handoff note summarising what landed.
24. **Commit** with `chore(m<NN>): close milestone <NN> — <title>`.
25. **Report**: State what shipped, what the next milestone is, and the exact command to continue.

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

## Milestone closed
```
✓ MILESTONE M03 — IAM Correctness & Scale — DONE
  Tasks:    14/14
  Exit:     8/8 criteria verified
  Next:     M04 — Agent Identity & M2M Tokens
  Continue: /milestone-deliver M04
```
