# CLI reference

Every command `tasker` accepts, with its flags, taken from the binary's own help
output (M12-T09) — so it is the tool describing itself rather than a second
account of it that drifts. CI fails when this file is stale (`cli:docs-check`).

Regenerate after adding or renaming a command or a flag — the script rewrites
everything from "Command reference" down and keeps this introduction:

```bash
cd apps/cli && go build -o tasker . && bash scripts/generate-cli-reference.sh
```

## Getting a session

Every command reads these environment variables as defaults, so a shell that
sets them once does not repeat itself:

| Variable | Meaning |
| --- | --- |
| `TASKER_BACKEND_URL` | Where the backend is (default `http://localhost:8080`) |
| `TASKER_ORG_ID` | The organization most commands act in |
| `TASKER_PROJECT_ID` | The project task commands act in |
| `TASKER_TOKEN` | An agent token, for a non-interactive caller |
| `TASKER_CREDENTIALS_PATH` | Where `tasker auth login` saves the session (default under the user config directory) |
| `TASKER_DEBUG` | Set to anything to log each failed RPC as JSON on stderr |

A person signs in once with `tasker auth login`, which opens a browser and
stores the session. An agent sets `TASKER_TOKEN` (or passes `--token`) and never
logs in at all — see [the agent integration guide](agent-integration.md). The
credential a command uses is the first of: `--token`, `TASKER_TOKEN`, the saved
session. `tasker auth whoami` reports on that same credential.

## Output, errors and exit codes

Written for scripts first (M31):

- **Results go to stdout, and nothing else does.** Prompts and login guidance
  go to stderr, so `$(tasker … --json)` captures exactly the result.
- **`--json`** is accepted by every command and prints the RPC response as
  one line of canonical protobuf JSON: lowerCamelCase field names, every
  non-optional field present (zero values included), 64-bit integers as
  strings. It is the same shape the backend speaks on the wire. The
  human-readable output is for reading and is not a stable interface.
- **A failure** prints exactly one `Error: …` line to stderr — ending in
  `(request <id>)` when the server was reached, the id the backend logged it
  under — prints nothing to stdout, and exits with a code that says what kind
  of failure it was:

| Exit | Meaning | What a script usually does |
| --- | --- | --- |
| 0 | Success | Continue |
| 1 | Anything else (bad flags, unexpected server error) | Stop and report |
| 3 | Not authenticated, or not permitted | Re-authenticate or stop |
| 4 | Not found | Skip it |
| 5 | Conflict or failed precondition — e.g. a claim another agent won | Pick other work |
| 6 | Invalid argument | Fix the request; retrying will not help |
| 7 | Unavailable, rate limited or timed out | Back off and retry |

## Pagination

Every list command takes `--limit` and `--cursor`. A page's `--json` output
carries `page.nextCursor` (empty on the last page); its text output ends with
the `--cursor` to pass for the next page.

`--page-all` walks every page from `--cursor` (or the start) and prints **one
JSON object per item per line** (NDJSON), so a list of any length can be
streamed into `jq -c`, `wc -l` or a loop without being held in memory:

```bash
tasker tasks list --project "$P" --assignee-filter unassigned --page-all \
  | jq -r .id
```

## Command reference

### `tasker agents`

```
Manage AI agent instances

Usage:
  tasker agents [command]

Available Commands:
  create      Create a new agent instance with specific role
  create-role Create an agent role persona in an organization (requires org admin)
  delete      Move an agent to the bin
  list        List active agents in an organization
  list-roles  List an organization's agent role personas
  purge       Permanently delete an already-binned, unassigned agent
  restore     Restore an agent from the bin
  update      Rename an agent or reassign it to a different role
  update-role Edit an agent role persona's name, system prompt, or capabilities

Flags:
  -h, --help   help for agents
```

#### `tasker agents create`

```
Create a new agent instance with specific role

Usage:
  tasker agents create [flags]

Flags:
  -h, --help          help for create
      --name string   Display name for the agent instance
      --org string    Organization ID (or set TASKER_ORG_ID)
      --role string   The agent role ID persona
```

#### `tasker agents create-role`

```
Create an agent role persona in an organization (requires org admin)

Usage:
  tasker agents create-role [flags]

Flags:
      --capabilities string    Capabilities/skills description for the role
  -h, --help                   help for create-role
      --name string            Role name
      --org string             Organization the role belongs to (required)
      --system-prompt string   System prompt for the role
```

#### `tasker agents delete`

```
Move an agent to the bin

Usage:
  tasker agents delete [agent_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker agents list`

```
List active agents in an organization

Usage:
  tasker agents list [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -f, --filter string   Substring match against agent name
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --only-deleted    List only agents in the bin, instead of active ones
      --org string      Organization ID (or set TASKER_ORG_ID)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
  -s, --sort string     Sort as "name" or "name:desc" (works with --cursor for paging)
```

#### `tasker agents list-roles`

```
List an organization's agent role personas

Usage:
  tasker agents list-roles [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -f, --filter string   Substring match against role name
  -h, --help            help for list-roles
  -l, --limit int32     Maximum number of items to return (default 50)
      --org string      Organization ID whose roles to list (required)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
  -s, --sort string     Sort as "name" or "name:desc" (works with --cursor for paging)
```

#### `tasker agents purge`

```
Permanently delete an already-binned, unassigned agent

Usage:
  tasker agents purge [agent_id] [flags]

Flags:
  -h, --help   help for purge
```

#### `tasker agents restore`

```
Restore an agent from the bin

Usage:
  tasker agents restore [agent_id] [flags]

Flags:
  -h, --help   help for restore
```

#### `tasker agents update`

```
Rename an agent or reassign it to a different role

Usage:
  tasker agents update [agent_id] [flags]

Flags:
  -h, --help          help for update
      --name string   New display name for the agent
      --role string   Reassign the agent to this role ID
```

#### `tasker agents update-role`

```
Edit an agent role persona's name, system prompt, or capabilities

Usage:
  tasker agents update-role [role_id] [flags]

Flags:
      --capabilities string    New capabilities/skills description for the role
  -h, --help                   help for update-role
      --name string            New role name
      --system-prompt string   New system prompt for the role
```

### `tasker artifacts`

```
Manage project evidence, text files, and generated assets

Usage:
  tasker artifacts [command]

Available Commands:
  create          Create a new artifact in a folder
  create-folder   Create a new folder in a project
  delete          Move an artifact to the bin
  delete-folder   Move a folder to the bin
  link-task       Link an artifact to a task, so the task detail view shows it as evidence
  list            List folders (--project) or artifacts within a folder (--folder)
  list-task-links List task-artifact links for a task (--task) or an artifact (--artifact)
  purge           Permanently delete an already-binned, unlinked artifact
  purge-folder    Permanently delete an already-binned, empty folder
  read            Read artifact content
  restore         Restore an artifact from the bin
  restore-folder  Restore a folder from the bin
  unlink-task     Remove a task-artifact link (the artifact itself is untouched)
  update-content  Replace an artifact's content (and optionally its content type)
  update-folder   Rename a folder

Flags:
  -h, --help   help for artifacts
```

#### `tasker artifacts create`

```
Create a new artifact in a folder

Usage:
  tasker artifacts create [flags]

Flags:
      --content string        Artifact text content
      --content-type string   MIME type of the content (default text/markdown, or auto-detected with --file)
      --description string    Artifact description
      --file string           Path to a local file to upload as the artifact's content (e.g. an image); base64-encoded automatically
      --folder string         Folder ID to create the artifact in
  -h, --help                  help for create
      --name string           Artifact name
```

#### `tasker artifacts create-folder`

```
Create a new folder in a project

Usage:
  tasker artifacts create-folder [flags]

Flags:
  -h, --help             help for create-folder
      --name string      Folder name
      --parent string    Parent folder ID (optional, for nesting)
      --project string   Project ID (or set TASKER_PROJECT_ID)
```

#### `tasker artifacts delete`

```
Move an artifact to the bin

Usage:
  tasker artifacts delete [artifact_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker artifacts delete-folder`

```
Move a folder to the bin

Usage:
  tasker artifacts delete-folder [folder_id] [flags]

Flags:
  -h, --help   help for delete-folder
```

#### `tasker artifacts link-task`

```
Link an artifact to a task, so the task detail view shows it as evidence

Usage:
  tasker artifacts link-task [flags]

Flags:
      --artifact string   Artifact ID to link
  -h, --help              help for link-task
      --task string       Task ID to link the artifact to
```

#### `tasker artifacts list`

```
List folders (--project) or artifacts within a folder (--folder)

Usage:
  tasker artifacts list [flags]

Flags:
  -c, --cursor string    Pagination cursor to fetch the next set
      --folder string    Folder ID to list artifacts within
  -h, --help             help for list
  -l, --limit int32      Maximum number of items to return (default 50)
      --only-deleted     List only archived (binned) folders/artifacts, instead of active ones
      --page-all         Fetch every page, printing one JSON object per item per line (NDJSON)
      --project string   Project ID to list folders for (or set TASKER_PROJECT_ID)
```

#### `tasker artifacts list-task-links`

```
List task-artifact links for a task (--task) or an artifact (--artifact)

Usage:
  tasker artifacts list-task-links [flags]

Flags:
      --artifact string   List links for this artifact
  -h, --help              help for list-task-links
      --task string       List links for this task
```

#### `tasker artifacts purge`

```
Permanently delete an already-binned, unlinked artifact

Usage:
  tasker artifacts purge [artifact_id] [flags]

Flags:
  -h, --help   help for purge
```

#### `tasker artifacts purge-folder`

```
Permanently delete an already-binned, empty folder

Usage:
  tasker artifacts purge-folder [folder_id] [flags]

Flags:
  -h, --help   help for purge-folder
```

#### `tasker artifacts read`

```
Read artifact content

Usage:
  tasker artifacts read [artifact_id] [flags]

Flags:
  -h, --help   help for read
```

#### `tasker artifacts restore`

```
Restore an artifact from the bin

Usage:
  tasker artifacts restore [artifact_id] [flags]

Flags:
  -h, --help   help for restore
```

#### `tasker artifacts restore-folder`

```
Restore a folder from the bin

Usage:
  tasker artifacts restore-folder [folder_id] [flags]

Flags:
  -h, --help   help for restore-folder
```

#### `tasker artifacts unlink-task`

```
Remove a task-artifact link (the artifact itself is untouched)

Usage:
  tasker artifacts unlink-task [flags]

Flags:
      --artifact string   Artifact ID to unlink
  -h, --help              help for unlink-task
      --task string       Task ID to unlink the artifact from
```

#### `tasker artifacts update-content`

```
Replace an artifact's content (and optionally its content type)

Usage:
  tasker artifacts update-content [artifact_id] [flags]

Flags:
      --content string        New artifact text content
      --content-type string   New MIME type of the content (auto-detected with --file, unchanged otherwise)
      --file string           Path to a local file whose contents replace the artifact's; base64-encoded automatically for binary types
  -h, --help                  help for update-content
```

#### `tasker artifacts update-folder`

```
Rename a folder

Usage:
  tasker artifacts update-folder [folder_id] [flags]

Flags:
  -h, --help          help for update-folder
      --name string   New folder name
```

### `tasker auth`

```
Authentication commands

Usage:
  tasker auth [command]

Available Commands:
  login        Login to the Tasker system via Google, or a local username and password
  logout       Remove the saved session credentials
  set-password Set or change your local password
  token        Manage agent API tokens
  whoami       Show the currently authenticated user

Flags:
  -h, --help   help for auth
```

#### `tasker auth login`

```
Login to the Tasker system via Google, or a local username and password

Usage:
  tasker auth login [flags]

Flags:
  -h, --help              help for login
      --password string   Password for --username (prompted, masked, if omitted)
      --username string   Local username - logs in with a password instead of Google
```

#### `tasker auth logout`

```
Remove the saved session credentials

Usage:
  tasker auth logout [flags]

Flags:
  -h, --help   help for logout
```

#### `tasker auth set-password`

```
Set or change your local password

Usage:
  tasker auth set-password [flags]

Flags:
      --current-password string   Required if the account already has a password
  -h, --help                      help for set-password
      --new-password string       Prompted, masked, if omitted
```

#### `tasker auth token`

```
Create, list and revoke the credentials an agent authenticates with.

A token is shown once, at creation, and stored only as a hash - there is
no way to retrieve it afterwards. Authenticate as the agent by exporting
TASKER_TOKEN, or by passing --token.

Usage:
  tasker auth token [command]

Available Commands:
  create      Issue a token for an agent (shown once)
  list        List an agent's tokens (never shows the secret)
  revoke      Revoke a token, effective on its next request

Flags:
  -h, --help   help for token
```

#### `tasker auth whoami`

```
Show the currently authenticated user

Usage:
  tasker auth whoami [flags]

Flags:
  -h, --help   help for whoami
```

### `tasker comment`

```
Manage comments on tasks and artifacts

Usage:
  tasker comment [command]

Available Commands:
  add         Add a new comment
  delete      Delete a comment (author only)
  list        List comments for an entity
  update      Update a comment's content (author only)

Flags:
  -h, --help   help for comment
```

#### `tasker comment add`

```
Add a new comment

Usage:
  tasker comment add [flags]

Flags:
      --content string   Markdown content of the comment
      --entity string    Entity ID (task or artifact ID)
  -h, --help             help for add
      --type string      Entity type (task or artifact) (default "task")
```

#### `tasker comment delete`

```
Delete a comment (author only)

Usage:
  tasker comment delete [comment_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker comment list`

```
List comments for an entity

Usage:
  tasker comment list [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
      --entity string   Entity ID
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
      --type string     Entity type (default "task")
```

#### `tasker comment update`

```
Update a comment's content (author only)

Usage:
  tasker comment update [comment_id] [flags]

Flags:
      --content string   New markdown content of the comment
  -h, --help             help for update
```

### `tasker debug`

```
Debugging helpers for local development

Usage:
  tasker debug [command]

Available Commands:
  session     Decode and validate a session token

Flags:
  -h, --help   help for debug
```

#### `tasker debug session`

```
Decodes a session token's claims locally and checks with the backend whether it's
currently valid (not expired, not revoked). Defaults to the credential every other
command would use (--token, TASKER_TOKEN, then the saved session). Exits 3 if invalid.

Usage:
  tasker debug session [token] [flags]

Flags:
  -h, --help   help for session
```

### `tasker labels`

```
Manage labels and attach them to tasks or artifacts

Usage:
  tasker labels [command]

Available Commands:
  attach      Attach a label to a task or artifact
  create      Create a new label in an organization
  detach      Detach a label from a task or artifact
  list        List labels defined in an organization
  on          List labels attached to a task or artifact

Flags:
  -h, --help   help for labels
```

#### `tasker labels attach`

```
Attach a label to a task or artifact

Usage:
  tasker labels attach [entity_id] [flags]

Flags:
      --entity-type string   Entity type: task or artifact
  -h, --help                 help for attach
      --label string         Label ID to attach
```

#### `tasker labels create`

```
Create a new label in an organization

Usage:
  tasker labels create [flags]

Flags:
      --color string   Label color (e.g. hex code)
  -h, --help           help for create
      --name string    Label name
      --org string     Organization ID (or set TASKER_ORG_ID)
```

#### `tasker labels detach`

```
Detach a label from a task or artifact

Usage:
  tasker labels detach [entity_id] [flags]

Flags:
      --entity-type string   Entity type: task or artifact
  -h, --help                 help for detach
      --label string         Label ID to detach
```

#### `tasker labels list`

```
List labels defined in an organization

Usage:
  tasker labels list [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -f, --filter string   Substring match against label name
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --org string      Organization ID (or set TASKER_ORG_ID)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
  -s, --sort string     Sort as "name" or "name:desc" (works with --cursor for paging)
```

#### `tasker labels on`

```
List labels attached to a task or artifact

Usage:
  tasker labels on [entity_id] [flags]

Flags:
      --entity-type string   Entity type: task or artifact
  -h, --help                 help for on
```

### `tasker mcp`

```
Relays Model Context Protocol messages between stdin/stdout (newline-delimited JSON-RPC)
and the backend's /mcp endpoint, authenticated as TASKER_TOKEN or the saved login. Point an
MCP client at the command `tasker mcp`; clients that speak HTTP can use <backend>/mcp
directly. Nothing but protocol messages is written to stdout.

Usage:
  tasker mcp [flags]

Flags:
  -h, --help   help for mcp
```

### `tasker memory`

```
Record, search, and manage shared beliefs (M21)

Usage:
  tasker memory [command]

Available Commands:
  archive         Archive a belief, moving it to the bin (requires memory:admin, human-only)
  get             Get a single belief by id
  list            List beliefs at a scope, with pagination (audit/browse - prefer `memory search` to find something)
  list-promotions List a belief's promotion history
  list-relations  List a belief's related beliefs
  promote         Promote a belief to a wider scope, with an audit trail (requires memory:admin, human-only)
  purge           Permanently delete an archived belief (requires memory:admin, human-only)
  record          Record a new belief at a scope (requires memory:write)
  relate          Link two beliefs together (requires memory:write on both)
  restore         Restore an archived belief (requires memory:admin, human-only)
  search          Search beliefs at a scope, ranked by relevance (primary way to read shared memory)
  supersede       Record a replacement belief and mark the old one superseded (requires memory:write)
  unrelate        Remove a relation between two beliefs (requires memory:write on both)
  update          Update a belief's statement or confidence (requires memory:write)

Flags:
  -h, --help   help for memory
```

#### `tasker memory archive`

```
Archive a belief, moving it to the bin (requires memory:admin, human-only)

Usage:
  tasker memory archive [belief_id] [flags]

Flags:
  -h, --help   help for archive
```

#### `tasker memory get`

```
Get a single belief by id

Usage:
  tasker memory get [belief_id] [flags]

Flags:
  -h, --help   help for get
```

#### `tasker memory list`

```
List beliefs at a scope, with pagination (audit/browse - prefer `memory search` to find something)

Usage:
  tasker memory list [flags]

Flags:
      --confidence string   Filter by confidence: low, medium, or high
  -c, --cursor string       Pagination cursor to fetch the next set
  -h, --help                help for list
  -l, --limit int32         Maximum number of items to return (default 50)
      --page-all            Fetch every page, printing one JSON object per item per line (NDJSON)
      --scope-id string     Scope id (or TASKER_PROJECT_ID/TASKER_ORG_ID for project/organization scope)
      --scope-type string   Scope type: project, team, or organization (default "project")
      --status string       Filter by status: active, superseded, or retracted
```

#### `tasker memory list-promotions`

```
List a belief's promotion history

Usage:
  tasker memory list-promotions [belief_id] [flags]

Flags:
  -h, --help   help for list-promotions
```

#### `tasker memory list-relations`

```
List a belief's related beliefs

Usage:
  tasker memory list-relations [belief_id] [flags]

Flags:
  -h, --help   help for list-relations
```

#### `tasker memory promote`

```
Promote a belief to a wider scope, with an audit trail (requires memory:admin, human-only)

Usage:
  tasker memory promote [belief_id] [flags]

Flags:
  -h, --help                   help for promote
      --note string            Why this belief applies beyond its current scope
      --to-scope-id string     Destination scope id
      --to-scope-type string   Destination scope type: project, team, or organization
```

#### `tasker memory purge`

```
Permanently delete an archived belief (requires memory:admin, human-only)

Usage:
  tasker memory purge [belief_id] [flags]

Flags:
  -h, --help   help for purge
```

#### `tasker memory record`

```
Record a new belief at a scope (requires memory:write)

Usage:
  tasker memory record [statement] [flags]

Flags:
      --confidence string        Confidence: low, medium, or high (default: medium)
  -h, --help                     help for record
      --org string               Organization id (or set TASKER_ORG_ID)
      --scope-id string          Scope id (or TASKER_PROJECT_ID/TASKER_ORG_ID for project/organization scope)
      --scope-type string        Scope type: project, team, or organization (default "project")
      --source-artifact string   Artifact id this belief was captured from
      --source-comment string    Comment id this belief was captured from
      --source-note string       Task note id this belief was captured from
      --source-task string       Task id this belief was captured from
```

#### `tasker memory relate`

```
Link two beliefs together (requires memory:write on both)

Usage:
  tasker memory relate [belief_a_id] [belief_b_id] [flags]

Flags:
  -h, --help          help for relate
      --type string   Relation type: relates_to, supports, contradicts, or duplicates (default "relates_to")
```

#### `tasker memory restore`

```
Restore an archived belief (requires memory:admin, human-only)

Usage:
  tasker memory restore [belief_id] [flags]

Flags:
  -h, --help   help for restore
```

#### `tasker memory search`

```
Search beliefs at a scope, ranked by relevance (primary way to read shared memory)

Usage:
  tasker memory search [query] [flags]

Flags:
      --confidence string   Filter by confidence: low, medium, or high
  -h, --help                help for search
      --limit int32         Maximum number of results (server default if unset)
      --scope-id string     Scope id (or TASKER_PROJECT_ID/TASKER_ORG_ID for project/organization scope)
      --scope-type string   Scope type: project, team, or organization (default "project")
      --status string       Filter by status: active, superseded, or retracted (default: active)
      --task string         Filter to beliefs captured from this task id
```

#### `tasker memory supersede`

```
Record a replacement belief and mark the old one superseded (requires memory:write)

Usage:
  tasker memory supersede [belief_id] [statement] [flags]

Flags:
      --confidence string        Confidence of the replacement: low, medium, or high
  -h, --help                     help for supersede
      --source-artifact string   Artifact id the replacement was captured from
      --source-comment string    Comment id the replacement was captured from
      --source-note string       Task note id the replacement was captured from
      --source-task string       Task id the replacement was captured from
```

#### `tasker memory unrelate`

```
Remove a relation between two beliefs (requires memory:write on both)

Usage:
  tasker memory unrelate [relation_id] [flags]

Flags:
  -h, --help   help for unrelate
```

#### `tasker memory update`

```
Update a belief's statement or confidence (requires memory:write)

Usage:
  tasker memory update [belief_id] [flags]

Flags:
      --confidence string   New confidence: low, medium, or high
  -h, --help                help for update
      --statement string    New statement text
```

### `tasker orgs`

```
Manage organizations

Usage:
  tasker orgs [command]

Available Commands:
  delete        Move an organization to the bin (requires org admin)
  invite        Invite a user to an organization by email or username
  leave         Leave an organization (the last owner cannot leave)
  list          List organizations with pagination, name filtering, and sorting
  list-invites  List outstanding invitations for an organization (requires org admin)
  purge         Permanently delete an already-binned, empty organization (requires org admin)
  restore       Restore an organization from the bin (requires org admin)
  revoke-invite Withdraw an outstanding invitation (requires org admin)
  seed          Bootstrap a new organization (or sub-organization) - typically the first setup step
  set-retention Set how many days archived items stay in the bin before auto-purge (requires org admin)
  set-role      Change a member's role in an organization (owner|admin|member|viewer, requires org admin)

Flags:
  -h, --help   help for orgs
```

#### `tasker orgs delete`

```
Move an organization to the bin (requires org admin)

Usage:
  tasker orgs delete [org_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker orgs invite`

```
Invite a user to an organization by email or username

Usage:
  tasker orgs invite [org_id] [flags]

Flags:
      --email string      Email address to invite (exactly one of --email/--username)
  -h, --help              help for invite
      --role string       Role the invitee gets on accept: admin, member, or viewer (defaults to member)
      --username string   Local username to invite (exactly one of --email/--username)
```

#### `tasker orgs leave`

```
Leave an organization (the last owner cannot leave)

Usage:
  tasker orgs leave [org_id] [flags]

Flags:
  -h, --help   help for leave
```

#### `tasker orgs list`

```
List organizations with pagination, name filtering, and sorting

Usage:
  tasker orgs list [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -f, --filter string   Substring match against organization name
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
  -s, --sort string     Sort as "name" or "name:desc" (works with --cursor for paging)
```

#### `tasker orgs list-invites`

```
List outstanding invitations for an organization (requires org admin)

Usage:
  tasker orgs list-invites [org_id] [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for list-invites
  -l, --limit int32     Maximum number of items to return (default 50)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
```

#### `tasker orgs purge`

```
Permanently delete an already-binned, empty organization (requires org admin)

Usage:
  tasker orgs purge [org_id] [flags]

Flags:
  -h, --help   help for purge
```

#### `tasker orgs restore`

```
Restore an organization from the bin (requires org admin)

Usage:
  tasker orgs restore [org_id] [flags]

Flags:
  -h, --help   help for restore
```

#### `tasker orgs revoke-invite`

```
Withdraw an outstanding invitation (requires org admin)

Usage:
  tasker orgs revoke-invite [invitation_id] [flags]

Flags:
  -h, --help   help for revoke-invite
```

#### `tasker orgs seed`

```
Bootstrap a new organization (or sub-organization) - typically the first setup step

Usage:
  tasker orgs seed [flags]

Flags:
  -h, --help            help for seed
      --name string     Organization name
      --parent string   Optional parent organization ID, to create a sub-organization
      --slug string     Organization slug (unique, URL-safe)
```

#### `tasker orgs set-retention`

```
Set how many days archived items stay in the bin before auto-purge (requires org admin)

Usage:
  tasker orgs set-retention [org_id] [flags]

Flags:
      --days int32   Number of days before archived items are automatically purged (default 30)
  -h, --help         help for set-retention
```

#### `tasker orgs set-role`

```
Change a member's role in an organization (owner|admin|member|viewer, requires org admin)

Usage:
  tasker orgs set-role [org_id] [user_id] [flags]

Flags:
  -h, --help          help for set-role
      --role string   New role: owner, admin, member, or viewer
```

### `tasker ping`

```
Ping the backend health service

Usage:
  tasker ping [flags]

Flags:
  -h, --help   help for ping
```

### `tasker project-templates`

```
Manage project templates

Usage:
  tasker project-templates [command]

Available Commands:
  create      Create a project template for an organization
  get         Show a project template
  list        List project templates for an organization
  update      Update a project template's name, description, or root task type

Flags:
  -h, --help   help for project-templates
```

#### `tasker project-templates create`

```
Create a project template for an organization

Usage:
  tasker project-templates create [flags]

Flags:
      --description string      Project template description
  -h, --help                    help for create
      --name string             Project template name
      --org string              Organization ID (or set TASKER_ORG_ID)
      --root-task-type string   Optional root task type ID for this template
```

#### `tasker project-templates get`

```
Show a project template

Usage:
  tasker project-templates get [template_id] [flags]

Flags:
  -h, --help   help for get
```

#### `tasker project-templates list`

```
List project templates for an organization

Usage:
  tasker project-templates list [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -f, --filter string   Substring match against template name
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --org string      Organization ID (or set TASKER_ORG_ID)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
  -s, --sort string     Sort as "name" or "name:desc" (works with --cursor for paging)
```

#### `tasker project-templates update`

```
Update a project template's name, description, or root task type

Usage:
  tasker project-templates update [template_id] [flags]

Flags:
      --description string      New description (pass an empty string to clear it)
  -h, --help                    help for update
      --name string             New template name
      --root-task-type string   New root task type ID (pass an empty string to clear it)
```

### `tasker projects`

```
Manage projects derived from templates

Usage:
  tasker projects [command]

Available Commands:
  create      Instantiate a new project from a template
  delete      Move a project to the bin (requires org admin)
  get         Get a specific project
  list        List all projects in an organization
  purge       Permanently delete an already-binned, empty project (requires org admin)
  restore     Restore a project from the bin (requires org admin)
  update      Update a project's title or description

Flags:
  -h, --help   help for projects
```

#### `tasker projects create`

```
Instantiate a new project from a template

Usage:
  tasker projects create [flags]

Flags:
      --description string   Project description
  -h, --help                 help for create
      --org string           Organization ID (or set TASKER_ORG_ID)
      --owner string         User ID of the project owner (required)
      --template string      Project template to inherit from
      --title string         Descriptive title for the new project
```

#### `tasker projects delete`

```
Move a project to the bin (requires org admin)

Usage:
  tasker projects delete [project_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker projects get`

```
Get a specific project

Usage:
  tasker projects get [id] [flags]

Flags:
  -h, --help   help for get
```

#### `tasker projects list`

```
List all projects in an organization

Usage:
  tasker projects list [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -f, --filter string   Substring match against project name
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --only-deleted    List only archived (binned) projects, instead of active ones
      --org string      Organization ID (or set TASKER_ORG_ID)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
  -s, --sort string     Sort as "name" or "name:desc" (works with --cursor for paging)
```

#### `tasker projects purge`

```
Permanently delete an already-binned, empty project (requires org admin)

Usage:
  tasker projects purge [project_id] [flags]

Flags:
  -h, --help   help for purge
```

#### `tasker projects restore`

```
Restore a project from the bin (requires org admin)

Usage:
  tasker projects restore [project_id] [flags]

Flags:
  -h, --help   help for restore
```

#### `tasker projects update`

```
Update a project's title or description

Usage:
  tasker projects update [project_id] [flags]

Flags:
      --description string   New description (pass an empty string to clear it)
  -h, --help                 help for update
      --title string         New project title (required)
```

### `tasker repo`

```
Manage repository integrations and pull requests

Usage:
  tasker repo [command]

Available Commands:
  builds      List CI builds for a repository link
  deployments List deployments for a build's commit (GitHub deployments are keyed by commit sha, not by CI run)
  link        Link a new repository to a project, via an OAuth authorization code or a direct API token
  list        List repository links for a project
  prs         List synced pull requests for a project
  sync        Sync pull requests from linked repositories

Flags:
  -h, --help   help for repo
```

#### `tasker repo builds`

```
List CI builds for a repository link

Usage:
  tasker repo builds [repository_link_id] [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for builds
  -l, --limit int32     Maximum number of items to return (default 50)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
```

#### `tasker repo deployments`

```
List deployments for a build's commit (GitHub deployments are keyed by commit sha, not by CI run)

Usage:
  tasker repo deployments [build_id] [flags]

Flags:
      --commit repo builds   Commit SHA to look up deployments for (from repo builds)
  -h, --help                 help for deployments
      --link repo list       Repository link ID (from repo list)
```

#### `tasker repo link`

```
Link a new repository to a project, via an OAuth authorization code or a direct API token

Usage:
  tasker repo link [flags]

Flags:
      --api-token string    A direct API token, as an alternative to --oauth-code (a GitHub personal access token, or a Bitbucket Atlassian API token)
      --email string        Bitbucket only: the Atlassian account email paired with --api-token
  -h, --help                help for link
      --oauth-code string   OAuth authorization code obtained from the provider's consent screen
      --project string      Project ID (or set TASKER_PROJECT_ID)
      --provider string     Provider (e.g. github, bitbucket) (default "github")
      --remote string       Remote repository name
```

#### `tasker repo list`

```
List repository links for a project

Usage:
  tasker repo list [flags]

Flags:
  -c, --cursor string    Pagination cursor to fetch the next set
  -h, --help             help for list
  -l, --limit int32      Maximum number of items to return (default 50)
      --page-all         Fetch every page, printing one JSON object per item per line (NDJSON)
      --project string   Project ID (or set TASKER_PROJECT_ID)
```

#### `tasker repo prs`

```
List synced pull requests for a project

Usage:
  tasker repo prs [flags]

Flags:
  -h, --help             help for prs
      --project string   Project ID (or set TASKER_PROJECT_ID)
```

#### `tasker repo sync`

```
Sync pull requests from linked repositories

Usage:
  tasker repo sync [flags]

Flags:
  -h, --help             help for sync
      --project string   Project ID (or set TASKER_PROJECT_ID)
```

### `tasker reports`

```
Supervision reports (people only)

Usage:
  tasker reports [command]

Available Commands:
  usage       Agent spend over the last N days, by agent, project and day

Flags:
  -h, --help   help for reports
```

#### `tasker reports usage`

```
Agent spend over the last N days, by agent, project and day

Usage:
  tasker reports usage [flags]

Flags:
      --days int32       Window in days, 1-365 (default 30)
  -h, --help             help for usage
      --org string       Organization (or set TASKER_ORG_ID)
      --project string   Only this project
```

### `tasker search`

```
Search tasks and artifacts across an organization

Usage:
  tasker search [query] [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for search
  -l, --limit int32     Maximum number of items to return (default 20)
      --org string      Organization ID (or set TASKER_ORG_ID)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
```

### `tasker task-types`

```
Manage task types and their status enum / transition state machine

Usage:
  tasker task-types [command]

Available Commands:
  create            Create a task type for an organization (optionally scoped to a project)
  create-status     Add a status to a task type's enum
  create-transition Allow a status transition (edge) in a task type's state machine
  gate-transition   Require a person's approval when an agent makes this move (--off to lift it)
  get               Show a task type along with its configured statuses and transitions
  list              List task types for an organization

Flags:
  -h, --help   help for task-types
```

#### `tasker task-types create`

```
Create a task type for an organization (optionally scoped to a project)

Usage:
  tasker task-types create [flags]

Flags:
  -h, --help             help for create
      --name string      Task type name
      --org string       Organization ID (or set TASKER_ORG_ID)
      --parent string    Optional parent task type ID, for building a task type hierarchy
      --project string   Optional project ID to scope this type to (or set TASKER_PROJECT_ID)
```

#### `tasker task-types create-status`

```
Add a status to a task type's enum

Usage:
  tasker task-types create-status [task_type_id] [flags]

Flags:
  -h, --help          help for create-status
      --name string   Status name (e.g. open, in_review, closed)
```

#### `tasker task-types create-transition`

```
Allow a status transition (edge) in a task type's state machine

Usage:
  tasker task-types create-transition [task_type_id] [flags]

Flags:
      --from string   Status ID this transition starts from
  -h, --help          help for create-transition
      --to string     Status ID this transition ends at
```

#### `tasker task-types gate-transition`

```
Require a person's approval when an agent makes this move (--off to lift it)

Usage:
  tasker task-types gate-transition [task_type_id] [transition_id] [flags]

Flags:
  -h, --help   help for gate-transition
      --off    Lift the gate instead of setting it
```

#### `tasker task-types get`

```
Show a task type along with its configured statuses and transitions

Usage:
  tasker task-types get [task_type_id] [flags]

Flags:
  -h, --help   help for get
```

#### `tasker task-types list`

```
List task types for an organization

Usage:
  tasker task-types list [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -f, --filter string   Substring match against task type name
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --org string      Organization ID (or set TASKER_ORG_ID)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
  -s, --sort string     Sort as "name" or "name:desc" (works with --cursor for paging)
```

### `tasker tasks`

```
Workbench for tasks and autonomous agents

Usage:
  tasker tasks [command]

Available Commands:
  answer                Answer a question an agent asked (people only)
  approval              Show one approval request and, once made, its decision
  approvals             Status changes waiting on a person's approval - the organization's queue, or one task's
  approve               Approve an agent's held status change; it is applied as you (people only)
  ask                   Ask a person a question on a task; its reviewers (or org admins) are notified
  assign                Assign a task to an agent or user
  cancel-question       Withdraw a question you asked (or, as an admin, close any)
  claim                 Atomically claim an unassigned task for the calling principal (agent self-service)
  claim-next            Claim the most important ready task in a project (agent self-service)
  comment-add           Add a comment to a task
  comments              List comments on a task
  compaction-candidates A project's finished tasks with no summary, oldest first
  create                Create a new task in a project
  delete                Move a task to the bin (soft delete; requires org admin)
  digest                One bounded read of a task: summary, plan, usage, latest handoff, answered questions, relations
  get                   Get a single task, including its description
  handoffs              List tasks with a pending handoff note (one row per task, the latest only)
  link                  Blocking and discovered-from links between tasks
  list                  List tasks within a project
  mine                  List the open tasks you hold, across every project in the organization
  note-add              Add an AI agent note to a task (requires an agent token)
  note-delete           Delete an agent note (author only, requires an agent token)
  note-update           Update an agent note's content (author only, requires an agent token)
  notes                 List AI agent notes on a task
  plan                  Show or replace the working agent's plan for a task
  purge                 Permanently delete an already-binned task and its dependent records (requires org admin)
  question              Show one question and, once given, its answer
  questions             Questions waiting on people - the organization's queue, or one task's
  reject                Reject an agent's held status change; the task stays where it is (people only)
  release               Give back a task you claimed, optionally leaving a handoff note
  restore               Restore a task from the bin (requires org admin)
  reviewer-add          Add a reviewer to a task
  reviewer-remove       Remove a reviewer from a task
  reviewers             List a task's reviewers
  summary               A task's durable summary - what it came to
  unassign              Remove an agent or user's assignment from a task
  update                Update a task's title, description, type, priority or parent
  update-status         Update a task's status
  usage                 Tokens and cost reported against a task

Flags:
  -h, --help   help for tasks
```

#### `tasker tasks answer`

```
Answer a question an agent asked (people only)

Usage:
  tasker tasks answer [question_id] [flags]

Flags:
      --answer string   Your answer
  -h, --help            help for answer
```

#### `tasker tasks approval`

```
Show one approval request and, once made, its decision

Usage:
  tasker tasks approval [approval_id] [flags]

Flags:
  -h, --help   help for approval
```

#### `tasker tasks approvals`

```
Status changes waiting on a person's approval - the organization's queue, or one task's

Usage:
  tasker tasks approvals [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for approvals
  -l, --limit int32     Maximum number of items to return (default 50)
      --org string      Organization (or set TASKER_ORG_ID; an agent's is implied)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
      --status string   pending (default), approved, rejected, stale or all
      --task string     Only this task's approvals
```

#### `tasker tasks approve`

```
Approve an agent's held status change; it is applied as you (people only)

Usage:
  tasker tasks approve [approval_id] [flags]

Flags:
  -h, --help            help for approve
      --reason string   Optional note recorded with the decision
```

#### `tasker tasks ask`

```
Ask a person a question on a task; its reviewers (or org admins) are notified

Usage:
  tasker tasks ask [task_id] [flags]

Flags:
  -h, --help                 help for ask
      --option stringArray   A suggested answer; repeat for each (at most 10)
      --question string      What you need decided
```

#### `tasker tasks assign`

```
Assign a task to an agent or user

Usage:
  tasker tasks assign [task_id] [flags]

Flags:
      --agent string   Agent ID to assign
  -h, --help           help for assign
      --user string    User ID to assign
```

#### `tasker tasks cancel-question`

```
Withdraw a question you asked (or, as an admin, close any)

Usage:
  tasker tasks cancel-question [question_id] [flags]

Flags:
  -h, --help   help for cancel-question
```

#### `tasker tasks claim`

```
Atomically claim an unassigned task for the calling principal (agent self-service)

Usage:
  tasker tasks claim [task_id] [flags]

Flags:
  -h, --help                     help for claim
      --idempotency-key string   Optional key: replaying the same key from the same principal returns the original claim instead of erroring on an already-claimed task
```

#### `tasker tasks claim-next`

```
Claims the highest-priority ready task - open, unassigned, nothing unfinished blocking it,
oldest within its priority - for the calling principal, in one
call - no list-then-claim race. With nothing to claim it prints nothing and exits 0; with
--json it prints an object with no "task". A prior handoff note on the task is shown.

Usage:
  tasker tasks claim-next [flags]

Flags:
  -h, --help                     help for claim-next
      --idempotency-key string   Optional key: a retry with the same key returns the original claim instead of claiming another task
      --label string             Only tasks carrying this label ID
  -p, --project string           Project to take work from (or set TASKER_PROJECT_ID)
      --type string              Only tasks of this task type ID
```

#### `tasker tasks comment-add`

```
Add a comment to a task

Usage:
  tasker tasks comment-add [task_id] [flags]

Flags:
      --content string   Comment text
  -h, --help             help for comment-add
```

#### `tasker tasks comments`

```
List comments on a task

Usage:
  tasker tasks comments [task_id] [flags]

Flags:
  -h, --help   help for comments
```

#### `tasker tasks compaction-candidates`

```
A project's finished tasks with no summary, oldest first

Usage:
  tasker tasks compaction-candidates [flags]

Flags:
  -h, --help                    help for compaction-candidates
  -l, --limit int32             Maximum number of tasks to return, 1-100 (default 50)
      --older-than-days int32   Finished at least this many days ago, 0-3650 (default 30)
      --project string          Project ID (or set TASKER_PROJECT_ID)
```

#### `tasker tasks create`

```
Create a new task in a project

Usage:
  tasker tasks create [flags]

Flags:
      --blocked-by strings       Task IDs that must finish first (repeat or comma-separate)
      --description string       Task description
      --discovered-from string   The task whose work turned this one up
  -h, --help                     help for create
      --idempotency-key string   Optional key: replaying the same key from the same principal returns the original task instead of creating a second one
      --parent string            Parent task ID in the same project
      --priority string          urgent, high, medium, low or none (default none)
      --project string           Project ID (or set TASKER_PROJECT_ID)
      --status string            Initial status
      --task-type string         Optional task type ID; enforces that type's status enum/transitions if configured
      --title string             The title of the task
```

#### `tasker tasks delete`

```
Move a task to the bin (soft delete; requires org admin)

Usage:
  tasker tasks delete [task_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker tasks digest`

```
One bounded read of a task: summary, plan, usage, latest handoff, answered questions, relations

Usage:
  tasker tasks digest [task_id] [flags]

Flags:
  -h, --help   help for digest
```

#### `tasker tasks get`

```
Get a single task, including its description

Usage:
  tasker tasks get [task_id] [flags]

Flags:
  -h, --help   help for get
```

#### `tasker tasks handoffs`

```
List tasks with a pending handoff note (one row per task, the latest only)

Usage:
  tasker tasks handoffs [flags]

Flags:
      --cursor string    Page cursor from a previous response
  -h, --help             help for handoffs
      --limit int32      Max rows to return
      --page-all         Fetch every page, printing one JSON object per item per line (NDJSON)
      --project string   Project ID (or set TASKER_PROJECT_ID)
```

#### `tasker tasks link`

```
Blocking and discovered-from links between tasks

Usage:
  tasker tasks link [command]

Available Commands:
  add         Record that a task is blocked by (or was discovered from) another
  list        Show a task's blockers, dependents, parent, subtasks and origin
  remove      Remove a blocking or discovered-from link

Flags:
  -h, --help   help for link
```

#### `tasker tasks list`

```
List tasks within a project

Usage:
  tasker tasks list [flags]

Flags:
      --assignee-filter string   "unassigned" for claimable work, or "me" to resolve to the calling principal
  -c, --cursor string            Pagination cursor to fetch the next set
  -f, --filter string            Substring match against task title
  -h, --help                     help for list
      --label string             Only tasks carrying this label ID
  -l, --limit int32              Maximum number of items to return (default 50)
      --only-deleted             List only binned (soft-deleted) tasks, instead of active ones
      --page-all                 Fetch every page, printing one JSON object per item per line (NDJSON)
      --parent string            Only subtasks of this task ID
      --priority string          Only tasks of this priority (urgent, high, medium, low, none)
      --project string           Project ID (or set TASKER_PROJECT_ID)
      --ready                    Only ready work: open, unassigned, nothing unfinished blocking it
  -s, --sort string              Sort as "title"/"status"/"priority" or "title:desc" (works with --cursor for paging); "priority" is urgent first
      --status string            Filter to one status column (e.g. todo, in-progress, done, or a custom task-type status)
```

#### `tasker tasks mine`

```
List the open tasks you hold, across every project in the organization

Usage:
  tasker tasks mine [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for mine
      --include-done    Include tasks in a terminal status
  -l, --limit int32     Maximum number of items to return (default 50)
      --org string      Organization ID (people only - an agent's token names its org; or set TASKER_ORG_ID)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
```

#### `tasker tasks note-add`

```
Add an AI agent note to a task (requires an agent token)

Usage:
  tasker tasks note-add [task_id] [flags]

Flags:
      --content string   Note text
  -h, --help             help for note-add
      --type string      Note type: comment (default) or handoff
```

#### `tasker tasks note-delete`

```
Delete an agent note (author only, requires an agent token)

Usage:
  tasker tasks note-delete [note_id] [flags]

Flags:
  -h, --help   help for note-delete
```

#### `tasker tasks note-update`

```
Update an agent note's content (author only, requires an agent token)

Usage:
  tasker tasks note-update [note_id] [flags]

Flags:
      --content string   New note text
  -h, --help             help for note-update
```

#### `tasker tasks notes`

```
List AI agent notes on a task

Usage:
  tasker tasks notes [task_id] [flags]

Flags:
  -h, --help   help for notes
```

#### `tasker tasks plan`

```
Show or replace the working agent's plan for a task

Usage:
  tasker tasks plan [command]

Available Commands:
  set         Replace a task's plan with the given steps (no steps clears it)
  show        Show a task's plan

Flags:
  -h, --help   help for plan
```

#### `tasker tasks purge`

```
Permanently delete an already-binned task and its dependent records (requires org admin)

Usage:
  tasker tasks purge [task_id] [flags]

Flags:
  -h, --help   help for purge
```

#### `tasker tasks question`

```
Show one question and, once given, its answer

Usage:
  tasker tasks question [question_id] [flags]

Flags:
  -h, --help   help for question
```

#### `tasker tasks questions`

```
Questions waiting on people - the organization's queue, or one task's

Usage:
  tasker tasks questions [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for questions
  -l, --limit int32     Maximum number of items to return (default 50)
      --org string      Organization (or set TASKER_ORG_ID; an agent's is implied)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
      --status string   open (default), answered, cancelled or all
      --task string     Only this task's questions
```

#### `tasker tasks reject`

```
Reject an agent's held status change; the task stays where it is (people only)

Usage:
  tasker tasks reject [approval_id] [flags]

Flags:
  -h, --help            help for reject
      --reason string   Why - the agent is told
```

#### `tasker tasks release`

```
Releases a task the caller holds by its own claim, so another agent can take it. With
--handoff the note is recorded first, and the next claimant receives it. A task a person
assigned to you cannot be released this way (exit 3); ask them to unassign it.

Usage:
  tasker tasks release [task_id] [flags]

Flags:
      --handoff string   A handoff note to record before releasing: what you tried, what is blocked, the next step
  -h, --help             help for release
```

#### `tasker tasks restore`

```
Restore a task from the bin (requires org admin)

Usage:
  tasker tasks restore [task_id] [flags]

Flags:
  -h, --help   help for restore
```

#### `tasker tasks reviewer-add`

```
Add a reviewer to a task

Usage:
  tasker tasks reviewer-add [task_id] [flags]

Flags:
  -h, --help          help for reviewer-add
      --user string   User ID to add as reviewer
```

#### `tasker tasks reviewer-remove`

```
Remove a reviewer from a task

Usage:
  tasker tasks reviewer-remove [task_id] [flags]

Flags:
  -h, --help          help for reviewer-remove
      --user string   User ID to remove as reviewer
```

#### `tasker tasks reviewers`

```
List a task's reviewers

Usage:
  tasker tasks reviewers [task_id] [flags]

Flags:
  -h, --help   help for reviewers
```

#### `tasker tasks summary`

```
A task's durable summary - what it came to

Usage:
  tasker tasks summary [command]

Available Commands:
  clear       Remove a task's summary
  set         Write a task's summary (at most 4,000 characters; replaces the last one)

Flags:
  -h, --help   help for summary
```

#### `tasker tasks unassign`

```
Remove an agent or user's assignment from a task

Usage:
  tasker tasks unassign [task_id] [flags]

Flags:
      --agent string   Agent ID to unassign
  -h, --help           help for unassign
      --user string    User ID to unassign
```

#### `tasker tasks update`

```
Update a task's title, description, type, priority or parent

Usage:
  tasker tasks update [task_id] [flags]

Flags:
      --description string   New description (pass an empty string to clear it)
  -h, --help                 help for update
      --parent string        New parent task ID (pass an empty string to clear it)
      --priority string      urgent, high, medium, low or none
      --task-type string     New task type ID
      --title string         New title
```

#### `tasker tasks update-status`

```
Update a task's status

Usage:
  tasker tasks update-status [task_id] [flags]

Flags:
  -h, --help            help for update-status
      --status string   The new status (todo, in-progress, done)
```

#### `tasker tasks usage`

```
Tokens and cost reported against a task

Usage:
  tasker tasks usage [command]

Available Commands:
  report      Report the tokens and cost a piece of work on a task took (idempotent with --idempotency-key)
  show        A task's usage reports, newest first, with its totals

Flags:
  -h, --help   help for usage
```

### `tasker teams`

```
Manage teams (M10)

Usage:
  tasker teams [command]

Available Commands:
  add-member    Add a member to a team (requires team:write)
  create        Create a team in an organization (requires team:write)
  delete        Move a team to the bin (requires team:admin)
  list          List teams in an organization, with pagination
  list-members  List a team's members, with pagination
  remove-member Remove a member from a team (requires team:write)
  rename        Rename a team (requires team:write)
  restore       Restore a team from the bin (requires team:admin)

Flags:
  -h, --help   help for teams
```

#### `tasker teams add-member`

```
Add a member to a team (requires team:write)

Usage:
  tasker teams add-member [team_id] [user_id] [flags]

Flags:
  -h, --help   help for add-member
```

#### `tasker teams create`

```
Create a team in an organization (requires team:write)

Usage:
  tasker teams create [org_id] [flags]

Flags:
  -h, --help          help for create
      --name string   Team name
```

#### `tasker teams delete`

```
Move a team to the bin (requires team:admin)

Usage:
  tasker teams delete [team_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker teams list`

```
List teams in an organization, with pagination

Usage:
  tasker teams list [org_id] [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for list
  -l, --limit int32     Maximum number of items to return (default 50)
      --only-deleted    List only archived (binned) teams
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
```

#### `tasker teams list-members`

```
List a team's members, with pagination

Usage:
  tasker teams list-members [team_id] [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for list-members
  -l, --limit int32     Maximum number of items to return (default 50)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
```

#### `tasker teams remove-member`

```
Remove a member from a team (requires team:write)

Usage:
  tasker teams remove-member [team_id] [user_id] [flags]

Flags:
  -h, --help   help for remove-member
```

#### `tasker teams rename`

```
Rename a team (requires team:write)

Usage:
  tasker teams rename [team_id] [flags]

Flags:
  -h, --help          help for rename
      --name string   New team name
```

#### `tasker teams restore`

```
Restore a team from the bin (requires team:admin)

Usage:
  tasker teams restore [team_id] [flags]

Flags:
  -h, --help   help for restore
```

### `tasker webhooks`

```
Each matching task event is POSTed as JSON with X-Tasker-Event, X-Tasker-Delivery,
X-Tasker-Timestamp and X-Tasker-Signature (sha256=HMAC of "<timestamp>.<body>" with the
webhook's secret). Delivery is at least once; failures retry with backoff, and a webhook
that keeps failing is disabled. See docs/webhooks.md.

Usage:
  tasker webhooks [command]

Available Commands:
  create        Register an HTTPS endpoint; prints its signing secret once
  delete        Delete a webhook and its delivery history
  deliveries    Recent deliveries to a webhook, newest first
  list          List an organization's webhooks
  ping          Queue a "ping" delivery to check the receiver end to end
  rotate-secret Replace a webhook's signing secret; prints the new one once
  update        Change a webhook's URL, events or description, or enable/disable it

Flags:
  -h, --help   help for webhooks
```

#### `tasker webhooks create`

```
Register an HTTPS endpoint; prints its signing secret once

Usage:
  tasker webhooks create [flags]

Flags:
      --description string   What the endpoint is for
      --event strings        Event type, "task.*"/"tasknote.*", or "*" (repeat or comma-separate)
  -h, --help                 help for create
      --org string           Organization ID (or set TASKER_ORG_ID)
      --project string       Only this project's events (default: the whole organization)
      --url string           HTTPS endpoint to POST events to
```

#### `tasker webhooks delete`

```
Delete a webhook and its delivery history

Usage:
  tasker webhooks delete [webhook_id] [flags]

Flags:
  -h, --help   help for delete
```

#### `tasker webhooks deliveries`

```
Recent deliveries to a webhook, newest first

Usage:
  tasker webhooks deliveries [webhook_id] [flags]

Flags:
  -c, --cursor string   Pagination cursor to fetch the next set
  -h, --help            help for deliveries
  -l, --limit int32     Maximum number of items to return (default 50)
      --page-all        Fetch every page, printing one JSON object per item per line (NDJSON)
```

#### `tasker webhooks list`

```
List an organization's webhooks

Usage:
  tasker webhooks list [flags]

Flags:
  -h, --help         help for list
      --org string   Organization ID (or set TASKER_ORG_ID)
```

#### `tasker webhooks ping`

```
Queue a "ping" delivery to check the receiver end to end

Usage:
  tasker webhooks ping [webhook_id] [flags]

Flags:
  -h, --help   help for ping
```

#### `tasker webhooks rotate-secret`

```
Replace a webhook's signing secret; prints the new one once

Usage:
  tasker webhooks rotate-secret [webhook_id] [flags]

Flags:
  -h, --help   help for rotate-secret
```

#### `tasker webhooks update`

```
Change a webhook's URL, events or description, or enable/disable it

Usage:
  tasker webhooks update [webhook_id] [flags]

Flags:
      --description string   New description
      --disable              Pause the webhook
      --enable               Turn the webhook on (clears its failure count)
      --event strings        Replace the event filter (repeat or comma-separate)
  -h, --help                 help for update
      --url string           New HTTPS endpoint
```
