# M49 progress

## M49-T06 — Restore the security-patched Go runtime

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Synchronize the CLI module minimum and proto runtime pin with the fixed Go1.26 security patch; update current toolchain documentation.
- **Verified**: Main9be092b post-publication CI44885312900 fails its actual Go audit on GO-2026-6859 (job136789215298, exit3), found in1.26.10 and fixed in1.26.11. All other nine post-main jobs pass. The official golang/vulndb advisory confirms that fix; it appeared after the earlier PR verification. No advisory suppression is proposed.
- **Notes**: Dependency/security standards and TDD apply. Pure version configuration and static documentation have no product behavior to drive with new tests; the unchanged real vulnerability audit provides the observed failure. Workspace startup is still pending, so prepare this isolated draft through the connected Git provider, preserving all local M58-T04 edits. This journal is written before the source pin change. Do not call the task complete until the audit, CLI checks, repository checks and final publication gates actually pass.
- **Next**: Update both pins and current docs, run hosted candidate CI while startup continues, then reconcile the local isolated checkout, run required checks and complete/publish the task. Resume M58-T04 afterwards; original M49-T01–T05 remain pending.

### Candidate verification while Cloud startup remains pending

- The connected provider preserves the in-progress checkpoint and draft PR #15,
  initially at94dea617. The Go module minimum and proto pin both use1.26.11;
  the current toolchain rows and security-patch paragraph agree. No production
  module dependency, advisory exception or product behavior is added.
- Extend the existing CLI job to execute the exact `moon check --all` gate for
  runtime or CI configuration changes. The base SHA is read from an environment
  value, validated and checked before diffing; an unavailable/invalid base runs
  the full gate rather than skipping it. Unchanged application-only PRs retain
  their existing independent checks. This makes the actual required repository
  command verifiable on the hosted runner while the local Cloud executor is
  unavailable; it is not an inferred local pass. Keep the task unchecked until
  the actual new candidate checks and source review complete.

### T06 verified checkpoint

- Candidate debb00ba passes the unchanged Go vulnerability audit and all seven
  CLI checks. The new conditional hosted gate executes `moon check --all`
  and passes all 36 checks (7 cached) in 4m42.071s: 1,764 GUI cases, 2,421
  backend cases with zero failures, 1,158 contract cases and production/
  standalone builds. Job 136796806687 retains the actual command/results.
  This is a hosted execution; the Cloud workspace is still starting and no
  local execution is claimed.
- Independent CODE-REVIEW-v1 approves the reviewed source. Persist its limits
  alongside this closure. The patch adds no production module, exception or
  data migration; the existing audit now passes on the fixed standard library.
- Check T06 only. M49 is 1/6 and its original production recovery/load tasks
  remain pending. The program is 399 tasks, 389 done, one dropped, nine pending.
  Final-head hosted CI and publication still gate the merge of PR #15.
  Resume preserved M58-T04 after publication; its dependent provider branch
  retains its own in-progress journal.

## M49-T01 — Required production-dependency checks

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Add an explicit isolated MySQL gate and extend the existing real JetStream job to committed recovery cases.
- **Verified**: M46/M47/M48 dependencies are published. M49-T06 publishes the patched runtime as main ed1b323 after all eight final-head checks, with identical tested/published tree. Permanent M58-T04 browser coverage proceeds separately in PR #16; preserve its remote and local drafts. Cloud startup remains pending, so use actual hosted dependency services and the exact repository gate.
- **Notes**: Testing/security plus TDD apply. Existing unit prerequisites remain explicit; the new required command must create only unique owned schemas, fail on unavailable services or skipped native files, and clean those schemas. Real tests precede any completion claim, and a restored MySQL claim-assertion fault must fail the required command. CI configuration/static comments need no artificial runtime unit test; the new orchestration is verified against real services.
- **Next**: Wire owned MySQL readiness/isolation and broker recovery, prove ordinary/fault paths on actual services, review source and run final hosted gates before completion/publication. M49-T02 still owns complete two-instance recovery, and T03/T04 still own measured load; no capacity claim is added here.

### First required service results

- The actual8.4 job136803571754 passes every native file and the restored
  claim-assertion proof. The8.0 job136803571688 reaches real MySQL but its fresh
  migration test hits Bun's implicit five-second default. Give this cold
  complete-schema bootstrap the existing wire-readiness30-second bound and
  close its pool in finally; keep all table assertions and native operational
  query latency budgets unchanged.
- Real NATS/recovery job136803474859 exposes an expired-key fixture assumption:
  the deterministic schedule clock is in early November, while generic keys
  use the actual current creation time. Its November13 purge cannot expire
  November21 keys, so the unchanged positive purge assertion correctly fails.
  Select actual stored creation timestamps, prove keys exist and the clock is
  finite, then advance beyond the declared TTL. Preserve the positive purge
  and exact same-task replay assertions; do not change production expiry.
- Both observed failures are recorded before correction. Re-run real services,
  restored faults and full hosted checks before completion; no inferred pass
  or capacity claim is made.

### T01 verified checkpoint and source reconciliation

- Corrected candidate f5023657 passes all10 CI44890697502 jobs and both
  Integration44890697419 jobs. MySQL8.0.46 and8.4.13 each run all12 native
  files/19 cases with zero skips, then prove the required command rejects
  the altered claim assertion and restores source byte-for-byte.
- Real NATS runs its live mutation/feed/audit case plus five committed recovery
  cases, zero failures. Four explicit MySQL process-recovery counterparts are
  still gated until T02; they are not claimed passed. The actual expired-key
  correction preserves positive GC and same-task replay after real key expiry.
- The exact hosted repository gate passes all36 checks (7 cached) in6m38.838s:
  GUI1764/backend2421/contract1158 and production/standalone builds. CODE-v2
  approves the current source and proof design. No local execution is claimed
  while Cloud startup remains pending.
- PR #16 publishes M58 as main2ebfc34 after all eight final-head checks; its
  tested/published tree is identical. Build this final candidate on that
  published tree plus only owned T01 changes, retaining the saved-view browser
  gates and all completed ledger entries. No branch is force-pushed.
- Check T01 and the real-dependency criterion. M49 is2/6; program399 total,
  391 done, one dropped, seven pending. Final combined-head CI/integration
  still gate PR #17 publication. T02 next proves MySQL two-instance recovery;
  load/capacity and operations documentation remain outstanding.

## M49-T02 — Two-instance recovery and authenticated boundaries

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Exercise the existing recovery cases on both SQL dialects and add two independent API processes sharing a real MySQL schema and an owned JetStream broker.
- **Verified**: T01 source candidate passes both native versions, real SQLite/NATS recovery and the exact full repository command. Ready PR #17 final combined-head checks remain running. This dependent branch starts from0586a920 and preserves all published M58 behavior and records.
- **Notes**: Testing/security plus TDD apply. Own every temporary schema, broker, process and port; keep real human/agent credentials in memory. New persistent behavior is not introduced, so no product ADR or UI redesign is needed. The test plan precedes code. Real SQL/RPC/broker acknowledgements are independent oracles; intentional lost/duplicate audit faults must fail their own assertions and restore source before ordinary checks.
- **Next**: Add the real two-process scenario, enable existing MySQL recovery counterparts in required CI, prove lost/duplicate detection on owned fixtures, review and run full/final hosted gates. Load and capacity remain T03/T04 and are not inferred from these cases.

### Real candidate implementation

- Add the two HTTP API processes, real sessions/scoped workers, audit consumer
  and exclusively owned broker/schema/ports. SQL producer acknowledgement,
  explicit broker replay and consumer acknowledgement precede the logical
  audit count/identity oracle. Reconnect revocation keeps a valid user session
  while denying source reads and domain delivery through a real heartbeat.
- Enable all existing MySQL recovery counterparts in an uncached required
  command that rejects skips. Two temporary projector faults model acknowledged
  lost output and unstable identities that create duplicate rows; only their
  specific outcome failures count as proof, and source restores in finally.
- Parent PR #17 is published as main d7e2e45 after all12 final checks, with
  identical tested/published tree713f673. Include that main as a normal merge
  parent; no force push. Actual candidate checks still gate all completion.

### Rejected source checkpoint and observed regression

- Preserve rejected CODE-v4. Its P1 identifies the enabled atomic MySQL fixture's
  inherited default database, and actual job136812898549 reproduces
  ER_BAD_DB_ERROR / Unknown database tasker. The required recovery wrapper now
  creates and passes only a UUID outer schema, then drops only that schema;
  nested fixtures keep their separate owned schemas.
- Backend job136812898590 also catches a nullable denial assertion type. Add
  an explicit unexpected-success failure before checking the non-null error
  code; no denial outcome is broadened.
- P2 requires independently settled teardown and creation-attempt tracking.
  Write observable filesystem/environment cleanup regressions and an empty
  typed scaffold first; the dedicated hosted step must demonstrate the red
  before implementation. The task remains in progress and no cleanup safety
  or successful recovery pass is claimed yet.

### Cleanup red and correction

- Dedicated job136815090896 runs the new cleanup regressions against the empty
  typed scaffold and fails both real filesystem assertions: Expected false,
  Received true. Test finalizers remove those temporary directories and restore
  their own marker even on red. This establishes the red before implementation.
- Implement settled teardown that attempts every step, restores ambient test
  state in finally and returns aggregated failures. Use it for streams, each
  owned process, both SQL handles, schema, broker and directory. Track the
  broker attempt before Docker and discover only objects carrying this
  fixture's generated ownership label, including partially created containers.
- Fault proofs also reject cleanup aggregates, so an intended outcome failure
  cannot hide failed fixture teardown. The required outer recovery schema is
  already generated and passed explicitly; nested fixtures preserve their
  separate ownership. Re-run actual normal/fault/source gates before approval.

### Observed cold-bootstrap and observer corrections

- Candidate96f7a2a passes MySQL8.0 job136816096622: all12 native
  files/19 cases, all10 recovery cases with zero failures/skips, plus both
  acknowledged audit faults. Dedicated cleanup regressions also pass.
- Overall verification remains red: job136816096628 reproduces the search
  fixture's implicit5000ms cold-bootstrap timeout, followed by overlapping
  migration errors. Set only the required native integration runner's default
  case bound to30000ms; explicit operational latency assertions are unchanged.
  Earlier job136815090966 reproduced the same issue in task bootstrap.
- Job136815090992 reproduces SQLite database-is-locked in the durable-event
  observer. Retry only SQLite BUSY/LOCKED reads with a shared five-second audit
  observation deadline and a50ms observer busy timeout. Missing output and
  non-lock SQL errors still fail. Production settings and event assertions
  are unchanged.
- Job136816096604 passes cleanup behavior but strict types reject the nullable
  environment matcher. Compare the complete marker object, preserving both
  missing and string values without a cast or broadened expectation.
- Prior CODE-v5 source approval is retained separately from these observed
  results. Re-run the corrected source and record a new four-lens review;
  T02 remains in progress until the actual final gates pass.

### Corrected-source results and unresolved worker exit

- Source1d47090 passes both Integration44895096573 jobs, the dependency audit
  and workspace checks. MySQL8.4 job136823295126 executes all12 native files/
  19 cases, the claim-fault proof and the new two-API case successfully.
- Recovery remains9 pass/1 fail: the older MySQL domain-event capture worker
  exits before its first checkpoint with empty stderr. No runtime or resource
  cause is established. GitHub rejects a single unchanged retry request with
 403, workflow run already running; no retry started. Add fixed-label worker
  stage, numeric exit and signal diagnostics without changing any oracle or
  timeout. Preserve the observed failure and re-run the corrected candidate.
- Backend job136823295114 also reproduces TS2769: TypeScript retains the
  earlier explicit environment assignment as string across the callback.
  The object-wrapper matcher still inferred string and did not fix that
  mismatch. Compare exact value identity as a boolean, preserving undefined
  and string outcomes without a cast or broader expectation.
- Preserve rejected CODE-v6 for these observed issues. T02 stays unchecked.
  Dependent draft PR #19 has only T03 acceptance/tests and a typed empty
  scaffold; its independent Bun core job must produce an actual red before
  implementation. No load or capacity result is claimed.
- Cloud startup is now explicitly failed (executor configuration capabilities
  could not be queried). Continue through connected GitHub and hosted Actions;
  no local command, clean-tree check or service execution is claimed.

### T02 verified source and final publication evidence

- All10 CI44897279959 jobs and both Integration44897279964 jobs pass on
  source3410e39. MySQL8.0.46 and8.4.13 each run all12 native files/19 cases,
  all10 required recovery cases without skips, the real claim-failure proof
  and both acknowledged audit-loss/duplicate faults with byte restoration.
- Backend2423/zero failures and strict types pass. The exact hosted repository
  command passes all36 checks (7 cached) in8m1.445s, including GUI1764,
  contract1158 and production/standalone builds. Real browser E2E reports
 103 passes/three existing skips plus strict saved-view types and the native
  intent-fault proof. Rendered checks cover388 stories across light/dark and
  narrow/wide widths with zero accessibility findings, plus zero375px overflow.
- The prior1d47090 worker exit remains unattributed. It does not recur on the
  instrumented source in either required MySQL job; failures now include fixed
  stage, exit and signal diagnostics. No environmental/root-cause fix is
  invented. Exact environment restoration assertions are type-correct.
- CODE-v7 approves the tested source and the narrow per-PR concurrency
  configuration. Completed evidence remains available; each main SHA retains
  its own checks. Temporary cancellation files exist only on the dependent
  load draft and have already been removed there, never added to this task.
- Check T02 and its outcome criterion. M49 is3/6; program399 total/392 done,
  one dropped/six pending. Final-head CI/integration still gate PR #18 merge.
  Source code remains on the published M58/T01 tree, with no force push.
- Resume T03 in draft PR #19/sourcebb90cb8: core7/fault proof pass; its first
  smoke failed before executing because main was absent in shallow Git.
  That checkout is corrected and real HTTP/JSON verification remains pending.
  No load or capacity result is inferred.

## M49-T02 — Reopen recurring ACK-worker fixture correction

- **Status**: done
- **Date**: 2026-11-21
- **Observed**: Final job136843138595 reproduces exit0/signal none/stage ready
  in the ack-pause worker at its real broker-ACK checkpoint. The earlier
  source3410e39 did pass all12 checks; the final-head gate correctly catches
  that the failure can recur. No root-cause attribution to OOM or the Cloud
  environment is made.
- **Approach**: The worker currently uses a one-shot sweep and can finish
  without reaching any ACK. This scenario must instead use the production
  recurring relay until its actual ACK callback writes the checkpoint.
  Defer owned source eligibility by one second in the fixture to exercise
  waiting, preserving the existing parent watchdog and every ACK/outcome
  assertion. Ordinary one-shot relay-result workers remain one-shot.
- **Next**: Implement this fixture correction after the observed red, retain
  rejected CODE-v8 and re-run required services/faults and final gates.
  Reopen T02/its criterion; M49 is2/6,399 total/391 done/one dropped/seven pending.

### Recurring worker implementation after observed red

- The ACK-pause worker now starts the existing production recurring runtime
  and remains alive until the genuine publish-ACK callback pauses it. It
  does not write the continuous-worker readiness sentinel into the ACK
  checkpoint. Parent watchdogs, kill point and all identity/count assertions
  remain unchanged.
- This fixture deliberately defers its owned source eligibility by1000ms
  immediately before starting that runtime, covering a valid empty initial
  sweep. No production clock, backoff or lease is changed. Ordinary relay
  result probes remain one-shot; broker-reconnect workers retain their
  readiness checkpoint.
- Preserve exit/signal diagnostics and add waiting-for-ack as a fixed stage.
  Re-run both required dialect jobs and fault proofs before closure; no
  successful result is inferred from the implementation.

### Final recurring-worker verification and atomic publication candidate

- Sourcee321baae passes all10 CI44904756478 jobs and both real
  Integration44904756494 jobs. MySQL8.0.46 and8.4.13 each execute19 native
  cases across12 files and all10 required recovery cases with zero required
  skips. Both execute the claim-failure proof and real acknowledged audit
  loss/duplicate faults, restoring source bytes.
- The intentionally1000ms-deferred source reaches its actual ACK checkpoint
  through the production recurring relay. Ordinary one-shot result probes
  remain unchanged. This resolves the lifecycle defect recorded in CODE-v8;
  no environmental cause or unrelated production fix is invented.
- The hosted exact moon check --all completes36 tasks (7 cached) in
 5m8.386s. Backend types/tests, GUI tests/build, CLI checks and standalone
  smoke pass. Real E2E and saved-view type/native-fault checks pass. Rendered
  checks cover388 stories in both themes and widths with zero accessibility
  violations; the375px overflow pass also has zero findings.
- CODE-v9 approves source correctness, coverage, architecture and security.
  Preserve all rejected reviews and observed failures. Cloud execution remains
  unavailable, so no local tests or local clean-tree result are claimed.
- Assemble this completed task as one atomic commit from main d7e2e45, including
  code, tests, checked criterion/task, journal and state. Final combined-head
  CI still gates publication; this entry does not claim a main merge.
  M49 is3/6;399 tasks/392 done/one dropped/six pending. T03–T05 continue on
  the reviewable work branch with their independent evidence/gates.

## M49-T03 — Bounded HTTP concurrency evidence

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Prepare a standalone bounded workload against disposable MySQL and
  an owned broker, with actual independent API processes and distinct scoped
  agent principals. The recovery candidate remains separately gated in PR #18.
- **Verified**: No load implementation or capacity result is claimed. The test
  plan precedes code; core configuration, observed latency and source-outcome
  reconciliation tests will first run against a typed empty scaffold.
- **Notes**: Testing/security plus TDD apply. Existing HTTP adapters, SQL, NATS,
  token generation and owned cleanup suffice; no new dependency or runtime
  protocol is introduced, so a product ADR and UX artifact are unnecessary.
  Concurrency/duration/fixture/instance/seed/operation bounds are explicit.
  Credentials stay in memory; only internally generated resources are removed.
- **Next**: Establish the actual failing core tests, implement the minimal
  harness and exercise a small correctness smoke. Separate T04 stages and
  published capacity claims require their own measured artifacts.

### Independent core-test feedback

- The core scaffold/tests import only Bun built-ins and the local helper.
  Their dedicated job therefore needs no package install, generated contract
  or service. Run it independently of the shared-contract queue, retaining
  all ordinary backend, native SQL, browser and full repository gates.
- This is still the failing-test checkpoint. No measurement implementation or
  passing red/green evidence is inferred from the job configuration.

### Actual core red before implementation

- Independent job136823008841 on source9f036827 executes the intended scaffold:
  one invalid-input case passes and six public configuration/latency/source-
  reconciliation cases fail with their specific not-implemented errors. No
  package, contract or service error accounts for this red.
- Implement only bounded option parsing, observed nearest-rank quantiles and
  independent source reconciliation. The real HTTP harness and smoke remain
  in progress. Merge corrected T02 parent3410e39 normally; preserve its
  observed failures/review and all T03 preparation. No branch is force-pushed.

### Real HTTP harness implementation candidate

- Add the bounded Linux/loopback command with one actual scoped principal per
  caller, requested independent API PIDs, stable create/replay/get operations
  and preserved production rate/pool limits. Timed parent SQL queries own a
  generated schema; each fixture broker carries a generated ownership label.
- Setup is outside measurement. Record actual actor/fixture counts, all/success/
  first-write quantiles, stage error codes, throughput, sampled own-PID memory,
  hardware/cgroup/runtime versions, queue observations and uncertain outcomes.
  Credentials and raw driver/event data never enter the JSON or diagnostics.
- Settle calls and drain measured APIs before independent SQL/source/audit
  oracles. Any needed recovery API is separately reported and excluded from
  throughput. Normal/error/graceful-signal cleanup attempts every owned
  resource and restores ambient state. Force-kill remains outside graceful
  cleanup guarantees.
- Add strict script typechecking to Moon/full CI and affected input hashes.
  Keep the pure core job independent and prove that bypassed input validation
  fails its actual assertion with byte-for-byte restoration. Add a real
  four-caller/two-API smoke with positive report-contract checks and retained/
  logged aggregate JSON. These checks are configured, not yet claimed passed.
- Document the command and limits in docs/performance.md; link it from README
  and remove the now-obsolete statement that no load command exists. No
 100/1000/20000 caller capacity result is claimed; T04 owns staged evidence.
- Source3410e39 (T02) passes both integration jobs, audit and contract; its
  corrected normal/fault/type/full gates remain queued. T03 core sourcef6aa796
  also awaits hosted green. Both tasks remain unchecked.

### Independent smoke feedback and complete timing

- The smoke provisions/installs its own tools, dependencies and services and
  consumes the committed contract. Run it independently; the contract and all
  existing repository gates still separately gate publication. This removes
  an ordering dependency, not a verification requirement.
- Report setup, request settlement, post-measurement observation, API drain,
  recovery, SQL/audit reconciliation and cleanup separately, with total time
  through cleanup. Keep request throughput tied to its measured phase.
  The smoke requires actual positive setup/total timing as well as its other
  independent observations.
- Clarify that teardown attempts every owned resource and a cleanup failure
  fails the run; force-kill cannot guarantee graceful cleanup. Results remain
  pending, not inferred.

### Superseded CI backlog

- The actual read-only preview verifies the fixed run IDs, branch/head identity,
  PR ownership and workflow paths. Completed runs are excluded. Current PR #18
  head3410e39 and PR #19 headf3a6988 are protected by current-head checks; main
  is outside the allowlist. A new maintenance head makes the old PR #19 source
  replaceable while preserving current source3410e39 on PR #18.
- GitHub's public status reports operational Actions/no open incident, so no
  global outage or billing cause is inferred. This task has several obsolete
  queued runs; remove that known backlog, not unrelated account work.
- The connected GitHub tools have no cancel action, browser control is not
  exposed, and the Cloud executor failed. Add a temporary same-repository/
  PR19-only Bun maintenance job with actions-write and read-only content/PR
  access. It revalidates every fixed candidate and current head before cancel,
  preserves completed evidence, and stops if its own head is superseded.
  No token, response body or credential is printed.
- Permanent per-PR concurrency prevents future superseded check accumulation;
  each main SHA has its own group and main checks are never cancelled.
- Remove both temporary maintenance files before final publication. Actual
  cancellation results and ordinary final-head checks remain required.

### Verified core/fault and backlog cleanup; smoke setup correction

- Job136834841208 passes all seven core cases and the actual bypassed-input
  assertion proof, with source restored byte-for-byte. The earlier source's
  pure core job136826871810 also passes all seven with100% lines/functions.
- Maintenance job136834841091 requests four cancellations and skips eight
  completed/current candidates. Fresh API reads confirm all four selected
  runs are completed/cancelled. Current PR #18/source3410e39 and main are
  preserved. Remove both temporary maintenance files; no actions-write token
  permission or maintenance code is retained in the final implementation.
- First smoke job136834841212 fails before typechecking or workload execution:
  Moon cannot resolve main in a shallow checkout (git128). No load result or
  artifact exists. Give only this Moon-using job the same fetch-depth0 as the
  repository's other Moon jobs. Keep every smoke oracle and budget.
- Source3410e39 now passes the exact36-task gate (8m1.445s), backend2423,
  MySQL8.4 native19/recovery10/both audit faults, native8.0 and the real E2E/
  standalone checks; its final rendered GUI job is still running. T02 remains
  unchecked until that actual final result. T03 also remains in progress.

### Real smoke and late-commit oracle test before correction

- Actual job136838106023 on sourcebb90cb8 completes20/20 logical operations,
 60 RPCs and20 acknowledged/persisted task/producer/audit records, with no
  request or correctness errors and no cleanup failures. Four actual callers
  use two API PIDs. The355.819ms request phase is a tiny correctness smoke,
  not sustained capacity evidence; its624.150ms recovery tail is separate.
- Review asks whether API-process exit alone proves that server SQL commits
  have settled before the final outcome snapshot. Add a controlled late SQL
  transaction at the final-oracle boundary, require a real commit marker and
  require the checker to reject the unattempted persisted task. Restore the
  harness bytes in finally. Run this test against the current checker before
  changing its implementation; no missed-write defect is inferred yet.
- Incorporate T02 final candidate52d4680 as a normal merge parent, preserving
  its completed task/review and392-done ledger. PR #18 publication still has
  its own final-head gates. T03 remains unchecked and staged load stays T04.

### Actual late-commit red and SQL-session barrier

- Job136844676136 executes the deliberate late transaction and records:
  exitCode0, committed true, checked true, unexpected0, valid true and
  cleanupFailures0. The final oracle incorrectly reports success from its
  earlier snapshot. This is a real checker defect, observed before correction.
- After API/recovery drain and genuine broker acknowledgement, stop the
  projector and wait for every other SQL session in this generated schema to
  close. Only the controller's observer connection remains. Then read the
  source/audit snapshots and include any remaining pending producer count in
  correctness. Record SQL drain separately from API/recovery/oracle timing.
- Keep the same late-commit fault, real commit marker, unexpected-row assertion
  and byte restoration. Re-run ordinary smoke plus the negative proof; no
  green result is inferred. No production handler or transaction is changed.
- Merge T02 correctione321baa normally and preserve its reopened391-done/
  seven-pending ledger, CODE-v8 rejection and recurring ACK-worker regression.

### T03 final verified command and atomic publication candidate

- Source 2e8b14b passes all 18 non-skipped hosted checks: CI 44908965532,
  Integration 44908965496, packaging 44908965509 and staged/recovery
  44908965538. Tag-only release jobs are intentionally skipped.
- Exact moon check --all completes 37 checks (7 cached) in 7m23.324s;
  backend 2430, GUI 1764 and contract 1158 pass. Native MySQL 8.0.46/8.4.13
  each execute 19 native and ten recovery cases plus actual failure proofs.
  E2E is 103 passes/three existing skips; 388 rendered stories have no
  accessibility or 375px overflow findings.
- Seven core tests and the bypassed-input fault pass. Actual late-SQL red
  job 136844676136 first returned valid after an unattempted commit; the
  corrected SQL-session barrier now rejects it with unexpected 1/exit 1
  and cleanup zero, restoring bytes. The ordinary smoke remains positive.
- Retain fixed phase diagnostics after the observed uncompleted larger runs;
  no underlying service/runtime cause is invented. T04 publishes every
  measured stage and its external watchdog, including severe saturation.
- CODE-v10 approves correctness, coverage, architecture and security.
  This atomic task commit contains implementation, tests, checkbox, journal
  and ledger together. M49 is 4/6; program 393 done/one dropped/five pending.
  Final combined-head gates still precede main publication.

## M49-T04 — Staged caller and recovery experiments

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Prepare hosted, disposable-service experiments using the T03
  controller unchanged: a four-caller correctness baseline followed by100
  and1000 distinct callers, two API processes,1000 existing tasks and a
  fifteen-second admission window bounded at3000 logical operations per stage.
- **Verified**: T03 source282f72f smoke job136849580992 passes20/20 real
  logical operations,60 RPCs, matching20 task/source/audit records and no
  correctness or cleanup failures. Its late-SQL fault actually commits and
  exits1 with unexpected1/valid false/cleanup0; source bytes are restored.
  That small smoke is not a capacity result. Full source gates remain pending.
- **Plan**: Run stages sequentially on the same named hosted hardware. Stop
  escalation on correctness, cleanup or bootstrap failure; retain every
  completed JSON and fixed failure phase. Transport errors remain saturation
  evidence. Follow completed stages with the existing real MySQL/NATS
  cross-process recovery and audit-loss/duplicate fault proofs on that host.
  These are separate recovery experiments, not faults during1000-caller load.
- **Limits**: Preserve production limiter/pool defaults. Report requested and
  observed peak callers, duration including settlement, data size, throughput,
  success/all latency, error codes, uncertain commits, memory and queue
  observations. No20000, sustained, multi-host or streaming capacity claim.
- **Notes**: This task adds execution configuration and static evidence, not
  new controller behavior; the TDD protocol's pure-configuration exception
  applies. Existing controller tests, actual fault proofs and final gates
  remain required. The failed Cloud environment prevents local execution;
  hosted Actions is the explicit evidence source.
- **Next**: Configure and execute the bounded stages, publish their actual
  results and review evidence before checking T04. Keep T02/T03 unchecked
  until their independent current-source gates pass.

## M49-T05 — Repository-pinned CI and packaging toolchains

- **Status**: done
- **Date**: 2026-11-21
- **Observed**: CI selects a floating Node24 while .prototools still names
 24.12.0; release.yml selects latest Bun and a floating Moon setup action.
  The real integration jobs do not explicitly select Node. These paths can
  test/package different runtimes from the repository pins.
- **Approach**: Read and verify the exact Node pin through a local composite
  action, use the existing pinned Bun/Moon actions in release packaging, and
  select Node explicitly in integration/capacity jobs. Preserve Go's exact
  go.mod selection. Broaden full-gate detection to all workflow configuration.
- **Research**: Official Node releasev24.22.3, published2026-11-11, is a
  security release in the already-selected24 line:
  <https://github.com/nodejs/node/releases/tag/v24.22.3> .
  Update the old24.12.0 pin and tech-stack record to24.22.3 rather than freezing
  an obsolete patch. No new dependency, runtime family or advisory suppression.
- **Verify**: Actual setup must print and compare the selected version.
  Require exact hosted moon check --all, native services, browser E2E,
  rendered UI and standalone smoke; retain reports/artifacts. This is pure
  configuration, so no constant-mirroring TDD test is added. No release tag,
  published binary release or deployment is requested or performed.
- **Next**: Implement pinned selection/report retention and verify the final
  publication candidate. Keep T05 and all unfinished task boxes unchecked.

### Pinned packaging and observed smoke verification

- Source 35b8d33 uses Node 24.22.3, Bun 1.3.11 and Moon 2.4.6.
  Release run 44907118503 passes all three packaging targets; Linux also
  executes the standalone smoke. Both tag-only publishing jobs are skipped.
  The Node action actually prints and compares v24.22.3.
- Both Integration 44907118610 jobs pass. CI 44907118504 passes dependency
  audits, contract compilation, seven core cases/input fault, the real HTTP
  smoke and late-SQL fault. The smoke completes 20 logical workflows with
  matching task/source/audit records and cleanup zero. The late transaction
  actually commits and is rejected with unexpected 1, exit 1 and cleanup zero;
  the proof restores source bytes. Full 37-check/native/browser/rendered gates
  are still running or queued; no final result is inferred.
- Staged runs 44906822995 (initial controller source) and 44907118491
  (pinned-toolchain checkout) remain inside their sequential caller step.
  The first started that step at 13:06:36 UTC and has exceeded twelve minutes.
  The fifteen-second value bounds admission, not total setup/recovery/cleanup.
  Final logs are unavailable while active. Do not invent a cause or publish
  a capacity figure; each job retains its 25-minute external watchdog.
- T02 source e321baae passes all ten CI and both integration jobs, including
  both MySQL versions, native 19/recovery 10 and actual fault proofs. CODE-v9
  and its atomic completed-task candidate are on feature/m49-production-final,
  commit 9f0eba8. Blob comparison proves that only milestone metadata/review
  differ from the tested source. This work branch retains the reopened ledger
  until its task results are assembled atomically on that publication branch.
- Main remains d7e2e45: 391 done, one dropped and seven pending. Publication
  candidate T02 is 392 done/six pending and has not been merged. Keep both
  levels explicit. PR #18 and draft #19 now describe the actual evidence.
- Source audit for M50 identifies stale architecture, API unary-only and
  missing-scanner claims; roadmap M47/M53–M58 statuses also drift. Prepare an
  offline SQLite and disposable MySQL backup/restore rehearsal that checks
  exact restored identities and rejects a deliberately broken backup.
  Do not start M50 implementation before M49's dependency is satisfied.

### Observed documentation gate and link correction

- Workspace job 136856196396 on source 35b8d33 fails the real Markdown
  gate on exactly two MD034 bare-URL findings: the official Node release
  reference here and in tech-stack.md. All 24 harness-contract tests pass;
  this is a documentation-format defect, not a Node/runtime failure.
- Wrap those primary-source references in valid Markdown autolinks. No lint
  rule or runtime/source assertion changes. Advance draft PR #19 normally
  with this correction and the committed handoff; standard per-PR concurrency
  replaces superseded checks and preserves their completed/interrupted logs.
- Inspect interrupted staged evidence for the observed long runtime before
  attributing it to a controller, service or resource cause. Initial staged
  push run 44906822995 remains unaffected and retains its external watchdog.

### Actual 100-caller evidence and uncompleted 1000-caller stage

- Interrupted pinned job 136854961314 retains two complete positive reports.
  Its 100-caller stage uses 100 actual principals/peak active operations, two
  API PIDs and 1000 existing tasks on a four-vCPU AMD EPYC 9V74 runner with
  16759431168 bytes host RAM. Bun 1.3.11, MySQL 8.4.13 and NATS 2.10.29.
- All 1508 attempted logical workflows complete, with 4524 RPCs, matching
  1508 task/source/audit rows, zero request/correctness/cleanup failures and
  no uncertain outcomes. Request settlement is 15.421865s, throughput
  97.783247 workflows/s, p50/p95/p99 993.221/1445.677/1934.209ms.
  Separate recovery is 19.604031s; total is 41.277869s.
- API sampled RSS peaks at 577028096 bytes, generator at 175022080; producer
  pending peaks at 963, consumer unacked at two, with zero read failures.
  The recovery API drains 962 pending source rows to zero. These short,
  one-host/one-project results are not sustained capacity or all-endpoint
  latency evidence. The aggregate report checkout is b9cb15c, source 35b8d33.
- The subsequent 1000-caller command has no completed JSON when superseded.
  Its unresolved phase is not assigned a service/controller/resource cause.
  The initial push-based run remains active under its 25-minute job bound.
- Add fixed non-sensitive controller phase diagnostics and a per-stage
  240-second external watchdog with 45-second graceful termination allowance.
  Preserve failed/partial reports and stop escalation; force-kill cannot
  guarantee controller cleanup and never counts as valid measurement.
  No operational deadline or correctness assertion is relaxed.
- This is fixture diagnostics and execution configuration after the observed
  uncompleted run, not a production behavior change. T03/T04 remain unchecked;
  inspect the actual diagnostic run before proposing a runtime fix.

### Preserve the completed stage as reviewable evidence

- Commit the exact 100-caller aggregate JSON and a sourced table in
  docs/performance.md. Name the cancelled parent job, the completed stage,
  actual checkout, hardware, dataset, defaults and separate recovery tail.
  The incomplete 1000-caller stage and unrun later failure steps remain open.
- Preserve uncertainty and all limitations. A zero-error short stage does
  not establish steady-state queue stability or maximum supported capacity.

### Preserve the initial host observation too

- Initial job 136854082350 reaches its external job deadline after the later
  1000-caller command produces no completed report. Its already-completed
  100-caller stage is valid evidence: 1174 workflows, 3522 RPCs, zero request/
  correctness/cleanup failures, 75.042356 workflows/s and p95 1979.019ms.
- Retain that exact JSON beside the faster AMD-host observation, name its
  Intel Xeon 8573C hardware and separate 13.689327s recovery tail. Do not
  cherry-pick the faster host or infer a controlled comparison. The active
  diagnostic run, T03/T04 closure and final publication remain pending.

### Actual staged saturation and separate recovery results

- Job 136860547110 on source 2e8b14b/checkout 18ae2c6 completes all three
  stages with valid SQL/source/audit reconciliation and cleanup zero, then
  all ten required recovery cases and both actual audit faults pass.
- On the same four-CPU Xeon 6973P-C host, 100 callers complete all 1701
  workflows without errors in a 15.363392s request phase (110.717737/s,
  successful p95 1293.429ms), followed by 22.585613s separate recovery.
- At 1000 actual/peak callers, the 3000-operation cap is exhausted before
  15 seconds: only 57 workflows complete, 2943 request errors remain, and
  successful p95 is 7081.129ms. There are 822 acknowledged first writes,
  194 unacknowledged but committed intents and 1984 absent intents. All 1016
  final task/source/audit rows reconcile with zero lost/duplicate/changed
  outcomes. No request error or uncertain outcome is suppressed.
- Preserve exact JSON for all three verified stages and both earlier
  100-caller hosts. Lead docs/performance.md with saturation, not a healthy
  1000-caller claim. Recovery runs after load, not during it. Neither earlier
  incomplete 1000-caller run is assigned a root cause; the diagnostic change
  does not claim a production fix. Final full/native/browser gates and
  four-lens task closure remain required before main publication.

### Final workflow scope and handoff

- The staged experiment is actual green evidence, including the severe
  saturation result and separate failure experiments. Keep source 2e8b14b's
  remaining checks running while preparing evidence-only publication edits.
- Remove the initial feature-branch push trigger. The permanent workflow is
  available manually and on main/PR changes to the harness or pinned toolchain;
  ordinary backend changes retain their existing real-service/native gates.
- Use the tested CI/integration concurrency pattern here too: each main SHA
  gets a distinct group, so an older pending main proof cannot be replaced by
  a newer pending one. PR checks alone cancel superseded work. The final
  combined-head workflow still gates publication; no test rule is disabled.

### T04 final evidence review and atomic publication candidate

- CODE-v11 approves the exact staged data, explicit saturation boundary,
  retained earlier observations and separate failure experiments. All
  18 source checks pass, including exact 37 checks in 7m23.324s.
- Publish all five aggregate JSON records without modification. The latest
  1000-caller record is a valid correctness measurement with only 57/3000
  complete workflows; 2943 request errors remain visible. Its 194 later
  confirmed commits are not described as acknowledged successes.
- Preserve the two earlier incomplete 1000-caller commands without assigning
  a root cause. The external stage watchdog and fixed phase markers are
  diagnostic/fixture controls, not a claimed production performance fix.
- The permanent workflow removes the one-off branch trigger, preserves each
  main SHA's proof and cancels only superseded PR work. Failure/recovery
  experiments are after the stages, not concurrent with the burst.
- This completed task is atomic with its workflow, data, docs, checked box,
  journal and ledger. M49 is 5/6; program 394 done/one dropped/four pending.
  T05 and final combined-head publication remain required.

### T05 final runtime/release gates and M49 closure candidate

- Official Node 24.22.3 security-release evidence and the actual version
  comparison align CI, integration, staged measurement and packaging with
  .prototools. Existing exact Bun/Moon actions are reused; Go continues to
  read the exact module minimum. No advisory or required gate is suppressed.
- All 18 non-skipped source checks pass on 2e8b14b/checkout 18ae2c6:
  CI 44908965532, Integration 44908965496, Release 44908965509 and
  staged/recovery 44908965538. Exact moon check --all completes 37 checks
  (7 cached) in 7m23.324s. Report artifact 14709696689 is retained.
- Each MySQL version runs native 19/recovery ten and actual claim/audit fault
  proofs without required skips. E2E 103/three existing skips, strict browser
  types/native-intent fault, 388-story accessibility/375px overflow, standalone
  smoke and all three cross-compiled packaging targets pass. Only Linux
  artifacts execute here; native Windows/macOS execution is not claimed.
  Tag-only release publication jobs are intentionally skipped.
- Actual Markdown gate job 136856196396 first rejects two bare official
  release URLs. Valid autolinks fix those findings; the unchanged Markdown,
  harness and specification/doc-drift gates pass on the verified source.
- CODE-v12 approves correctness, coverage, architecture and security. Four
  completed-task commits now contain T02/T03/T04/T05 code/tests/evidence and
  their own checked boxes/journal/ledger. M49 is 6/6 with all four criteria;
  program 395 done/one dropped/three pending. Main remains unchanged until
  final combined-head CI and publication; no local clean-tree claim.
- Next is M50-T01 on this verified dependency candidate: architecture,
  standards, roadmap/integration truth and an exercised recovery runbook.
