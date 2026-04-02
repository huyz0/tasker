# Tasker

## 🎯 About Tasker: The AI-First Management System

**What is Tasker?**
Tasker is a specialized Task Management System built natively for **AI Agents**. In an advanced, autonomous Software Development Life Cycle (SDLC), traditional human-first issue trackers (like Jira or Trello) create immense friction for LLM-driven workers. 

**Why we are building it**
We are building Tasker to serve as the foundational task-and-knowledge infrastructure for high-scale AI and human collaboration. It allows AI agents to create, track, and update work internally via a highly optimized and secure Web API, bypassing clunky user interfaces. 

By design, humans are primarily shifted **"off the loop"**, empowered instead by a dedicated CLI and near real-time interactive web GUI. This allows managers to seamlessly step **"on the loop"** (for monitoring and feedback) or **"in the loop"** (for strict approvals) only when strictly necessary.

**The Mission Scale**
This infrastructure is architected to scale aggressively, natively supporting:
- **20,000+ AI Agents** running concurrent tasks.
- **20,000+ Human Users and Managers** providing oversight.
- Complex hierarchy parsing up to **20,000 teams** (with up to 100 members each), delivering **2,000 projects concurrently**.

---

## 🏗️ The Agentic Architecture

This codebase represents a multi-component system (housing a Backend, CLI, GUI, and shared contracts) structurally designed to be co-piloted by an advanced Agentic Autonomous Development ecosystem.

Instead of hiding tribal knowledge in developer heads, this repository is 100% declarative. Every architectural rule, coding convention, and product goal is explicitly mapped out in Markdown files, allowing AI agents to read, understand, and perfectly replicate our team's engineering standards.

---

## 🧭 Project Navigation

All foundational context is stored entirely within the `.specs/` directory.

### Core Product Documents (`.specs/product/`)
These files explicitly govern *what* we are building and the overarching architecture:
- [🌍 **Mission & Vision**](.specs/product/mission.md): The core product objectives and target user personas.
- [🛣️ **Roadmap**](.specs/product/roadmap.md): Currently active milestones, planned epics, and timelines.
- [🏛️ **Architecture**](.specs/product/architecture.md): High-level system design (C4/DDD boundaries) and ADRs.
- [🛠️ **Tech Stack**](.specs/product/tech-stack.md): The exhaustive, hardcoded list of approved frameworks and tools (preventing agent hallucinations).
- [📓 **Work Ledger**](.specs/product/work-ledger.yml): The strategic tracking router deciding if artifacts live locally or on external trackers (Jira/Linear).

### Engineering Standards (`.specs/standards/`)
These standalone rulebooks are injected seamlessly into our automated agent workflows via the `standards-inject` skill, ensuring generated code is consistently flawless.
- **System Design**: [`api-standard.md`](.specs/standards/api-standard.md) | [`epic-standard.md`](.specs/standards/epic-standard.md)
- **Frontend & Design**: [`frontend-standard.md`](.specs/standards/frontend-standard.md) | [`ui-ux-standard.md`](.specs/standards/ui-ux-standard.md)
- **Core Engineering**: [`coding-standard.md`](.specs/standards/coding-standard.md) | [`security-standard.md`](.specs/standards/security-standard.md) | [`git-workflow-standard.md`](.specs/standards/git-workflow-standard.md)
- **Quality & Telemetry**: [`test-plan-standard.md`](.specs/standards/test-plan-standard.md) | [`testing-standard.md`](.specs/standards/testing-standard.md) | [`observability-standard.md`](.specs/standards/observability-standard.md)

*(View the programmatic catalog of all active rules in [`index.yml`](.specs/standards/index.yml))*

---

## 🤖 The Agentic Development System

This project is built to execute the "Autonomous Epic Journey". Developers use lightweight `/slash-commands` to orchestrate specialized AI personas (Skills) that take features completely from Ideation -> Architecture Design -> Code Implementation -> Security Review.

To deeply understand how these isolated skills chain together, how they discover your newly written rules, and how they utilize token-efficient Context Injection:
👉 **[Read the Full Agentic System Overview](AGENTIC_SYSTEM.md)**

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
moon setup
```
Moon will automatically read `.prototools` and locally download the exact, pinned versions of Node.js, Bun, and Go required for this project natively into `~/.proto`.

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

---

## 📦 Monorepo Structure

Beyond the `.specs/` configuration layer, the functional execution environment is organized as follows:

- `/apps/`: Contains the specific application interfaces (CLI, GUI, Backend Services).
- `/packages/`: Contains shared foundational libraries and universal strict API contract definitions.
- `/.agents/`: Houses the operational logic for our autonomous AI developer system (Skills and Workflows).
- `/.epics/`: Contains explicitly version-controlled feature packages (`EPIC.md`) currently in motion.
- `/.test-plans/`: Houses all rigid, contractual `Given/When/Then` behavioral expectations generated during planning phases.
