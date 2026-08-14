---
description: Always-on project rules. Canonical source is AGENTS.md.
---

# Project Rules

**Read `AGENTS.md` first** — it is the canonical always-on layer and it binds
everything here. This file exists only because Antigravity loads this directory
rather than the root file.

Restated because they are the four most often broken:

1. **`bun` only** for JS/TS. `npm`, `npx`, `yarn`, `pnpm` are forbidden. Go uses the standard `go` toolchain.
2. **Read `.milestones/STATE.md`** before any implementation work.
3. **Never install a package or system dependency** without explicit authorization or a `.specs/product/tech-stack.md` entry.
4. **Never end a session with a dirty tree.** Uncommitted work is invisible to the next session.
