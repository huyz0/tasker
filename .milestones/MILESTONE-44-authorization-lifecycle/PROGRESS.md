# M44 Progress

## M44-T01 — Record authorization and recovery design
- **Status**: done
- **Date**: 2026-11-08
- **Changed**: M44–M50 plans, ADR-0037, TEST-PLAN-0044, STATE.md.
- **Verified**: `bun run scripts/doc-drift.ts` passes for 44 milestone files and their ledger.
- **Notes**: Seven milestones, 30 tasks. Design first; no behavior changed. Installed pinned Bun 1.3.11 locally; baseline backend suite: 2042 pass, 28 skip, 0 fail. `moon check --all` attempted; blocked on the environment's non-Go `/usr/bin/go` executable. Documentation task is verified; runtime work is not marked done.
- **Next**: M44-T02 authorization regression tests.
