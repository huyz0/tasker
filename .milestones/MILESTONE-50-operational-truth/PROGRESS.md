# Operational truth progress

## M50-T01 — Reconcile architecture and standards with verified source

- **Status**: done
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

### Resume on repaired verified dependency

- Source e94372e passes all18 checks and repeated native-fetch stages after
  the actual controller regression. Fresh atomic candidate e011834 is in
  PR #21's final publication gate. Merge only M50-owned documents onto that
  candidate; no old M49 implementation is overlaid.
- Keep current versus original generator profiles distinct in architecture
  and retain the measured saturation boundary. T01 stays unchecked pending
  actual documentation/final checks.


### T01 verified static source and review

- Corrected source8ba3834 passes actual workspace job136891567169:
  Markdown560 files/three Mermaid blocks, specification77 declared/73
  documented identifiers/zero drift, and52 milestone files consistent
  with boxes/ledger. The earlier README MD012 failure is corrected.
- The implementation-agent four-lens CODE-REVIEW-v1 approves current
  architecture/API/security/technology claims against source. A separate
  relative-link inspection resolves129 changed-document references.
  These checks have limited scope and do not substitute for source reading.
- M49 is now published as main654c222 after all18 non-skipped final checks,
  exact37 in5m58.887s and103 browser passes/three existing skips. The tested
  and published tree is6fbcf23. This task starts from that published parent.
- T01 is complete (M50 1/3):396 done/one dropped/two pending. T02/T03
  retain integration/restore/final-gate ownership. Source8ba's separate
  MySQL8.4 Bun runtime crash is retained by T03 and is not a static-doc pass.
  Final combined-head checks precede publication. No local run/clean-tree
  or production restore is claimed.
