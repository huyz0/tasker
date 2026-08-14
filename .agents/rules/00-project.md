---
description: Always-on project rules. Points at the canonical AGENTS.md.
---

# Project Rules

Antigravity loads this directory on every turn. The canonical always-on rules
live in **`AGENTS.md`** at the repository root — the one file every host reads —
so this file forwards rather than duplicating it.

**Read `AGENTS.md` first.** It is short and it binds everything below.

The four rules that matter most, restated because they are the ones most often
broken:

1. **`bun` only** for JavaScript and TypeScript. `npm`, `npx`, `yarn` and `pnpm`
   are forbidden. Go uses the standard `go` toolchain.
2. **Read `.milestones/STATE.md` before any implementation work.** It names the
   active milestone, the task in flight, and what the previous session did.
3. **Never install a third-party package or system dependency** without explicit
   authorization or a `.specs/product/tech-stack.md` entry.
4. **Never end a session with a dirty working tree.** Uncommitted work is
   invisible to the next session.

The harness itself — skills, workflows and shared protocols — is documented in
`AGENTIC_SYSTEM.md`. Skills live in `.agents/skills/`, slash commands in
`.agents/workflows/`, and `.claude/` is generated; never hand-edit it.
