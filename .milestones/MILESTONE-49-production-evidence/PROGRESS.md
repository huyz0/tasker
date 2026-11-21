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

- **Status**: in-progress
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
