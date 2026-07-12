# Tasker: CLI Engine

This is the Command Line Interface for Tasker, enabling humans and autonomous agents to manage organizations, projects, and tasks natively via the terminal.

## Getting Started

### Prerequisites
- *See the main workspace [README](../../README.md) for global `moonrepo` and toolchain (`proto`) installation instructions.*

### Development
Execute the main application binary locally:
```bash
go run main.go
```

### Build
Produce the standalone executable `tasker-cli`:
```bash
go build -o bin/tasker-cli main.go
```
*Note: Depending on your global orchestrator, you can also run `moon run cli:build`.*

### Architecture
- Operates primarily by securely parsing arguments and triggering gRPC/Connect calls against the Tasker `backend` via the `shared-contract`.

## Configuration

The CLI reads these environment variables as defaults, so most commands don't need repeated flags:

| Variable | Purpose |
| --- | --- |
| `TASKER_BACKEND_URL` | Backend base URL (defaults to `http://localhost:8080`) |
| `TASKER_ORG_ID` | Default `--org` for commands that need one |
| `TASKER_PROJECT_ID` | Default `--project` for commands that need one |
| `TASKER_CREDENTIALS_PATH` | Where `auth login` saves the session token (defaults to `~/.tasker/credentials.json`) |

Every command also accepts `--json` for machine-readable output.

## Command reference

Run `cli [command] --help` or `cli [command] [subcommand] --help` for full flag details. Top-level command groups:

- **`auth`** - `login` (Google OAuth via a local callback listener), `logout`, `whoami`.
- **`orgs`** - `seed` (bootstrap the first org or a sub-org), `invite` (by email), `list`, `delete`/`restore`/`purge`, `set-retention`.
- **`project-templates`** - `create`, `get`, `list`.
- **`projects`** - `create` (from a template), `get`, `list`, `delete`/`restore`/`purge`.
- **`task-types`** - `create` (optionally with `--parent` for a hierarchy), `get`, `create-status`, `create-transition`.
- **`tasks`** - `create` (`--task-type` optional), `list`, `update-status`, `assign`, `reviewer-add`/`reviewer-remove`/`reviewers`, `comment-add`/`comments`, `note-add`/`notes`, `delete`/`restore`/`purge`.
- **`artifacts`** - `create-folder`, `create` (`--file` auto-detects content type and base64-encodes, e.g. for images), `read`, `list`, `delete`/`restore`/`purge` (for both folders and artifacts).
- **`agents`** - `create-role`, `list-roles`, `create`, `list`, `delete`/`restore`/`purge`.
- **`labels`** - `create`, `list`, `attach`/`detach`, `on` (list labels attached to a task or artifact).
- **`repo`** - `link` (via `--oauth-code`, or Bitbucket's `--api-token`/`--email` direct-token flow), `list`, `sync`, `prs`, `builds`, `deployments`.
- **`search`** - full-text search across tasks and artifacts within an organization.

Commands that support paging/filtering/sorting (`orgs list`, `agents list`, `agents list-roles`, `labels list`, etc.) accept `--filter` (substring match) and `--sort` (e.g. `name:asc`).
