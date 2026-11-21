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

## M50-T02 — Roadmap and integration truth

- **Status**: done
- **Date**: 2026-11-21
- **Plan**: Reconcile M30–M58 statuses against candidate task boxes; update
  README and agent/webhook guidance for stable-key conflicts, unknown commits,
  delivery identity, revalidation and per-request CLI deadlines. Generated
  cli-reference.md remains governed by actual help/doc checks. Static-content
  TDD exception applies; runtime behavior and dependencies are unchanged.

### T02 integration and roadmap candidate

- Reconcile M30–M58 statuses with the current candidate ledger; label the
  dated original review sequence as history. M47/M53–M58 are delivered.
- README distinguishes historical data volume, measured concurrent bursts
  and unvalidated20000-client targets, links UI/UX evidence and operating
  guidance, and explains the actual drift gates' limited scope.
- Agent guidance now treats Retry-After as a minimum, explains per-request
  CLI deadlines/partial NDJSON, unknown writes and stable-intent retries.
  Current stream/replay/schedule guidance remains; webhooks link the common
  runbook and distinguish broker/audit/receiver completion.
- Generated cli-reference.md is unchanged because current help already
  contains these flags; its real docs-check remains required. T03 will add
  the referenced runbook before final verification. No runtime changes.

### T02 verified documentation checkpoint

- Source8ba3834 passes actual Markdown/spec/doc-drift job136891567169.
  The duplicate README blank is corrected after job136888847389's MD012.
  CLI job136891567201's completed Build & Test step runs format, vet,
  tests, build, coverage and the real generated-reference docs-check.
  docs/cli-reference.md remains byte-for-byte unchanged.
- Reconcile M30–M58 against milestone status and the published M49 parent;
  update the delivery-plan checkpoint while retaining dated history.
  CODE-REVIEW-v2 approves source, protocol wording, architecture and security.
- T02 is complete (M50 2/3):397 done/one dropped/one pending. T03 retains
  restore/runbook and full/final-gate closure, including the recorded Bun
  panic and one diagnostic retry. Final combined-head publication remains
  required; no local execution/clean-tree or production restore is claimed.

## M50-T03 — Exercise private backup and recovery procedures

- **Status**: done
- **Date**: 2026-11-21
- **Plan**: Extend the existing real process/broker recovery fixture after
  a killed producer commits pending source/webhook rows. Quiesce/checkpoint
  SQLite, close it, copy/remove/restore the owned file and reopen production
  database setup. Use the existing MySQL service image's dump/client tools
  to restore into a second generated schema, then continue real recovery.
- **Verify**: Compare exact task/event/delivery IDs and payload/secret hashes,
  without logging bodies or private SQL. An empty SQLite restore must boot
  and fail the exact restored-identity oracle. Restore source bytes.
  Required MySQL8.0/8.4 and SQLite jobs execute every counterpart.
- **Safety**: Track original/restored schema creation separately; delete
  only created resources, remove private backups, preserve encryption keys.
  Supply the owned service container ID explicitly in CI step environment.
  No system package, runtime dependency or production procedure is executed.
- **Source facts**: Both dialect schemas confirm SQLite timestamp columns use
  Unix seconds, not milliseconds. Existing recovery tests use controlled
  fixture clocks; the runbook will distinguish them from operator waiting.
- **Notes**: This is a verification fixture/config/static runbook, not a new
  production algorithm. Existing-behavior tests are followed by an actual
  deliberate-break check as TDD requires. T01/T02/T03 remain unchecked
  until hosted gates and review. The independent M49 browser-oracle
  correction is still under final validation; no parent/main merge is claimed.

### First rehearsal results and Markdown correction

- Source89124eb's SQLite job136888555129 restores exact one task/three
  sources/one delivery and matching private hashes, then passes real broker
  recovery. The actual empty restored database fails the intended identity
  assertion; source restores byte-for-byte. No SQL backup is uploaded.
- Workspace job136888847389 rejects README.md:40 for one duplicate blank
  line (MD012). Remove that extra blank, retaining the substantive text.
  This is a static formatting correction; no new product test is needed.
  All M50 tasks stay unchecked until the corrected hosted gate and review.

### T03 verified source, retained crash and final closure

- Source8ba3834 has all18 non-skipped checks green (two tag-only jobs
  skipped). CI44918803128, Integration44918803100, staged/separate recovery
 44918803090 and packaging44918803098 retain actual results. Exact
  `moon check --all` completes37 (7 cached) in7m20.789s:
  backend2432/GUI1764/contract1158. Generated CLI docs-check passes.
- SQLite integration job136890084536 restores exact task/source/delivery
  identities and private hashes, continues real ACK/audit/signed-webhook/
  broker recovery, and proves an actual empty restore fails the intended
  identity assertion with byte restoration. Separate job136890084541
  passes all ten required cases and both audit faults after repeated stages.
- MySQL8.0 job136891567180 passes native19/all12 files, all10 recovery,
  empty-backup proof, native claim fault and both audit faults. MySQL8.4
  job136891567170 instead records Bun1.3.11 panic(main thread): Unknown
  tag:0 in twoInstance.integration.test.ts after8319ms, before any backup
  assertion. It is not hidden or labeled a product/backup assertion failure.
- One diagnostic failed-job rerun, requested only after the workflow ended,
  succeeds as job136895175616: native19/all12, recovery10/zero skips,
  exact restored identities/hashes, empty-backup and audit/claim faults.
  No source change or deterministic runtime root-cause fix is claimed.
- Browser103 passes/three existing skips, actual saved-view/cursor faults,
  rendered388-story accessibility/mobile, standalone and all three packaging
  targets pass. No native Windows/macOS execution or production restore.
- Final review narrows dump/import error diagnostics so private SQL cannot
  enter an exception's stderr, and clarifies that fixture replay is not an
  operator command. Normal Docker cleanup diagnostics remain. This is a
  reversible diagnostic/prose change; no implementation-mirroring test is
  added. The final candidate's real normal/fault/full gates still apply.
- CODE-REVIEW-v3 approves four lenses and the honest recovery boundaries:
  coordinated SQL/broker snapshots, encryption keys, restored authorization,
  external effects, finite retention and migration-compatible rollback.
- Close T03 and every exit criterion. M50 is3/3; all399 tracked tasks are
  resolved:398 done/one deliberately dropped, zero pending across52
  milestones. The fresh branch contains three atomic task commits from
  published M49 main654c222. Its own final checks precede rebase publication;
  verify the published tree exactly. Raw draft PR #22 is superseded only
  after that merge. All task changes are committed Git objects; Cloud failed,
  local worktrees are preserved and no local clean-tree check is claimed.

### Final assembly Markdown correction

- PR #24 job136896968950 rejects two duplicate blank lines introduced when
  assembling this journal (lines56/101, MD012). Normalize the journal in
  each atomic task snapshot and retain that observed failed gate.
- Rebuild the three task commits from published main654c222 without force
  pushes. Product, fixture, private diagnostic guard, workflows and other
  documents are identical to the previous final candidate. The fresh final
  branch runs its own combined checks before publication.
- A static inspection of every candidate Markdown file finds no multiple
  blank-line runs. CODE-REVIEW-v4 approves the narrow formatting correction;
  no runtime test is added for reversible prose formatting.

## M50-T03 — Diagnose final restored-SQLite broker recovery failure

- **Status**: in-progress
- **Date**: 2026-11-21
- **Observed**: Final PR #25 job136898577466 restores SQLite/MySQL identities
  and passes nine required cases, but its restored SQLite broker-restart
  case times out at auditCount===4 after70000ms. The MySQL counterpart
  passes. Final8.4 job136898577483 passes all recovery/fault cases normally.
- **Evidence gap**: The fixture captures child output but sets LOG_LEVEL
  silent and never reports worker state at this failure. No consumer exit,
  SQL-lock, broker-readiness or product root cause is established.
- **Plan before code**: Enable only owned consumer error logs; on failure
  capture bounded SQL/broker/ACK counts and numeric worker exit/signal
  state. Kill owned workers only after failure to collect their safe fixed
  error classifications. Preserve the exact audit oracle and70-second bound.
- **Proof**: A temporary real consumer kill must reach the new observer,
  report the stopped consumer plus four source/three audit rows, fail the
  intended checkpoint and restore source bytes. Do not count bootstrap,
  timeout or cleanup failure as that proof. Use actual diagnostics to decide
  the correction; do not rerun unchanged assertions until green.
- **State**: Reopen T03/operator criterion only. Candidate M50 is2/3,
 397 done/one dropped/one pending; published main remains654c222 with its
  own15 checks green. CODE-v5 rejects the final candidate's unresolved
  recovery. The prior Bun panic/retry and Markdown correction stay recorded.

### Observer's actual negative-control failure

- Integration job136903046789 passes the ordinary SQLite restore/recovery
  and empty-backup proof. The new real consumer-kill proof instead reaches
  its60-second watchdog: exitCode null/stoppedConsumerObserved false. It
  correctly rejects this as proof; no intended observation is claimed.
- Inspection finds unbounded worker-output collection in the observer.
  Replace consumer pipes with private owned log files, read only bounded
  content, and never await a live worker's output. Emit aggregate stages
  before broker probes and require a completed observer in the fault proof.
  The original70-second checkpoint and exact audit oracle remain unchanged.
- Exercise five isolated real SQLite broker-recovery runs after the observer
  proof to investigate the intermittent original failure. Stop on the first
  failure and preserve its safe diagnostics; no retry-to-green loop.
  The original cause is still unknown and T03 stays unchecked.

### Second observer control and earlier-checkpoint evidence gap

- Job136904967519 again passes ordinary recovery and the empty-backup
  proof, but the consumer-kill control times out60 seconds with no observer
  phases. The absence of even the pre-broker snapshot means output collection
  is not established as its cause; the original root cause remains unknown.
- Instrument both the first audit projection and post-restart projection
  with the same safe observer. Run the control asynchronously with private
  stdout/stderr files and explicit kill-stage markers, so a watchdog reports
  the last fixed stage rather than discarding the useful partial record.
  Continue to reject timeout/bootstrap/cleanup as proof, and preserve all
  real source/audit assertions and their existing70-second bounds.
