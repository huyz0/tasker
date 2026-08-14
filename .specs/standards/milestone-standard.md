# Milestone Standard

A **milestone** answers "what state is the product in when this is done".
Milestones are the durable, git-committed plan that lets a fresh agent session
resume delivery with no conversational context — the thing a feature-shaped work
item never carried, and the reason milestones replaced the epic lifecycle in
August 2026.

## 1. Storage & Organization

- **Path**: `.milestones/` at project root (authoritative path resolved from
  `.specs/product/work-ledger.yml`).
- **Folder Format**: `MILESTONE-<2-digit-id>-<kebab-case-title>`
  (e.g. `MILESTONE-03-iam-correctness-and-scale`).
- **Files**:
  - `MILESTONE.md` — the plan. Goal, exit criteria, task breakdown.
  - `PROGRESS.md` — the journal. Created on first task, append-only.
- **Index**: `.milestones/STATE.md` is the single entry point for any agent
  resuming work. It MUST always reflect reality on `main`.

## 2. Metadata (YAML Frontmatter on `MILESTONE.md`)

Required:

- `id`: `M01`–`M99`.
- `title`: Human-readable name.
- `status`: `todo`, `in-progress`, `blocked`, `done`.
- `goal`: One sentence. The observable end state, not the activity.
- `depends_on`: List of milestone ids that MUST be `done` first (may be empty).
- `surfaces`: Which apps are touched — any of `backend`, `gui`, `cli`,
  `contract`, `infra`, `specs`.
- `exit_criteria_met`: `true` / `false`.
- `started_at` / `completed_at`: YYYY-MM-DD or `null`.

## 3. Structure of `MILESTONE.md`

### 1. Goal

One paragraph stating the end state in terms a non-implementer can verify.
A goal describes a *condition of the product*, never a list of activities.

### 2. Why Now

The dependency or value argument for this position in the sequence.

### 3. Exit Criteria

A checklist of externally verifiable conditions. Each item MUST be checkable
by running a command or performing an observable action. A milestone is
`done` only when every box is checked. Exit criteria are NOT the task list —
they are the acceptance test for the whole milestone.

### 4. Scope

- **In Scope**: Explicit inclusions.
- **Out of Scope**: Explicit exclusions, each naming the milestone that owns it.

### 5. Task Breakdown

Actionable `- [ ]` checklist. Every task MUST carry:

- A stable id `M<NN>-T<NN>` — referenced by commits and the progress journal.
- A single-sentence outcome.
- **Files**: the primary paths expected to change.
- **Verify**: the command or observation that proves it works.

Task ids are immutable once written. To drop a task, mark it
`- [~]` and record the reason in `PROGRESS.md`; never renumber.

### 6. Verification

The commands that prove the exit criteria, in order.

### 7. Risks

Known hazards and the rollback position.

## 4. Progress Journal (`PROGRESS.md`)

Append-only. Newest entry at the bottom. One entry per task attempt:

```markdown
## M03-T04 — Enforce viewer as read-only
- **Status**: done | in-progress | blocked
- **Date**: YYYY-MM-DD
- **Changed**: apps/backend/src/lib/authz.ts, 11 handler files
- **Verified**: `moon run backend:test` — 340 pass
- **Notes**: Chose a new assertOrgWriter over extending assertOrgMember so the
  existing read paths keep their cheaper single query.
- **Next**: M03-T05
```

An entry MUST be written with status `in-progress` *before* the work starts and
updated to `done` in the same commit that completes the task. This is what makes
an interrupted session recoverable: the journal always names the task in flight.

## 5. Version Control Protocol

- **Atomic commits**: one commit per task, containing the code, the tests, the
  checked-off box, the `PROGRESS.md` entry, and the `STATE.md` update.
- **Message**: Conventional Commits with the task id as a trailing tag —
  `fix(iam): paginate listOrgMembers [M03-T04]`.
- **Never end a session dirty**: uncommitted work is invisible to the next
  session. If a task cannot be completed, commit the partial work with status
  `in-progress` in the journal and a `WIP` prefix on the subject.
- **Branch**: `feature/m<NN>-<kebab-title>`, one per milestone, per
  `git-workflow-standard.md`.

## 6. Heavy Tasks

Most tasks are implemented directly. A task that needs a recorded decision, a UX
pass or a test plan before code follows
`.agents/skills/milestone-deliver/references/heavy-task.md`, which produces those
artifacts at the ledger's paths and runs a four-lens review before the box is
checked.

This replaced the epic lifecycle. An epic wrapped design artifacts *and* a second
copy of task tracking; the tracking already lives in `MILESTONE.md` and
`PROGRESS.md`, so only the artifacts and the gates were kept. Completed epics are
in `.archive/epics/`, and `.archive/EPICS-HISTORY.md` summarises them.
