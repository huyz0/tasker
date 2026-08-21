# CLI reference

Every command `tasker` accepts, taken from the binary's own help output
(M12-T09) — so it is the tool describing itself rather than a second account of
it that drifts.

Regenerate after adding or renaming a command:

```bash
cd apps/cli && go build -o tasker . && bash scripts/generate-cli-reference.sh > ../../docs/cli-reference.md
```

## Getting a session

Every command below reads three environment variables as defaults, so a shell
that sets them once does not repeat itself:

| Variable | Meaning |
| --- | --- |
| `TASKER_BACKEND_URL` | Where the backend is (default `http://localhost:8080`) |
| `TASKER_ORG_ID` | The organization most commands act in |
| `TASKER_PROJECT_ID` | The project task commands act in |
| `TASKER_TOKEN` | An agent token, for a non-interactive caller |

A person signs in once with `tasker auth login`, which opens a browser and
stores the session. An agent sets `TASKER_TOKEN` (or passes `--token`) and never
logs in at all — see [the agent integration guide](agent-integration.md).

Almost every command accepts `--json`, which is the form to parse. The
human-readable output is for reading and is not a stable interface.

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

```

### `tasker completion`

```
Generate the autocompletion script for tasker for the specified shell.
See each sub-command's help for details on how to use the generated script.

Usage:
  tasker completion [command]

Available Commands:
  bash        Generate the autocompletion script for bash
  fish        Generate the autocompletion script for fish
  powershell  Generate the autocompletion script for powershell
  zsh         Generate the autocompletion script for zsh

Flags:
  -h, --help   help for completion

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

```

### `tasker help`

```
Help provides help for any command in the application.
Simply type tasker help [path to command] for full details.

Usage:
  tasker help [command] [flags]

Flags:
  -h, --help   help for help

Global Flags:
      --json           Output in JSON format
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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

```

### `tasker ping`

```
Ping the backend health service

Usage:
  tasker ping [flags]

Flags:
  -h, --help   help for ping

Global Flags:
      --json           Output in JSON format
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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
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
  get               Show a task type along with its configured statuses and transitions
  list              List task types for an organization

Flags:
  -h, --help   help for task-types

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

```

### `tasker tasks`

```
Workbench for tasks and autonomous agents

Usage:
  tasker tasks [command]

Available Commands:
  assign          Assign a task to an agent or user
  claim           Atomically claim an unassigned task for the calling principal (agent self-service)
  comment-add     Add a comment to a task
  comments        List comments on a task
  create          Create a new task in a project
  delete          Move a task to the bin (soft delete; requires org admin)
  get             Get a single task, including its description
  handoffs        List tasks with a pending handoff note (one row per task, the latest only)
  list            List tasks within a project
  note-add        Add an AI agent note to a task (requires an agent token)
  note-delete     Delete an agent note (author only, requires an agent token)
  note-update     Update an agent note's content (author only, requires an agent token)
  notes           List AI agent notes on a task
  purge           Permanently delete an already-binned task and its dependent records (requires org admin)
  restore         Restore a task from the bin (requires org admin)
  reviewer-add    Add a reviewer to a task
  reviewer-remove Remove a reviewer from a task
  reviewers       List a task's reviewers
  unassign        Remove an agent or user's assignment from a task
  update          Update a task's title, description, or task type
  update-status   Update a task's status

Flags:
  -h, --help   help for tasks

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

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

Global Flags:
      --json           Output in JSON format
      --token string   Agent token to authenticate with (overrides TASKER_TOKEN and any saved session)

```
