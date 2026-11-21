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

### T01 source reconciliation candidate

- Replace obsolete architecture with cited current boundaries: local/linked
  identity, separate principals, real streaming/MCP, SQL capture/ACKed relay,
  durable audit, resync, recoverable schedules, current GUI/CLI and deployment.
- Correct API guidance for the actual namespace, stream, principal checks,
  transactional replay/processing conflicts, bounded collections and distinct
  handler/data-volume/concurrent-workflow measurements.
- Correct security guidance for current gates, principal/protocol boundaries,
  existing Markdown sanitization, secret-safe diagnostics and per-process
  rate limits. Retry-After is a minimum wait, not guaranteed future capacity.
- Reconcile the technology inventory with declared manifest ranges; remove
  delivered work from the unbuilt list and restore actual MSW/CLI MCP facts.
  Add a source-truth audit. No dependency, production behavior or historical
  ADR changes. Hosted lint/drift/final verification remains pending.
