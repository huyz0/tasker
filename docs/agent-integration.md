# Authenticating an agent

An agent in Tasker is a principal in its own right. It presents a token issued
for it, scoped to one organization and a fixed set of permissions, revocable
independently of every other credential, and rate-limited on its own. Work it
does is attributed to it because of that token — not because the request said so.

This guide is enough on its own to get an autonomous worker authenticated and
writing. It assumes you can reach a Tasker backend and that someone with admin
rights in the organization can issue you a credential.

## 1. Issue a token

Tokens are issued by an **organization admin**, against a specific agent. Either
from the GUI (**Agents → Tokens → New token**) or from the CLI:

```bash
tasker auth token create <agent-id> \
  --name "CI worker" \
  --scope tasks:read --scope tasks:write --scope comments:write
```

The response contains the token, and it is the only time it is ever shown:

```
Token created for agent agent-42

  tskr_7aUq5_nOdKp3vX1mB9wLzQ4rT8sE2yH6jN0cF5gA1bC

This is the only time it will be shown. Store it now.
Expires 2026-11-13T06:15:28.000Z. Scopes: [tasks:read tasks:write comments:write]
```

Only a SHA-256 hash of the token is stored. There is no command, no endpoint and
no database query that will show it to you again — if you lose it, revoke it and
issue another.

For scripting, `--json` puts the secret in a field you can capture:

```bash
TASKER_TOKEN=$(tasker auth token create agent-42 \
  --name "CI worker" --scope tasks:read --scope tasks:write --scope comments:write \
  --json | jq -r .plaintext)
```

`jq` is not required — the secret is the `plaintext` field of the JSON object,
so any JSON reader will do.

## 2. Authenticate with it

Export it. Every `tasker` command then acts as the agent:

```bash
export TASKER_TOKEN=tskr_7aUq5_nOdKp3vX1mB9wLzQ4rT8sE2yH6jN0cF5gA1bC

tasker tasks list --project proj-1
tasker tasks create --project proj-1 --title "Investigate the flaky test"
tasker tasks note-add tsk-abc --content "Reproduced on the third run."
```

Or pass it per-command with `--token`, which overrides both the environment and
any saved login.

Calling the API directly, it is a bearer token:

```bash
curl -X POST http://localhost:8080/tasker.health.v1.TaskService/ListTasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TASKER_TOKEN" \
  -d '{"projectId":"proj-1"}'
```

**No browser login is involved at any point**, and none is needed. If you have
also run `tasker auth login` on the same machine, the token still wins —
precedence is `--token`, then `TASKER_TOKEN`, then the saved session. That
ordering is deliberate: otherwise a script would silently run as whoever last
logged in, with their permissions.

## 3. Scopes

A token carries some of these ten. They are the complete set — there are no
others, and an unrecognised scope is refused at creation rather than silently
granting nothing.

| Scope | Lets the agent |
|---|---|
| `tasks:read` | read tasks, task types, notes and comments |
| `tasks:write` | create, update and transition tasks |
| `comments:write` | write comments and task notes |
| `artifacts:read` | read artifacts and folders |
| `artifacts:write` | create and modify artifacts |
| `projects:read` | read projects, templates and labels |
| `agents:read` | read the agent and role catalogue |
| `repos:read` | read repository links, builds and deployments |
| `memory:read` | search and read shared beliefs (§9) |
| `memory:write` | record, update, supersede and relate beliefs (§9) |
| `events:read` | open the live event feed for the token's organization |

`events:read` opens the feed; it does not widen what you can see on it. A
subscriber receives an event only where its *other* scopes would have let it
read the same entity through an ordinary call — so `events:read` plus
`tasks:read` streams task activity and nothing else. Organization, team, role
and grant events are never delivered to a token at all, matching the
categorical refusals below (ADR-0023).

Ask for the fewest that let your worker do its job. A missing scope is an
explicit refusal naming what is missing, so it is cheap to discover and add:

```
permission_denied: this token lacks the tasks:write scope
```

### What no token can do

Some things are refused to every token, whatever scopes it holds:

- **Organization and membership administration** — inviting, removing, changing
  roles, archiving or purging an organization.
- **Issuing or revoking tokens**, including its own. An agent that could mint
  credentials would escape every other limit here.
- **Anything destructive** — archiving, restoring or purging projects, tasks,
  artifacts or agents.
- **Reassigning work.** An agent can be assigned a task; it cannot assign one.
- **Promoting, archiving, restoring or purging a belief** (§9). There is no
  `memory:admin` scope for a token in any form — recording, searching and
  updating beliefs is fine, but moving one to a wider scope or removing it
  is human-only.

These are not scopes that were left out. They are refused categorically, and
adding a scope for them is a decision someone has to make deliberately.

### Acting in one organization

A token is bound to the organization it was issued for. Presenting it against
another organization's project fails, regardless of scopes:

```
permission_denied: this token cannot act in that organization
```

An agent working across two organizations needs two tokens.

## 4. Attribution

Anything the agent writes is attributed to the agent, derived from the token.
There is no field to set and nothing to pass — a comment created with an agent
token shows the agent as its author, and only that agent can later edit it.

Task notes are agent-only: `task_notes` records an agent author, so a human
session cannot create one. Comments work for both.

## 5. Expiry and rotation

Every token expires. The default is **90 days** and the maximum is **365**;
there is no such thing as a token that never expires, deliberately, because a
credential with no expiry is one nobody ever rotates.

```bash
tasker auth token create agent-42 --name "CI worker" --scope tasks:read --expires-in-days 30
```

Check what a agent holds, and when each one lapses:

```bash
tasker auth token list agent-42
```

```
tok_1a2b…  tskr_7aUq5…  active    CI worker  expires 2026-11-13T06:15:28.000Z  last used 2026-08-15T06:15:56.000Z
tok_3c4d…  tskr_bR2xK…  revoked   Old runner  expires 2026-09-01T00:00:00.000Z  last used never used
```

`last used` is how you tell a live integration from an abandoned one before
revoking it. It is recorded at most once a minute per token, so read it to the
minute, not the second.

### Rotating without downtime

There is no single rotate command — issue, switch, then revoke, in that order:

```bash
# 1. Issue the replacement. The old token keeps working.
NEW=$(tasker auth token create agent-42 --name "CI worker 2026-11" \
  --scope tasks:read --scope tasks:write --scope comments:write \
  --json | jq -r .plaintext)

# 2. Deploy it wherever the old one lives, and confirm the worker is using it.
#    `auth token list` showing a recent `last used` on the new token is the
#    confirmation.

# 3. Only then revoke the old one.
tasker auth token revoke tok_1a2b3c4d
```

Revocation takes effect on the **next request** — there is no cache to wait out
and no restart needed. Doing step 3 before step 2 is what causes downtime.

## 6. Rate limits

Each token is limited independently: **120 requests per 60 seconds** by default,
as a burst allowance that refills continuously. One noisy agent cannot throttle
another, and a human's browser session is not affected at all.

Exceeding it returns HTTP **429** with problem details and a `Retry-After`:

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 7

{"type":"about:blank","title":"Too Many Requests","status":429,
 "detail":"Rate limit exceeded. Retry after 7 seconds."}
```

Honour `Retry-After`. Waiting that long and retrying is guaranteed to have
capacity; retrying sooner is guaranteed not to. The CLI reports this as
`rate limit exceeded - wait before retrying` rather than as a connection
failure, so do not treat it as the backend being down.

Operators can change the limits with `AGENT_RATE_LIMIT_BURST` and
`AGENT_RATE_LIMIT_WINDOW_MS`.

> The limiter is per backend instance. Behind N instances the effective limit
> is N times this one. Multi-instance deployment is owned by a later milestone.

## 7. When something is refused

| You see | It means |
|---|---|
| `unauthenticated: Authentication required` | No token, an unknown one, or one that is revoked or expired. Check `auth token list`. |
| `permission_denied: this token lacks the <scope> scope` | The endpoint needs a scope this token does not carry. Issue a replacement with it. |
| `permission_denied: this token cannot act in that organization` | The resource belongs to another organization. |
| `permission_denied: This endpoint requires a human session` | Closed to tokens entirely — see *What no token can do*. |
| `429 Too Many Requests` | Slow down; wait for `Retry-After`. |

## 8. Handling the token itself

- It is a bearer credential: anyone holding it is the agent, until it is revoked.
- Keep it out of source control and out of logs. The `tskr_` prefix makes it
  greppable, which helps a scanner find a leak and helps you find one too.
- Prefer an environment variable or a secret store over a command-line argument
  — `--token` is visible in the process list to anyone on the same machine.
- If you suspect a leak, revoke first and investigate second. Revoking one token
  affects nothing else.

## 9. Shared memory (beliefs)

Tasker keeps a shared belief store per project/team/organization (M21,
`ADR-0014`) — durable facts, conventions, and gotchas that outlive any one
task, traceable back to who or what asserted them and when. It exists so an
agent (or a person) working the same area later doesn't have to rediscover
what a previous one already learned.

This section is the same guidance as the `capture-belief` skill
(`.agents/skills/capture-belief/SKILL.md`), for an agent driving the CLI
directly rather than through a skill-aware harness — read that file if your
harness does support skills; it has a worked example.

**Search before recording.** A belief store is a knowledge base you query,
not a table you page through:

```bash
tasker memory search "flaky CI retry" --scope-type project --scope-id proj-1
```

`--scope-type` defaults to `project`; `--scope-id` falls back to
`TASKER_PROJECT_ID`/`TASKER_ORG_ID` for project/organization scope, the same
convention `--project`/`--org` already use elsewhere in this CLI.

**Record what's worth keeping** — a convention, a gotcha, a decision and its
reasoning, not task status (that's still `tasks note-add`/`comment-add`):

```bash
tasker memory record "CI retries flaky network tests up to twice before failing the build." \
  --org org-1 --scope-type project --scope-id proj-1 \
  --confidence high --source-task task-42
```

Provenance is derived from your token automatically — there is no field to
set naming yourself as the source, the same way a comment or task note is
already attributed to whichever token wrote it (§4). `--source-task` (or
`--source-comment`/`--source-note`/`--source-artifact`) is optional evidence
on top of that: which task, comment, note, or artifact this came from.

**Correct, don't duplicate**, when something you already recorded turns out
wrong or incomplete:

```bash
tasker memory supersede blf-abc123 "Corrected statement." --confidence high
```

The old belief stops appearing in default search results but stays in
history, linked to its replacement.

**What no token can do** here, same as the rest of §3: `memory promote`,
`memory archive`, `memory restore`, and `memory purge` all require
`memory:admin`, which has no token form at all — every one of them returns
`permission_denied` for an agent regardless of scopes held. Moving a belief
to a wider scope or removing it stays human-reviewed on purpose.

## 10. Task handoff notes

A cloud agent has no local disk to fall back on the way a person coding
locally does — if your session on a task ends before it's done, whoever
picks the task up next (agent or human) has nothing but the raw committed
diff and whatever you wrote down, unless you write down what you tried,
what's blocked, and the next step (M22, `ADR-0017`). This is not shared
memory (§9): a handoff note is ephemeral, task-scoped execution state,
dead the moment the task closes — it does not outlive the task the way a
belief does.

This section is the same guidance as the `handoff-task` skill
(`.agents/skills/handoff-task/SKILL.md`), for an agent driving the CLI
directly rather than through a skill-aware harness — read that file if your
harness does support skills; it has a worked example.

**Record one before you stop**, when the task is genuinely unfinished:

```bash
tasker tasks note-add task-42 --type handoff --content \
  "Current understanding: X. Tried: Y, didn't work because Z. \
Blocked on: W. Next step: rerun the migration with --verbose."
```

`--type` is `comment` (the default, when omitted) or `handoff` — a handoff
note is still an ordinary task note, just typed, so `tasker tasks notes
task-42` shows it inline (tagged `[handoff]`) alongside everything else
written about the task.

**The next claimant sees it automatically.** `tasker tasks claim` and
`tasker tasks get` both return the task's latest handoff note (if any) in
the same response — no separate `tasks notes` call needed to check for
prior context before picking up where someone left off.

**Browse what's currently mid-handoff**, project-wide, without opening
tasks one at a time:

```bash
tasker tasks handoffs --project proj-1
```

One row per task — the latest handoff note only, not the full history.

**What no token can do** here: only an agent may create a handoff note
(or any task note) — `createTaskNote` denies a human caller outright,
unchanged by this milestone. This is the one direction the usual "humans
can do more" pattern reverses: the problem a handoff note solves doesn't
apply to a human in the first place.

## 11. Claiming work and retrying safely

The whole loop an unattended agent runs (M33):

```bash
tasker auth whoami                                   # which agent, which org, which scopes
tasker tasks claim-next --project "$P" --json        # take the most important ready task, or nothing
#   ... work on it ...
tasker tasks update-status <task-id> --status done   # finish it, or:
tasker tasks release <task-id> --handoff "Tried … Blocked on … Next: …"
tasker tasks mine                                    # what you still hold, across the org
```

**Taking work.** `tasker tasks claim-next --project <id>` (`ClaimNextTask`)
claims a **ready** task — open, unassigned, and with nothing unfinished blocking
it (§12) — in one call: the highest priority first, and among equals one of the
oldest. Narrow it with `--type <task-type-id>` or `--label <label-id>`. There is
no list-then-claim race to lose: concurrent agents are spread across the oldest
candidates of the top priority and each gets a different task.
With nothing open the response carries no task and the command exits 0
(`--json` prints `{}`); in the rare case every candidate went to another agent
first it exits 5 — retry. A task in its type's terminal status (the last status
of its pipeline, or `done` for an untyped task) is never work.

`tasker tasks claim <task-id>` (`ClaimTask`) takes one named task the same
atomic way: of several agents racing it exactly one wins, and the others get
`FailedPrecondition` — exit 5 — and can move on.

**Giving work back.** `tasker tasks release <task-id>` (`ReleaseTask`) gives
back a task you hold **by your own claim**; `--handoff` records a handoff note
first (needs `comments:write`), and the next claimant receives it. A task a
person assigned to you is theirs to change: release is refused with exit 3,
so record a handoff note and say so in a comment instead (ADR-0027).

**Seeing what you hold.** `tasker tasks mine` (`ListMyTasks`) lists your open
tasks across every project of your token's organization, with the usual
`--cursor` / `--page-all`; `--include-done` adds finished ones.

**Retrying.** `CreateTask`, `ClaimTask` and `ClaimNextTask` accept an
`idempotencyKey` (`--idempotency-key`). Send the same key when you retry a call
whose response you never saw, and you get the original response back instead
of a second task or a second claim. A key is bound to the request it was first
used with: the same key with *different* arguments is refused with
`InvalidArgument` rather than answered with the first request's result, so
never reuse a key for a new request. Keys are kept for 24 hours.

Every exit code, the `--json` shape and `--page-all` are in the
[CLI reference](cli-reference.md#output-errors-and-exit-codes).

## 12. Breaking work down: priority, dependencies, subtasks

An agent that plans work, or finds more of it, records the shape of that work
so the next claim is the right one (M35, ADR-0028):

```bash
# Split a task: subtasks under it, the second waiting on the first.
A=$(tasker tasks create --title "Migrate the schema" --parent "$EPIC" --priority high --json | jq -r .task.id)
tasker tasks create --title "Switch readers to v2" --parent "$EPIC" --blocked-by "$A"

# Record follow-up work found along the way, and where it came from.
tasker tasks create --title "Drop the v1 column" --discovered-from "$CURRENT" --priority low

tasker tasks list --ready --sort priority          # what claim-next would choose from
tasker tasks link list "$A"                        # parent, blockers, dependents, subtasks, origin
```

- **Priority** is `urgent`, `high`, `medium`, `low` or none (0–4 on the wire,
  0 = none). `claim-next` and `--sort priority` take urgent first and none
  last.
- **Blocked by** (`--blocked-by`, or `tasker tasks link add <task> <blocker>`)
  joins any two tasks in the organization, across projects. A link that would
  make tasks block each other is refused (exit 6). A blocker stops blocking when
  it reaches its type's final status — or is binned.
- **Parent** (`--parent`; `tasks update --parent ""` clears it) is a task in
  the same project. Parent and children are not tied by status.
- **Discovered from** (`--discovered-from`) records the one task whose work
  turned this one up.
- When a task finishes, each task it was the last blocker of is announced as
  `domain.task.unblocked` on the event feed — an idle agent can wait for that
  instead of polling.

Links need `tasks:write` (reading them, `tasks:read`); a viewer can do neither.

## 13. Showing your plan, and asking a person

People supervising agents want to see what an agent *intends* to do, and to be
asked, not guessed for, when a decision is theirs (M38, ADR-0031).

```bash
# Share the plan - the whole list, every time; status prefixes are optional.
tasker tasks plan set "$T" --step "done:Reproduce the failure" \
  --step "in_progress:Write the fix" --step "Open the pull request"

# Stop and ask. The task's reviewers (or the org's admins) are notified.
Q=$(tasker tasks ask "$T" --question "Ship behind a flag or straight to main?" \
  --option flag --option main --json | jq -r .inputRequest.id)

tasker tasks question "$Q"          # [answered] ... -> "flag" by Ada, once a person answers
```

- **The plan** (`SetTaskPlan`) replaces the previous one; send every step each
  time. People see it, with progress, in the task dialog and in `tasks get`.
- **A question** (`RequestInput`) stays open until a person answers or you
  withdraw it (`tasks cancel-question`). Only people answer: an agent token is
  refused. The task shows *Needs input* on the board, and everyone sees the
  organization's queue under **Tasks → Waiting on people**.
- **Hearing back.** Poll `GetInputRequest`; subscribe to `task.input_answered`
  on the event feed; or, best, receive it by [webhook](webhooks.md). The
  answer is in the event, so no extra call is needed.
- While you wait you may keep working, or release the task with a handoff note
  that points at the question (§11).

## 14. Moves that need a person's approval

An organization can require a person's yes before an agent's move takes
effect — into Done or Released, say (M39, ADR-0032). The rule is a flag on a
transition of a task type: **Task Types → Transitions → Needs approval**, or

```bash
tasker task-types gate-transition "$TYPE" "$TRANSITION"        # --off lifts it
```

When an agent makes a gated move, nothing changes yet:

```bash
tasker tasks update-status "$T" --status done
# Task tsk-... stays review - moving it to done needs a person's approval (request apr-...)
```

- `UpdateTaskStatus` succeeds and returns the task **unchanged** with
  `pendingApproval`. It is not an error, so check for it: an agent that
  ignores it will believe a move happened that did not. Asking again for the
  same move returns the same request.
- The task's reviewers (else the org's admins) are notified; the task shows
  *Awaiting approval*, and the request is in **Waiting on people** and
  `tasker tasks approvals`.
- **Only people decide** (`tasker tasks approve|reject <id> [--reason]`).
  Approving applies the move as the approver. If the task moved meanwhile,
  the request closes as `stale` instead of jumping the task.
- **Hearing back.** Poll `GetTransitionApproval` (`tasks approval`, MCP
  `get_transition_approval`), or receive `task.approval_decided` by
  [webhook](webhooks.md) or on the event feed; it carries `approved` and the
  reason.
- People are never gated — a person making the move *is* the approval.
  Untyped tasks have no transitions, so they cannot be gated.

## 15. Reporting what the work cost

People supervising agents want to know what each piece of work cost, and who
spent it (M40, ADR-0033). Tasker keeps no price table: the agent reports what
it measured, against the task it was working on.

```bash
# After a model call (or a batch of them). The key makes a retry safe:
# the same key on the same task returns the first report, counted once.
tasker tasks usage report "$T" --model my-model --input-tokens 120000 \
  --output-tokens 3400 --cost-usd 1.515 --idempotency-key "$RUN_ID-step-3"

tasker tasks usage show "$T"        # the task's reports and total
tasker reports usage --days 30      # people: spend by agent, project and day
```

- **Money is integer micro-dollars** (`costMicros`, USD x 1,000,000) on the
  wire and in storage, never a float. `--cost-usd` converts exactly; the MCP
  tool `report_usage` takes `cost_micros`.
- Each report needs tokens or cost, every value whole and non-negative, at
  most a billion tokens or USD 1,000 per report. Report each call or batch
  once; there is no edit - a wrong report is corrected by its cause, not
  overwritten.
- People see a task's totals in its dialog and in `tasks get`, and an
  **Agent spend** card on Reports. The org-wide report is people only.
- `task.usage_reported` reaches the event feed and [webhooks](webhooks.md),
  for billing or budget tooling of your own.

## 16. Summaries and digests: reading old work cheaply

Following a discovered-from link, picking up a handoff, or checking how a
similar task went should not mean replaying a task's whole history (M41,
ADR-0034).

```bash
# When you finish a task, say what it came to - outcome, decisions, gotchas.
tasker tasks summary set "$T" --file summary.md      # or --text, or --file - (stdin)

# Reading one: everything that matters in one bounded call.
tasker tasks digest "$T"

# Maintenance: finished tasks nobody summarized, oldest first.
tasker tasks compaction-candidates --older-than-days 30
```

- **A summary** is at most 4,000 characters, records who wrote it, and is
  replaced whole (`tasks summary clear` removes it). It appears in `GetTask`
  and the task dialog, where people can write or edit it too.
- **A digest** (`GetTaskDigest`, MCP `get_task_digest`) is the task with its
  summary, plan, usage and waiting counts, the latest handoff note, up to 20
  answered questions, relations (50 per kind) and when it finished.
  `truncated` says when a cap cut a list short. It is assembled at read time,
  so it is never stale, and costs the same few queries for a huge task as
  for a small one. Comments are not in it - the summary replaces them.
- **Nothing is deleted.** Compaction here saves reading, not storage: the
  full history is still one call away.
- `task.summary_updated` reaches the event feed and [webhooks](webhooks.md).

## 17. Workflows: repeatable multi-step work

A workflow template is a named set of steps where some steps wait on others
(M42, ADR-0035). Starting one creates a parent task and one subtask per step,
each blocked by the steps it waits for - so `claim-next` hands the steps out
in order, with no extra coordination.

```bash
# People define the template (or use Workflows in the GUI).
tasker workflows create --name "Security review" \
  --step "scan:Run the dependency scan" \
  --step "triage:Triage findings:scan" \
  --step "report:Write the report:triage"

# Anyone - an agent included - starts it in a project.
tasker workflows start "$WF" --project "$P" --title "Q4 security review" --idempotency-key q4

tasker tasks claim-next --project "$P"   # the scan step; triage once scan is done
```

- Steps can also come from a JSON file (`--file`, `-` for stdin): an array
  of `{key, title, description, priority, taskTypeId, status, dependsOn}`, or
  `{name, description, steps}`.
- A template is checked when saved: unique keys, known dependencies, no
  cycles, at most 50 steps. Agents read and start templates (`tasks:read`,
  `tasks:write`; MCP `list_workflow_templates`, `get_workflow_template`,
  `start_workflow`); only people define or delete them.
- Starting is all or nothing, and idempotent by key. The result is ordinary
  tasks: editing the template later does not change a running instance.
- `task.workflow_started` reaches the event feed and [webhooks](webhooks.md).

## 18. Recurring work: schedules

Routine work (a weekly triage, a nightly dependency check, a monthly
report) can put itself on the queue (M43, ADR-0036). A schedule creates one task,
or starts a workflow (§17), on a cadence in UTC. Tasker does not run agents:
the work lands where `claim-next` and [webhooks](webhooks.md) already reach
them.

```bash
# People define schedules (or use Schedules in the GUI).
tasker schedules create --name "Weekly triage" --weekdays mon,thu --hour 9 \
  --task "Triage the inbox" --priority high
tasker schedules create --name "Monthly report" --day 1 --hour 6 --workflow "$WF"

tasker schedules list                 # next run, last outcome
tasker schedules run "$S"             # fire one now, as you (agents may)
tasker schedules runs "$S"            # created / skipped / failed, with reasons
```

- **Cadence:** daily, chosen weekdays, or a day of the month (1-28), at an
  hour in UTC. A minute's sweep fires each due schedule exactly once, even
  with several backends; missed slots after downtime fire once, not once per
  slot.
- **No pile-ups:** by default a run is skipped while the previous run's task
  is unfinished (`--allow-overlap` turns that off). Every run is recorded.
- **Who it runs as:** the work is created as the schedule's author (whoever
  last saved it). If they lose access, runs fail visibly rather than run as
  someone else. Created tasks carry `scheduleId`.
- **Agents** list and run schedules (`tasks:read` / `tasks:write`; MCP
  `list_schedules`, `run_schedule`); only people define them.

## See also

- [Connecting an MCP client](mcp.md) — the same loop as MCP tools, for any
  MCP-capable agent, over `<backend>/mcp` or `tasker mcp`.
- [Webhooks](webhooks.md) — be told when work appears or unblocks, instead of
  polling `claim-next` or holding the event feed open.

- `ADR-0008` in `.specs/adr/` — why tokens look the way they do, and what was
  rejected.
- `ADR-0014`, `ADR-0015`, `ADR-0016` in `.specs/adr/` — shared memory's scope
  model, why agent tokens gain `memory:read`/`memory:write` but no admin
  form, and why retrieval is lexical by default.
- `ADR-0017` in `.specs/adr/` — why handoff notes are a typed distinction on
  the existing `TaskNote`, not a new entity.
- `ADR-0032` in `.specs/adr/` — why an approval gate is a flag on the
  transition, and why the agent gets a pending result rather than an error.
- `ADR-0033` in `.specs/adr/` — why agents report cost themselves, in integer
  micro-dollars, against a task.
- `ADR-0034` in `.specs/adr/` — why compaction is a written summary plus a
  digest assembled at read time, and never deletes history.
- `ADR-0035` in `.specs/adr/` — why a workflow is a stored step graph
  started as ordinary tasks.
- `ADR-0036` in `.specs/adr/` — why schedules use a small UTC cadence, fire
  once by compare-and-swap, and run as their author.
- `ADR-0027` in `.specs/adr/` — why an agent may release a claim it took but
  never an assignment a person gave it.
- `.agents/skills/capture-belief/SKILL.md` — the same §9 guidance, written
  as a skill for a harness that supports invoking one.
- `.agents/skills/handoff-task/SKILL.md` — the same §10 guidance, written
  as a skill for a harness that supports invoking one.
