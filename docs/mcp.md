# Connecting an MCP client

Tasker speaks the [Model Context Protocol](https://modelcontextprotocol.io), so
any MCP-capable agent can work a Tasker queue without a custom integration: find
work, claim it, record notes and handoffs, link follow-up tasks and search
shared memory. The tools run with exactly the permissions of the token you give
the client (M36, ADR-0029).

You need an **agent token** — see [Authenticating an agent](agent-integration.md).
Give it the scopes the agent's job needs; `tasks:read tasks:write comments:write`
covers the work loop, plus `memory:read` / `memory:write` for shared memory.

The GUI can generate scoped stdio configuration and verify its exact token; see
[Register an agent and connect a worker](agent-connection.md). Verification tests
API authentication, while the client process runs in your own environment.

## Over HTTP (preferred)

The endpoint is `POST <backend>/mcp`, streamable HTTP in JSON-response mode,
with no session to manage. Send the token as a bearer header.

Claude Code:

```bash
claude mcp add --transport http tasker https://tasker.example.com/mcp \
  --header "Authorization: Bearer $TASKER_TOKEN"
```

Any client that takes a JSON configuration:

```json
{
  "mcpServers": {
    "tasker": {
      "type": "http",
      "url": "https://tasker.example.com/mcp",
      "headers": { "Authorization": "Bearer tskr_..." }
    }
  }
}
```

## Over stdio

For a client that can only launch a command, `tasker mcp` relays stdin/stdout to
the same endpoint, using `TASKER_TOKEN` (or a saved `tasker auth login`) and
`TASKER_BACKEND_URL`:

```json
{
  "mcpServers": {
    "tasker": {
      "command": "tasker",
      "args": ["mcp"],
      "env": { "TASKER_TOKEN": "tskr_...", "TASKER_BACKEND_URL": "https://tasker.example.com" }
    }
  }
}
```

## Tools

| Tool | Does | RPC |
|------|------|-----|
| `whoami` | The calling agent, its organization and scopes | `GetIdentity` |
| `list_folders` | A project's folders; bounded `limit` / `cursor` | `ListFolders` |
| `list_artifacts` | A folder's artifact metadata; bounded `limit` / `cursor` | `ListArtifacts` |
| `create_artifact` | Store a named output with literal `content` and optional `content_type` | `CreateArtifact` |
| `link_task_artifact` | Attach an existing artifact to a task | `LinkTaskArtifact` |
| `list_task_artifact_links` | A task's paged links, current metadata and historical linking actor/time | `ListTaskArtifactLinks` |
| `get_artifact_content` | Explicit bounded stored-content read; optional `max_characters` | `GetArtifactContent` |
| `list_projects` | Projects in an organization | `ListProjects` |
| `list_tasks` | Tasks in a project; `ready`, `priority`, `label_id`, `parent_task_id`, `status`, `assignee`, `query`, `sort` | `ListTasks` |
| `get_task` | One task, with its latest handoff note | `GetTask` |
| `create_task` | New task; `priority`, `parent_task_id`, `blocked_by`, `discovered_from_task_id` | `CreateTask` |
| `update_task` | Title, description, priority, parent | `UpdateTask` |
| `set_task_status` | Move a task along its type's transitions; a gated move comes back as `pendingApproval` and has not happened yet | `UpdateTaskStatus` |
| `claim_next_task` | Atomically take the most important ready task | `ClaimNextTask` |
| `claim_task` | Take one named task | `ClaimTask` |
| `release_task` | Give back your own claim, with an optional handoff note | `ReleaseTask` |
| `list_my_tasks` | What you hold, across the organization | `ListMyTasks` |
| `add_task_note` | An agent note; `handoff: true` for a handoff | `CreateTaskNote` |
| `list_task_notes` | A task's notes and handoffs | `ListTaskNotes` |
| `add_comment` | A comment for the people watching a task | `CreateComment` |
| `link_tasks` / `unlink_tasks` | `blocked_by` / `discovered_from` links | `AddTaskLink` / `RemoveTaskLink` |
| `list_task_links` | Parent, subtasks, blockers, dependents, origin | `ListTaskLinks` |
| `set_task_plan` | Replace your plan for a task: `[{title, status}]` | `SetTaskPlan` |
| `request_input` | Ask a person a question; reviewers or admins are notified | `RequestInput` |
| `get_input_request` / `list_input_requests` | A question's status and answer; a task's or the org's open questions | `GetInputRequest` / `ListInputRequests` |
| `cancel_input_request` | Withdraw a question you asked | `CancelInputRequest` |
| `get_transition_approval` / `list_transition_approvals` | Follow a held move: pending, approved (applied), rejected (with a reason) or stale | `GetTransitionApproval` / `ListTransitionApprovals` |
| `report_usage` | Record the tokens and cost (micro-dollars) of your work on a task; idempotent by key | `ReportUsage` |
| `set_task_summary` | What a finished task came to (≤ 4,000 chars); replaces the last one; explicit `text: ""` clears it | `SetTaskSummary` |
| `get_task_digest` | One bounded read of a task: summary, plan, usage, latest handoff, answered questions, relations; `include_artifacts: true` adds bounded artifact metadata | `GetTaskDigest` |
| `list_compaction_candidates` | A project's finished tasks with no summary, oldest first | `ListCompactionCandidates` |
| `list_workflow_templates` / `get_workflow_template` | Repeatable multi-step workflows and their step graphs | `ListWorkflowTemplates` / `GetWorkflowTemplate` |
| `start_workflow` | Create a workflow's parent task and its wired steps in a project | `InstantiateWorkflow` |
| `list_schedules` / `run_schedule` | Recurring work: when each schedule fires next; fire one now as you | `ListSchedules` / `RunSchedule` |
| `get_task_type` | A type's statuses and legal transitions | `GetTaskType` |
| `search_memory` | Search shared beliefs | `SearchBeliefs` |
| `record_belief` | Record a durable fact | `RecordBelief` |

`set_task_summary` always requires both `task_id` and `text`. To clear a summary,
call it with `{"task_id":"<task-id>","text":""}`. Missing/null/non-string text,
more than 4,000 characters or an empty task ID is invalid; only explicit empty
summary text has this clearing meaning.

Workflow dependencies determine step readiness. `claim_next_task` selects from
all eligible tasks in the project, including an ordinary workflow parent; it
does not target one workflow or promise a named step. Use `claim_task` with the
step's task ID when selecting that step, after checking its readiness. Named
claims do not enforce blockers; `claim_next_task` does. Organization-wide
templates and a project's own templates appear in project-scoped lists; organization-scoped
lists include all templates in that organization. See the
[workflow example](agent-integration.md#17-workflows-repeatable-multi-step-work).

`run_schedule` accepts a new creation intent on every call. An accepted queued
or interrupted result recovers automatically; calling it again creates another
intent. Inspect the schedule's Recent runs in the GUI, `tasker schedules runs
<id> --json`, or `ScheduleService.ListScheduleRuns` to follow the original run.
Schedule events include `runId` for correlation, but current authorized reads
remain the source of truth. A created result means Tasker created the work;
external agent execution is separate.

Arguments are validated against each tool's published schema: a missing or
misspelt argument is a protocol error naming it. When the server refuses a call
— a missing scope, a task someone else holds, an illegal transition — the tool
result has `isError: true` and the server's own message, which a model can read
and act on.

## Handing off artifact evidence

Use `tasks:read artifacts:read artifacts:write` to attach an existing output and
read the task's evidence. Add other scopes only for the other work you perform.
An ordinary `get_task_digest` needs only `tasks:read`; omitted or false
`include_artifacts` performs no artifact read. Positive opt-in also requires
`artifacts:read` and returns at most 20 metadata entries, with `digest.truncated`
when evidence or another digest section exceeds its cap. It never returns bodies.

These are separate `tools/call` requests over the configured transport. Replace
IDs with authorized resources and choose the destination folder explicitly.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_folders","arguments":{"project_id":"<project-id>","limit":20}}}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_artifacts","arguments":{"folder_id":"<folder-id>","limit":20}}}
```

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_artifact","arguments":{"folder_id":"<folder-id>","name":"verification-<unique-run-id>.md","content":"Checks passed; review the migration notes.","content_type":"text/markdown"}}}
```

Use the returned `artifact.id` when linking, then read current metadata:

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"link_task_artifact","arguments":{"task_id":"<task-id>","artifact_id":"<artifact-id>"}}}
```

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_task_digest","arguments":{"task_id":"<task-id>","include_artifacts":true}}}
```

Read a body only when needed:

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_artifact_content","arguments":{"artifact_id":"<artifact-id>","max_characters":4000}}}
```

Each tool makes one existing RPC. Discovery and link lists default to 20 entries
and accept `limit` 1–100 plus an opaque `cursor`; follow `page.nextCursor` to
continue. Use `list_task_artifact_links` for later evidence pages beyond the
digest's cap. The link list also returns current metadata for that page.

`create_artifact` requires `content`, including explicit `""` for an empty
output, and bounds it at 16,000 UTF-16 code units. Names are limited to 256,
descriptions to 1,024 and MIME values to 128 code units. An uncertain create
result does not prove failure: inspect the destination folder, following its
pages, for the unique output name before creating again. Read the candidate's
content to verify it. Repeating a successful link sequentially preserves its
original ID and linking provenance; this is not an exactly-once claim.

`get_artifact_content` always supplies a bound: 4,000 Unicode code points by
default, with `max_characters` 1–16,000. `truncated` says whether more stored
content remains, and `storedBytes` is the exact stored UTF-8 byte length. An
omitted false protobuf boolean may be absent in JSON; treat absent `truncated`
as false. The older `sizeBytes` field is coarse SQL-length information for a
bounded read; use `storedBytes` for exact size. The returned prefix preserves
literal stored text, including BOM/NUL. MIME type does not trigger base64
decoding, decompression or an external URL fetch. Encoded representations stay
encoded. This read is a prefix, without an offset/continuation API; increasing
the bound remains subject to the 16,000-point ceiling. Existing RPC clients that
omit `maxCharacters` retain their legacy full-read behavior.

The task's Evidence section shows **current mutable references**, not frozen
completion versions. Linking actor/time records who attached the output, not
who authored it. Older links have unknown provenance. Archived sources remain
readable where existing policy permits; unavailable sources have generic labels.
Read-only access keeps evidence visible with no write controls. Unlinking is
human-only; no unlink or folder-create MCP adapter is offered. The existing
CreateFolder RPC remains agent-capable with artifact-write scope. Evidence does
not complete a task, prove a build, or bypass existing review/approval rules.

## Limits and security

- **Every tool call is an ordinary RPC.** It is authenticated, scoped, logged
  and rate-limited exactly as if the agent had called the API itself. An MCP
  request also counts against the token's rate limit, so a `tools/call` spends
  two units of the budget (see [Rate limits](agent-integration.md#6-rate-limits)).
- Requests without a valid bearer token get `401`. Browser requests from an
  origin outside `CORS_ALLOWED_ORIGINS` get `403`.
- Not offered: resources, prompts, server-initiated streams and OAuth discovery.
  For live events use the event feed (`EventService.SubscribeEvents`).
