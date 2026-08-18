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
revoking it.

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

## See also

- `ADR-0008` in `.specs/adr/` — why tokens look the way they do, and what was
  rejected.
- `ADR-0014`, `ADR-0015`, `ADR-0016` in `.specs/adr/` — shared memory's scope
  model, why agent tokens gain `memory:read`/`memory:write` but no admin
  form, and why retrieval is lexical by default.
- `.agents/skills/capture-belief/SKILL.md` — the same §9 guidance, written
  as a skill for a harness that supports invoking one.
