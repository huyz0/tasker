# Operational truth progress

## M50-T01 — Reconcile architecture and standards with verified source

- **Status**: in-progress
- **Date**: 2026-11-21
- **Changed**: Record source-backed corrections before editing architecture,
  API/security guidance and the technology inventory. The verified M49
  dependency is complete on parent d0f38d5; publication PR #20 still has its
  final combined-head checks. This branch does not claim that merge occurred.
- **Observed**: Current documents contradict local/linked human identity,
  delivered streaming/MCP/CLI paging, SQL-backed event capture, consumers,
  Radix usage, deployment artifacts and real CI vulnerability gates. Roadmap
  statuses and operating guidance are separately owned by T02/T03.
- **Plan**: Audit present-tense claims against cited source paths and current
  decisions. Preserve immutable historical ADRs/journals. Describe the real
  measured boundary, including severe 1000-caller saturation, without
  introducing a new store, service, runtime or product promise.
- **Standards**: Milestone/security plus TDD apply. The edited API/security
  documents are evidence to reconcile, not authority for their obsolete
  claims. Pure static documentation uses the TDD exception; the unchanged
  Markdown/specification/doc-drift gates and actual source evidence verify it.
- **Verify**: Require doc-drift and repository gates on the final candidate.
  T02 keeps generated CLI reference handling honest; T03 must exercise
  disposable backup/restore and recovery, including a deliberately broken
  backup. No local executor, clean-tree or unrun rehearsal is claimed.
- **Next**: Implement T01 corrections, review four lenses and record actual
  hosted verification before checking the task.
