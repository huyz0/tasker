# Quickstart

Ten minutes, from nothing to a working Tasker instance with a project, a task,
and an agent able to work on it. Every command below was run on a clean machine
in this order; nothing is assumed to already exist.

Pick the path that matches what you are doing:

- **Trying it out, or running it for a small team** → [1. One binary](#1-one-binary).
- **Working on Tasker itself** → [2. From the repository](#2-from-the-repository).
- **Connecting an autonomous worker** → [3. An agent](#3-an-agent).

## 1. One binary

Download the file for your platform from the
[latest release](https://github.com/huyz0/tasker/releases/latest), then:

```bash
chmod +x tasker-linux-x64
./tasker-linux-x64 --open --seed
```

That is the whole installation. It creates `.data/local.sqlite`, applies its own
schema, listens on <http://localhost:8080>, and opens a browser. There is no
Node, no Docker, no database to install and no frontend to build — the web
interface, every migration and full-text search are all inside the file.

Register an account on the sign-in screen. Because you passed `--seed`, that
first account gets an organization and a project to start from.

Flags, upgrading, backups and what "standalone" does *not* include are in
[the standalone guide](standalone.md).

## 2. From the repository

You need [Moon](https://moonrepo.dev/), which installs every other toolchain
version this repository pins:

```bash
bun install -g @moonrepo/cli   # or: curl -fsSL https://moonrepo.dev/install/moon.sh | bash
git clone https://github.com/huyz0/tasker && cd tasker
moon setup
```

Start the stack. The backend runs against SQLite by default, so nothing else has
to be running:

```bash
moon run dev
```

The GUI is on <http://localhost:5173> and the backend on
<http://localhost:8080>. A development session is bootstrapped for you, so the
app opens signed in.

For a realistic amount of data to click through:

```bash
cd apps/backend && bun run seed
```

To run against MySQL and NATS instead — which is what a clustered deployment
uses, and the only way to exercise the audit trail and the live-update feed:

```bash
docker compose up -d mysql nats
```

Before pushing anything:

```bash
moon check --all
```

## 3. An agent

An agent authenticates with a token issued for it, not with a person's session.
Anything it does is attributed to it because of that token.

```bash
# As an organization admin, from an authenticated shell:
tasker agents create --org "$ORG_ID" --name "CI worker" --role "$ROLE_ID"
tasker auth token create <agent-id> --name "CI worker" \
  --scope tasks:read --scope tasks:write --scope comments:write
```

The token is shown once. Then, from the agent's own environment:

```bash
export TASKER_BACKEND_URL=http://localhost:8080
export TASKER_TOKEN=tskr_...
export TASKER_ORG_ID=...
export TASKER_PROJECT_ID=...

tasker tasks list --json
tasker tasks claim <task-id>          # atomic — two agents cannot both win
tasker tasks note-add <task-id> --type handoff --content "…"
```

Scopes, revocation, rate limits, idempotency and the handoff convention are in
[the agent integration guide](agent-integration.md). Every command and flag is
in [the CLI reference](cli-reference.md).

## Where to go next

| You want to | Read |
| --- | --- |
| Run it for real, or upgrade it | [Standalone guide](standalone.md) |
| Connect an autonomous worker | [Agent integration](agent-integration.md) |
| Look up a command | [CLI reference](cli-reference.md) |
| Deploy it to a cluster | [`deploy/kubernetes.yaml`](../deploy/kubernetes.yaml) |
| Understand how it is built | [`.specs/product/architecture.md`](../.specs/product/architecture.md) |

## If something does not work

**The binary starts and immediately exits.** Run it from a directory you can
write to — it creates `.data/` beside itself on first run.

**"Continue with Google" is missing.** It appears only when Google credentials
are configured, which a downloaded binary has none of. Sign in with a username
and password.

**The connection indicator says "Refreshing periodically".** The live-update
feed needs a NATS broker. Everything works without one; the screen refreshes on
a timer instead of instantly.

**`moon check --all` fails on a fresh clone.** Run `moon setup` first — it
installs the pinned Bun, Node and Go versions.
