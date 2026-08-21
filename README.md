# Tasker

## 🎯 About Tasker: The AI-First Management System

**What is Tasker?**
Tasker is a specialized Task Management System built natively for **AI Agents**. In an advanced, autonomous Software Development Life Cycle (SDLC), traditional human-first issue trackers (like Jira or Trello) create immense friction for LLM-driven workers.

**Why we are building it**
We are building Tasker to serve as the foundational task-and-knowledge infrastructure for high-scale AI and human collaboration. It allows AI agents to create, track, and update work internally via a highly optimized and secure Web API, bypassing clunky user interfaces.

By design, humans are shifted **"off the loop"**, empowered instead by a dedicated CLI and a web GUI, so managers step **"on the loop"** (monitoring and feedback) or **"in the loop"** (approvals) only when necessary.

> **Today the GUI is not real-time.** It refreshes on navigation and after your
> own mutations — there is no polling, no WebSocket and no server-sent events in
> `apps/gui/`. The backend already publishes domain events to NATS and nothing
> consumes them; live updates are **M08**.

**The Mission Scale**
These are the design targets the architecture is aimed at. **None has been
measured** — there is no load test or benchmark in the repository, and no
deployment to measure. Read them as intent:

- **20,000+ AI Agents** running concurrent tasks.
- **20,000+ Human Users and Managers** providing oversight.
- **20,000 teams** (up to 100 members each), delivering **2,000 projects**
  concurrently. Teams have **no table in the schema yet** — they are **M10**.

Read-path scale is **M07**; the numbers become claims when something measures
them, which is **M12**.

---

## 🏗️ The Agentic Architecture

This codebase represents a multi-component system (housing a Backend, CLI, GUI, and shared contracts) structurally designed to be co-piloted by an advanced Agentic Autonomous Development ecosystem.

Instead of hiding tribal knowledge in developer heads, the architectural rules,
coding conventions and product goals are written down as Markdown that agents
read directly. Where a document and the code disagree, the document is the bug:
`moon run :spec-drift` fails the build when `tech-stack.md` and the manifests
diverge.

---

## 🧭 Project Navigation

### 🚦 Where the work stands

Delivery runs on **milestones** — each one a verifiable end state for the
product, with its plan and its committed progress in [`.milestones/`](.milestones/README.md).

👉 **[`.milestones/STATE.md`](.milestones/STATE.md)** is the single entry point:
the active milestone, the task in flight, and what the last session did. It is
committed to git, so a brand-new agent session can resume with no prior context.

```bash
/milestone-status              # where are we?
/milestone-deliver             # deliver the next task, with confirmation
/milestone-deliver-auto        # deliver autonomously until done or blocked
```

With no milestone id, both read `active_milestone` from `STATE.md`.

The roadmap in [`.specs/product/roadmap.md`](.specs/product/roadmap.md) maps
every remaining capability to the milestone that owns it.

### Integrating an agent

[**Authenticating an agent**](docs/agent-integration.md) — how an autonomous
worker gets a token, what the eight scopes grant, what no token can do, and how
to rotate without downtime. Start here if you are wiring a worker to Tasker
rather than developing Tasker itself.

### Foundational context

All foundational context is stored entirely within the `.specs/` directory.

### Core Product Documents (`.specs/product/`)

These files explicitly govern *what* we are building and the overarching architecture:

- [🌍 **Mission & Vision**](.specs/product/mission.md): The core product objectives and target user personas.
- [🛣️ **Roadmap**](.specs/product/roadmap.md): Currently active milestones, planned work, and timelines.
- [🏛️ **Architecture**](.specs/product/architecture.md): High-level system design (C4/DDD boundaries) and ADRs.
- [🛠️ **Tech Stack**](.specs/product/tech-stack.md): The exhaustive, hardcoded list of approved frameworks and tools (preventing agent hallucinations).
- [📓 **Work Ledger**](.specs/product/work-ledger.yml): The strategic tracking router deciding if artifacts live locally or on external trackers (Jira/Linear).

### Engineering Standards (`.specs/standards/`)

These standalone rulebooks are injected into agent workflows via the
`context-inject` skill, so generated code is written against the conventions
already in use rather than the model's defaults.

- **System Design**: [`api-standard.md`](.specs/standards/api-standard.md) | [`milestone-standard.md`](.specs/standards/milestone-standard.md)
- **Frontend & Design**: [`frontend-standard.md`](.specs/standards/frontend-standard.md) | [`ui-ux-standard.md`](.specs/standards/ui-ux-standard.md)
- **Core Engineering**: [`coding-standard.md`](.specs/standards/coding-standard.md) | [`security-standard.md`](.specs/standards/security-standard.md) | [`git-workflow-standard.md`](.specs/standards/git-workflow-standard.md)
- **Quality & Telemetry**: [`test-plan-standard.md`](.specs/standards/test-plan-standard.md) | [`testing-standard.md`](.specs/standards/testing-standard.md) | [`observability-standard.md`](.specs/standards/observability-standard.md)

*(View the programmatic catalog of all active rules in [`index.yml`](.specs/standards/index.yml))*

---

## 🤖 The Agentic Development System

Delivery runs through milestones. Developers use lightweight `/slash-commands` to orchestrate specialized AI personas (Skills) that carry a task from decision through implementation to review, committing the progress record alongside the code so any session can resume.

To deeply understand how these isolated skills chain together, how they discover your newly written rules, and how they utilize token-efficient Context Injection:
👉 **[Read the Full Agentic System Overview](AGENTIC_SYSTEM.md)**

---

## 📥 Just want to run it?

Tasker ships as a **single executable** that carries its own web interface,
database schema and full-text search. No Node, no Docker, no MySQL, no
separate frontend build:

```bash
./tasker --open --seed
```

👉 **[Quickstart](docs/quickstart.md)** — ten minutes from nothing to a working
instance, whichever way you are running it.

Then: **[Standalone guide](docs/standalone.md)** for flags, upgrades and
backups · **[Agent integration](docs/agent-integration.md)** for connecting an
autonomous worker · **[CLI reference](docs/cli-reference.md)** for every
command · **[Email](docs/email.md)** for invitation delivery.

Everything below is for working *on* Tasker rather than running it.

---

## 🚀 Developer Setup & Prerequisites

This project utilizes [Moonrepo](https://moonrepo.dev/) as its polyglot build system and task runner, backed by the `proto` toolchain manager. This ensures that every developer (and AI agent) automatically uses the exact same versions of Node.js, Bun, and Go without manual installation fighting.

### 1. Install Moon

You must install the Moon CLI globally. This will also install `proto`.

```bash
# Using bun
bun install -g @moonrepo/cli

# OR using the installation script (Mac/Linux)
curl -fsSL https://moonrepo.dev/install/moon.sh | bash
```

### 2. Initialize the Toolchain

Once Moon is installed, navigate to the project root and run:

```bash
moon run :setup-hooks
```

**Do not run `moon setup`** — it prints "Unable to setup, no toolchains are
configured!" and does nothing. Every project here is `language: system`, so moon
2 has no toolchain of its own to install. The versions come from proto instead:
`.prototools` pins Node.js, Bun, moon and Go, and `auto-install = true` fetches
each one into `~/.proto` the first time a command needs it.

You do not need to run `bun install` yourself: every task that needs JavaScript
dependencies depends on an `install-deps` task, so the first `moon run` or
`moon check` in a fresh clone installs them before anything else runs.

`moon run :setup-hooks` points git at the repository's committed `.githooks/`
directory, so the pre-commit checks run from your first commit. Git ignores
that directory until `core.hooksPath` is set, and it is per-clone
configuration, so this is a one-time step after cloning.

### 3. Running Tasks

You do not need to manually `cd` into directories to run scripts. Moon handles aggressive caching and dependencies automatically:

```bash
# Run the complete cached CI pipeline locally (lint, format, test, build for all apps)
moon check

# Run a specific task (e.g., build the React GUI)
moon run gui:build

# Run all tests across the monorepo simultaneously
moon run :test
```

### 4. Running Locally

To start the backend and GUI together for local development (backend runs with
`STANDALONE=true` against a local SQLite file — no Docker or MySQL needed):

```bash
moon run :dev
```

(The `:dev` form targets the task by name across the workspace. Plain
`moon run dev` fails with "No default project has been configured" — the
workspace root is a project like any other, so its tasks need a scope.)

That is the whole setup: **no `.env` file is needed to get a working app**. The
command starts the backend with `ENABLE_TEST_LOGIN=true`, so the GUI mints a
local dev session for itself and the dashboard loads signed in. Opening
<http://localhost:5173> gives you a working app with no OAuth credentials and no
manual login step.

This tails both processes' logs in one terminal, prefixed `[backend]` /
`[gui]`; Ctrl-C stops both. The backend listens on `:8080`, the GUI dev
server on `:5173`.

> **`STANDALONE=true` is not the single-binary product.** It selects the SQLite
> dialect for a normally-run backend. `bun run build:standalone` does compile a
> binary, but it bundles the backend only — a `GET /` on it returns a
> placeholder page, not the GUI, and the in-process transport is an unused stub.
> A genuinely portable single binary is **M09**; see
> [architecture.md](.specs/product/architecture.md).

To change any of that - point at MySQL, configure real Google/GitHub OAuth,
turn login enforcement on - copy the committed examples and edit them:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/gui/.env.example apps/gui/.env
```

Both files document every variable the app reads, with the local-dev default
for each. `ENABLE_TEST_LOGIN` is a local-development convenience only: the
backend refuses to start with it enabled when `NODE_ENV=production`.

To populate the local database with a realistic amount of data (an org,
project, ~150 tasks, agents, labels) instead of starting from empty - useful
for reproducing bugs that only show up once a list actually needs to
paginate:

```bash
cd apps/backend && bun run seed
```

This prints a session token for the seeded user at the end; paste it into a
`session` cookie in the browser, or use it as a Bearer token with the CLI.

For investigating a specific problem once things are running - reading logs,
checking a session token, inspecting the DB, confirming resolved config -
see [**DEBUGGING.md**](DEBUGGING.md).

---

## 📦 Monorepo Structure

Beyond the `.specs/` configuration layer, the functional execution environment is organized as follows:

- `/apps/`: Contains the specific application interfaces - [`cli`](apps/cli/README.md), [`gui`](apps/gui/README.md), [`backend`](apps/backend/README.md).
- `/packages/`: Contains shared foundational libraries and universal strict API contract definitions.
- `/.agents/`: The agent harness — skills, workflows, and shared protocols. Canonical for every host; `.claude/` is generated from it.
- `/.milestones/`: The delivery plan and its committed progress — the state that lets any session resume the work.
- `/.archive/`: The retired epic system — 19 completed epics, their test plans and council reports, plus `EPIC-FORMAT.md` describing how to read them.
