---
active_milestone: M01
active_task: M01-T04
last_updated: 2026-08-15
last_commit: null
blocked: false
blocker: null
---

# Delivery State

> **Read this file first.** It is the single entry point for any agent or human
> resuming delivery. It is committed to git, so the state of the work travels
> with the repository and survives the end of any session.

## Now

- **Milestone**: M01 — Stabilize the Build
- **Task**: M01-T04 — Make the health probe read-only
- **Branch**: `feature/m01-stabilize-the-build`
- **Command to continue**: `/milestone-deliver M01`

## How to resume

1. Read this file.
2. Read `.milestones/MILESTONE-<active>/MILESTONE.md` for the plan.
3. Read that milestone's `PROGRESS.md` — the last entry names the task in
   flight and why it was left there.
4. Run `/milestone-deliver` (interactive) or `/milestone-deliver-auto`
   (autonomous). Both pick up from the first unchecked task.

If `blocked: true`, read `blocker` above and resolve it before continuing.

## Milestone ledger

| ID  | Milestone                      | Status | Depends on | Tasks | Done |
|-----|--------------------------------|--------|------------|-------|------|
| M01 | Stabilize the Build            | in-progress | —     | 13    | 3    |
| M02 | Specification Truth            | todo   | M01        | 7     | 0    |
| M03 | IAM Correctness & Scale        | todo   | M01        | 14    | 0    |
| M04 | Agent Identity & M2M Tokens    | todo   | M03        | 12    | 0    |
| M05 | GUI / API Parity               | todo   | M01        | 12    | 0    |
| M06 | UX, Design System & A11y       | todo   | M05        | 13    | 0    |
| M07 | Read-Path Scale                | todo   | M05        | 11    | 0    |
| M08 | Events, Audit & Real-Time      | todo   | M04, M07   | 11    | 0    |
| M09 | Portable Single Binary         | todo   | M05, M07   | 9     | 0    |
| M10 | Teams & Policy-Based RBAC      | todo   | M03, M04   | 13    | 0    |
| M11 | Observability & Deployability  | todo   | M08        | 12    | 0    |
| M12 | Test Depth & Release           | todo   | M06,M09,M11| 11    | 0    |

**Total: 138 tasks across 12 milestones.**

## Dependency graph

```mermaid
graph LR
  M01[M01 Stabilize] --> M02[M02 Spec Truth]
  M01 --> M03[M03 IAM]
  M01 --> M05[M05 GUI Parity]
  M03 --> M04[M04 Agent Identity]
  M05 --> M06[M06 UX & A11y]
  M05 --> M07[M07 Read Scale]
  M04 --> M08[M08 Events & Realtime]
  M07 --> M08
  M05 --> M09[M09 Single Binary]
  M07 --> M09
  M03 --> M10[M10 Teams & RBAC]
  M04 --> M10
  M08 --> M11[M11 Observability]
  M06 --> M12[M12 Test & Release]
  M09 --> M12
  M11 --> M12
```

Milestones with no dependency edge between them may run in parallel on separate
branches. M02 is intentionally cheap and unblocking — it can run alongside
anything.

## Handoff notes

_Nothing yet. The first `/milestone-deliver` run writes here._
