# Closing a Milestone

Reached when no unchecked tasks remain. Everything here runs once.

## 1. Verify the exit criteria

Run the milestone's **Verification** block. Check an exit-criteria box only when
its condition is **demonstrably met** — the command ran, or the observation was
made and can be stated.

A criterion that cannot be met is not a criterion to soften. Add a new task at
the next free id describing exactly the remaining work, and return to task
delivery. The milestone stays open.

When a criterion can only be verified as configuration rather than as an observed
run, say so explicitly in the journal. That hedge is load-bearing: it is the
difference between "CI is configured to run this" and "CI ran this and passed",
and the gap between them is where defects hide.

## 2. Run local CI

`moon check --all`. It must pass. If it does not, the milestone is not done —
fix it as a new task, not as an uncommitted patch on the way out.

## 3. Finalize the files

- `MILESTONE.md`: `status: done`, `exit_criteria_met: true`, `completed_at: <today>`.
- `STATE.md`: update the milestone's ledger row to its final counts, set
  `active_milestone` to the next milestone whose `depends_on` are now all `done`,
  clear `active_task`, and refresh the task totals.
- `STATE.md` handoff note: what landed, what the next session must know that is
  not obvious from the code, and any follow-up the milestone deliberately
  deferred. Write for a session with no memory of this one — that is the only
  reader it will ever have.

## 4. Commit

```
chore(m<NN>): close milestone <NN> — <title>
```

One commit, carrying the milestone file, the journal, and the state update.

## 5. Report

```
✓ MILESTONE M03 — IAM Correctness & Scale — DONE
  Tasks:    14/14
  Exit:     8/8 criteria verified
  CI:       moon check --all — 24 tasks pass
  Next:     M04 — Agent Identity & M2M Tokens
  Continue: /milestone-deliver M04
```

State what shipped, what the next milestone is, and the exact command to continue.
