# M44 Progress

## M44-T01 — Record authorization and recovery design

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: M44–M50 plans, ADR-0037, TEST-PLAN-0044, STATE.md.
- **Verified**: `bun run scripts/doc-drift.ts` passes for 44 milestone files and their ledger.
- **Notes**: Seven milestones, 30 tasks. Design first; no behavior changed. Installed pinned Bun 1.3.11 locally; baseline backend suite: 2042 pass, 28 skip, 0 fail. `moon check --all` attempted; blocked on the environment's non-Go `/usr/bin/go` executable. Documentation task is verified; runtime work is not marked done.
- **Next**: M44-T02 authorization regression tests.

## M44-T02 — Authorize keyed task mutations before replay

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: task handler and replay authorization regression tests.
- **Verified**: Red: all 3 authorization regressions resolved when they should reject. Green: 21 task/queue/idempotency tests pass. `moon check --all`: 35 completed; backend 2051 pass / 28 skip; GUI 1324 pass; CLI, builds, typechecks, lint and doc gates pass. gh/act optional execution skipped because tools are absent.
- **Notes**: Keep existing current resource-policy checks; move them before cache access without changing key identity or terminal-task retry behavior.
- **Next**: M44-T03 stream lifecycle.
