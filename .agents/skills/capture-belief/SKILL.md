---
name: capture-belief
description: Record durable facts, conventions, and gotchas discovered while working a Tasker task into shared memory, so the next agent or person doesn't have to rediscover them. Use whenever you learn something about a project that would still be true and useful after this task closes.
---

# Role

Worker agent driving a Tasker task through the `tasker` CLI.

# Goal

Capture a durable fact into Tasker's shared memory (M21, ADR-0014) when you
learn one worth keeping past this task, and search shared memory before
duplicating work someone already did or re-learning something already known.
This does not modify the codebase — it only writes to the belief store via
the `tasker memory` CLI.

# Constraints

- Every write is explicit. There is no background process that captures
  beliefs for you — if this skill isn't invoked, nothing is recorded.
- A belief **outlives this task** — a convention, a gotcha, a decision and
  its reasoning, a fact about how the system behaves. It is not a task
  update or status note; those belong in `tasker tasks note-add` /
  `tasker tasks comment-add`, which already exist for exactly that.
- Record at **project scope** by default (`tasker memory record`'s own
  default). Never promote a belief yourself: `memory:admin` has no
  agent-token form at all (ADR-0015), and `tasker memory promote` fails with
  `permission_denied` for a token, not just discourages it. If a belief
  looks like it applies beyond this project, say so in the statement itself
  and let a person promote it.
- Search before recording. A near-duplicate belief fragments the one place
  a fact should live. Prefer `tasker memory supersede` (if an existing
  belief is now wrong or imprecise) or `tasker memory relate` (if it's a
  related-but-distinct fact) over recording a fresh, disconnected entry.
- Never invent a source link. Only pass `--source-task`/`--source-comment`/
  `--source-note`/`--source-artifact` for an id that genuinely exists and
  that this belief actually came from.

# Instructions

## Step 1: Recognize a capturable moment

Ask this while working, not as a separate pass at the end. Triggers: an
undocumented project convention, a gotcha that will bite the next person
too, a decision with real reasoning not already an ADR or code comment, or
something non-obvious you confirmed by testing directly. Task-scoped state
("this is blocked on review") is not a belief — skip this skill for it.

## Step 2: Search first

```bash
tasker memory search "drizzle-kit generate snapshot" --scope-type project --scope-id <project-id>
```

No `--project`/`TASKER_PROJECT_ID` set? Pass `--scope-id` explicitly, or
export `TASKER_PROJECT_ID` — every `memory` command that reads a scope
falls back to it the same way `tasks`/`artifacts` fall back to
`TASKER_PROJECT_ID`/`TASKER_ORG_ID`.

- Nothing relevant comes back → Step 3.
- A close match exists and is now wrong or incomplete → Step 4.
- A close match exists and is still correct, but what you learned is a
  distinct, related fact → record it (Step 3), then relate the two (Step 5).

## Step 3: Record it

```bash
tasker memory record "drizzle-kit generate against this repo's SQLite schema \
produces migrations against a stale baseline snapshot - always hand-verify \
CREATE TABLE statements before applying, never trust the output wholesale." \
  --org <org-id> --scope-type project --scope-id <project-id> \
  --confidence high --source-task <task-id>
```

`--confidence` defaults to `medium`; use `high` for something verified
directly, `low` for an unconfirmed inference. Attach a `--source-*` flag
naming where this came from. The statement is the whole payload — name the
specific thing, not "this doesn't work as expected."

## Step 4: Supersede, don't duplicate

```bash
tasker memory supersede <belief-id> "Corrected/updated statement text." --confidence high
```

The old belief is marked superseded (stops appearing in default search
results, stays in history) and the new one records `supersedesBeliefId`
pointing back to it — the correction is traceable, not a silent overwrite.

## Step 5: Relate related beliefs

```bash
tasker memory relate <belief-a-id> <belief-b-id> --type supports
```

`--type` is one of `relates_to` (default), `supports`, `contradicts`, or
`duplicates`.

## Step 6: Never do these as an agent

These fail with `permission_denied` for a token regardless of scopes held
(ADR-0015) — don't attempt them, and don't route around the refusal:

- `tasker memory promote` — moving a belief to a wider scope
- `tasker memory archive` / `restore` / `purge` — the belief lifecycle
  stays human-reviewed

If a belief needs one of these, say so in a task comment or note so a
person can act on it.

# Output Format

After acting, state plainly, in one or two sentences:

- **Recorded**: the belief id, its confidence, and its scope
  (`blf-abc123, high confidence, project scope`).
- **Superseded**: both ids — the old belief and its replacement.
- **Related**: both belief ids and the relation type used.
- **Skipped**: why — an equivalent belief already exists (name its id), or
  what you found wasn't durable enough to capture.

Never claim a write happened without running the command and seeing its
success output — report a failed or skipped call as such, not as done.

# Worked example

Mid-task, you confirm `tsp compile`'s protobuf emitter never writes
`service` blocks into its output — the checked-in `.proto` file's services
must be hand-maintained. A search found nothing relevant:

```bash
tasker memory record \
  "tsp compile's protobuf emitter never emits service blocks - the checked-in \
health.proto's services are hand-written and must be verified field-by-field \
against main.tsp, never copied wholesale from tsp-output." \
  --org org-42 --scope-type project --scope-id proj-shared-contract \
  --confidence high --source-task task-891
```

# See also

- `docs/agent-integration.md` §9 — the same guidance for an agent driving
  the CLI directly, outside a skill-aware harness.
- `.specs/adr/ADR-0014-memory-reuses-the-existing-scope-hierarchy.md`,
  `ADR-0015-agent-tokens-gain-memory-read-write-scopes.md`,
  `ADR-0016-belief-retrieval-is-pluggable-lexical-by-default.md` — the
  design decisions behind shared memory.
