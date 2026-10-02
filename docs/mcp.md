# Connecting an MCP client

Tasker speaks the [Model Context Protocol](https://modelcontextprotocol.io), so
any MCP-capable agent can work a Tasker queue without a custom integration: find
work, claim it, record notes and handoffs, link follow-up tasks and search
shared memory. The tools run with exactly the permissions of the token you give
the client (M36, ADR-0029).

You need an **agent token** — see [Authenticating an agent](agent-integration.md).
Give it the scopes the agent's job needs; `tasks:read tasks:write comments:write`
covers the work loop, plus `memory:read` / `memory:write` for shared memory.

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
| `get_task_type` | A type's statuses and legal transitions | `GetTaskType` |
| `search_memory` | Search shared beliefs | `SearchBeliefs` |
| `record_belief` | Record a durable fact | `RecordBelief` |

Arguments are validated against each tool's published schema: a missing or
misspelt argument is a protocol error naming it. When the server refuses a call
— a missing scope, a task someone else holds, an illegal transition — the tool
result has `isError: true` and the server's own message, which a model can read
and act on.

## Limits and security

- **Every tool call is an ordinary RPC.** It is authenticated, scoped, logged
  and rate-limited exactly as if the agent had called the API itself. An MCP
  request also counts against the token's rate limit, so a `tools/call` spends
  two units of the budget (see [Rate limits](agent-integration.md#6-rate-limits)).
- Requests without a valid bearer token get `401`. Browser requests from an
  origin outside `CORS_ALLOWED_ORIGINS` get `403`.
- Not offered: resources, prompts, server-initiated streams and OAuth discovery.
  For live events use the event feed (`EventService.SubscribeEvents`).
